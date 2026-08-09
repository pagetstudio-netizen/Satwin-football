import type { Express, Request, Response, NextFunction } from "express";
import { createServer, type Server } from "http";
import session from "express-session";
import { storage } from "./storage";
import bcrypt from "bcryptjs";
import { registerSchema, loginSchema, depositSchema, walletSchema, phoneNumberSchema, matches, bets, planBUsers } from "@shared/schema";
import { db } from "./db";
import { eq as eqOp, and as andOp, asc as ascOp, desc as descOp, sql, inArray } from "drizzle-orm";
import { z } from "zod";
import ConnectPgSimple from "connect-pg-simple";
import { 
  initiatePayment, 
  verifyPayment, 
  isSoleaspaySupported, 
  mapSoleaspayStatus,
  SOLEASPAY_SERVICE_MAP 
} from "./soleaspay";
import {
  createPayment as sendavapayCreate,
  initiatePayment as sendavapayInitiate,
  submitOtp as sendavapaySubmitOtp,
  retryPayment as sendavapayRetry,
  verifyPayment as sendavapayVerify,
  verifyWebhookSignature as sendavapayVerifySignature,
  mapSendavapayStatus,
  formatPhone as sendavapayFormatPhone,
  getCurrency as sendavapayGetCurrency,
  toSendavapayCountry,
} from "./sendavapay";
import * as ashtechpay from "./ashtechpay";
import express from "express";
import {
  fetchUpcomingFixtures,
  fetchLiveFixtures,
  fetchFixtureById,
  liveScoreStr,
  isFinished,
  isInPlay,
} from "./apiFootball";

// --- Brute-force protection (in-memory) ---
const loginAttempts = new Map<string, { count: number; blockedUntil: number }>();
const MAX_LOGIN_ATTEMPTS = 5;
const BLOCK_DURATION_MS = 15 * 60 * 1000; // 15 minutes

function getClientKey(req: Request): string {
  const forwarded = req.headers["x-forwarded-for"];
  const ip = typeof forwarded === "string" ? forwarded.split(",")[0].trim() : req.socket.remoteAddress || "unknown";
  return ip;
}

function checkBruteForce(req: Request, res: Response): boolean {
  const key = getClientKey(req);
  const now = Date.now();
  const record = loginAttempts.get(key);
  if (record && record.blockedUntil > now) {
    const minutesLeft = Math.ceil((record.blockedUntil - now) / 60000);
    res.status(429).json({ message: `Trop de tentatives. Réessayez dans ${minutesLeft} minute(s).` });
    return true;
  }
  return false;
}

function recordFailedAttempt(req: Request) {
  const key = getClientKey(req);
  const now = Date.now();
  const record = loginAttempts.get(key) || { count: 0, blockedUntil: 0 };
  record.count += 1;
  if (record.count >= MAX_LOGIN_ATTEMPTS) {
    record.blockedUntil = now + BLOCK_DURATION_MS;
    record.count = 0;
  }
  loginAttempts.set(key, record);
}

function clearFailedAttempts(req: Request) {
  loginAttempts.delete(getClientKey(req));
}
// --- end brute-force protection ---

declare module "express-session" {
  interface SessionData {
    userId: number;
  }
}

const PgSession = ConnectPgSimple(session);
// Prefer Supabase for sessions too — same DB as the rest of the app
const sessionDatabaseUrl = process.env.SUPABASE_DATABASE_URL || process.env.DATABASE_URL;
const sessionSecret = process.env.SESSION_SECRET;

if (!sessionDatabaseUrl) {
  throw new Error("No database URL configured for session storage.");
}
if (!sessionSecret) {
  throw new Error("SESSION_SECRET must be configured.");
}

/** Log the real error server-side, return a generic message to the client */
function serverError(res: Response, e: any, label = ""): void {
  console.error(`[serverError${label ? " " + label : ""}]`, e?.message || e);
  res.status(500).json({ message: "Erreur serveur" });
}

const SENSITIVE_SETTING_KEYS = new Set([
  "sendavapayWebhookSecret",
  "omnipayCallbackKey",
]);
const PUBLIC_SETTING_KEYS = new Set([
  "supportLink", "supportType", "supportLabel",
  "support2Link", "support2Type", "support2Label",
  "channelLink", "channelType", "channelLabel",
  "groupLink", "groupType", "groupLabel", "noticeText",
  "supportEnabled", "support2Enabled", "channelEnabled", "groupEnabled",
  "signupBonus", "minDeposit", "minWithdrawal", "withdrawalFees",
  "maxWithdrawalsPerDay", "withdrawalStartHour", "withdrawalEndHour",
  "level1Commission", "level2Commission", "level3Commission",
  "sendavapayEnabled", "sendavapayChannelName",
  "ashtechpayEnabled", "ashtechpayChannelName", "ashtechpayCountries",
  "depositBonusEnabled", "depositBonusPercent", "depositBonusDays",
]);
const ADMIN_SETTING_KEYS = new Set([
  ...Array.from(PUBLIC_SETTING_KEYS),
  "sendavapayWebhookSecret", "omnipayCallbackKey",
]);
const MASKED_SETTING_VALUE = "********";

function publicSettings(settings: Record<string, string>) {
  return Object.fromEntries(
    Object.entries(settings).filter(([key]) => PUBLIC_SETTING_KEYS.has(key)),
  );
}

function adminSettings(settings: Record<string, string>) {
  return Object.fromEntries(
    Object.entries(settings)
      .filter(([key]) => ADMIN_SETTING_KEYS.has(key))
      .map(([key, value]) => [
      key,
      SENSITIVE_SETTING_KEYS.has(key) && value ? MASKED_SETTING_VALUE : value,
      ]),
  );
}

// ── Bonus dépôt (mardi=2, mercredi=3, vendredi=5) ─────────────────────────────
async function applyDepositBonus(userId: number, depositAmount: number, depositId: number): Promise<void> {
  try {
    const settings = await storage.getSettings();
    if (settings.depositBonusEnabled !== "true") return;
    const allowedDays = (settings.depositBonusDays || "1,3,5")
      .split(",").map((d: string) => parseInt(d.trim(), 10)).filter((n: number) => !isNaN(n));
    const today = new Date().getDay(); // 0=dim,1=lun,2=mar,3=mer,4=jeu,5=ven,6=sam
    if (!allowedDays.includes(today)) return;
    const bonusPct = parseFloat(settings.depositBonusPercent || "5");
    const bonusAmount = Math.round(depositAmount * bonusPct / 100);
    if (bonusAmount <= 0) return;
    const user = await storage.getUser(userId);
    if (!user) return;
    await storage.updateUser(userId, { balance: (parseFloat(user.balance) + bonusAmount).toFixed(2) });
    await storage.createTransaction({
      userId,
      type: "bonus",
      amount: bonusAmount.toString(),
      description: `Bonus dépôt ${bonusPct}% — Dépôt #${depositId}`,
    });
  } catch (e) {
    console.error("[bonus] Erreur bonus dépôt:", e);
  }
}

function validatePhone(value: unknown, fieldName: string): string {
  const result = phoneNumberSchema.safeParse(value);
  if (!result.success) {
    throw new Error(`${fieldName} invalide`);
  }
  return result.data;
}

/** Strip ALL sensitive server-only fields before sending a user object to the client. */
function safeUser(user: Record<string, any>) {
  const {
    password,
    adminPin,
    isAdminPasswordRequired,
    isBanned,          // internal moderation flag — not needed client-side
    ...safe
  } = user;
  return safe;
}

function requireAuth(req: Request, res: Response, next: NextFunction) {
  if (!req.session.userId) {
    return res.status(401).json({ message: "Non authentifié" });
  }
  next();
}

async function requireAdmin(req: Request, res: Response, next: NextFunction) {
  if (!req.session.userId) {
    return res.status(401).json({ message: "Non authentifié" });
  }
  const user = await storage.getUser(req.session.userId);
  if (!user?.isAdmin) {
    return res.status(403).json({ message: "Accès refusé" });
  }
  next();
}

async function requireBanker(req: Request, res: Response, next: NextFunction) {
  if (!req.session.userId) {
    return res.status(401).json({ message: "Non authentifié" });
  }
  const user = await storage.getUser(req.session.userId);
  if (!user?.isAdmin && !user?.isBanker) {
    return res.status(403).json({ message: "Accès refusé" });
  }
  next();
}

export async function registerRoutes(
  httpServer: Server,
  app: Express
): Promise<Server> {
  
  // Trust proxy for production HTTPS (Replit deployment)
  app.set("trust proxy", 1);

  app.use(
    session({
      store: new PgSession({
        conString: sessionDatabaseUrl,
        tableName: "session",
        createTableIfMissing: true,
        pruneSessionInterval: 60 * 60,
        ssl: process.env.SUPABASE_DATABASE_URL ? { rejectUnauthorized: false } : false,
      }),
       secret: sessionSecret as string,
      resave: false,
      saveUninitialized: false,
      cookie: {
        secure: process.env.NODE_ENV === "production",
        httpOnly: true,
        maxAge: 30 * 24 * 60 * 60 * 1000, // 30 days
        sameSite: process.env.NODE_ENV === "production" ? "none" : "lax",
      },
    })
  );

  // Auth routes
  app.post("/api/auth/register", async (req, res) => {
    try {
      const data = registerSchema.parse(req.body);

      // Validate that the selected country is active and configured by admin
      const activeCountries = await storage.getActiveCountries();
      const validCountry = activeCountries.find(c => c.code === data.country);
      if (!validCountry) {
        return res.status(400).json({ message: "Pays non supporté. Veuillez sélectionner un pays valide." });
      }

      const existing = await storage.getUserByPhone(data.phone, data.country);
      if (existing) {
        return res.status(400).json({ message: "Ce numéro est déjà utilisé" });
      }

      let referredBy: string | undefined;
      if (data.invitationCode && data.invitationCode.trim()) {
        const cleanCode = data.invitationCode.trim().toUpperCase();
        const referrer = await storage.getUserByReferralCode(cleanCode);
        if (!referrer) {
          return res.status(400).json({ message: "Code d'invitation invalide" });
        }
        referredBy = cleanCode;
      }

      const user = await storage.createUser({
        fullName: data.fullName,
        phone: data.phone,
        country: data.country,
        password: data.password,
        referredBy,
      });

      req.session.userId = user.id;
      res.json({ user: safeUser(user) });
    } catch (error: any) {
      if (error instanceof z.ZodError) {
        return res.status(400).json({ message: error.errors[0].message });
      }
      serverError(res, error);
    }
  });

  app.post("/api/auth/login", async (req, res) => {
    if (checkBruteForce(req, res)) return;
    try {
      const data = loginSchema.parse(req.body);

      // Only username-based lookup — phone login is disabled
      const user = await storage.getUserByFullName(data.username);

      if (!user) {
        recordFailedAttempt(req);
        return res.status(400).json({ message: "Identifiants incorrects" });
      }

      const validPassword = await bcrypt.compare(data.password, user.password);
      if (!validPassword) {
        recordFailedAttempt(req);
        return res.status(400).json({ message: "Identifiants incorrects" });
      }

      if (user.isBanned) {
        return res.status(403).json({ message: "Compte suspendu" });
      }

      clearFailedAttempts(req);
      req.session.userId = user.id;
      res.json({ user: safeUser(user) });
    } catch (error: any) {
      if (error instanceof z.ZodError) {
        return res.status(400).json({ message: error.errors[0].message });
      }
      serverError(res, error);
    }
  });

  app.get("/api/auth/me", async (req, res) => {
    if (!req.session.userId) {
      return res.status(401).json({ message: "Non authentifié" });
    }
    const user = await storage.getUser(req.session.userId);
    if (!user) {
      return res.status(401).json({ message: "Non authentifié" });
    }
    res.json({ user: safeUser(user) });
  });

  app.post("/api/auth/logout", (req, res) => {
    req.session.destroy(() => {
      res.json({ success: true });
    });
  });

  app.post("/api/change-password", requireAuth, async (req, res) => {
    try {
      const { currentPassword, newPassword } = req.body;
      
      if (!currentPassword || !newPassword) {
        return res.status(400).json({ message: "Veuillez remplir tous les champs" });
      }

      if (newPassword.length < 6) {
        return res.status(400).json({ message: "Le nouveau mot de passe doit contenir au moins 6 caracteres" });
      }

      const user = await storage.getUser(req.session.userId!);
      if (!user) {
        return res.status(404).json({ message: "Utilisateur non trouve" });
      }

      const validPassword = await bcrypt.compare(currentPassword, user.password);
      if (!validPassword) {
        return res.status(400).json({ message: "Mot de passe actuel incorrect" });
      }

      const hashedPassword = await bcrypt.hash(newPassword, 10);
      await storage.updateUser(user.id, { password: hashedPassword });

      res.json({ success: true, message: "Mot de passe modifie avec succes" });
    } catch (error: any) {
      serverError(res, error);
    }
  });

  // ── User profile fields (whatsapp, telegram, withdrawal code, etc.) ──
  app.patch("/api/user/profile", requireAuth, async (req, res) => {
    try {
      const user = await storage.getUser(req.session.userId!);
      if (!user) return res.status(404).json({ message: "Utilisateur non trouvé" });

      const allowed = ["whatsapp", "telegram", "withdrawalCode", "securityQuestion", "securityAnswer", "autoBetEnabled", "amountShortcuts"] as const;
      const update: Record<string, any> = {};
      for (const key of allowed) {
        if (key in req.body) update[key] = req.body[key];
      }
      if (!Object.keys(update).length) return res.status(400).json({ message: "Aucun champ à mettre à jour" });

      const updated = await storage.updateUser(user.id, update);
      res.json({ user: safeUser(updated) });
    } catch (e: any) {
      serverError(res, e);
    }
  });

  // Products
  app.get("/api/products", requireAuth, async (req, res) => {
    try {
      const products = await storage.getProducts();
      const userProductsList = await storage.getUserProducts(req.session.userId!);
      const user = await storage.getUser(req.session.userId!);
      
      const productCounts = new Map<number, number>();
      userProductsList.forEach(up => {
        if (up.isActive) {
          productCounts.set(up.productId, (productCounts.get(up.productId) || 0) + 1);
        }
      });
      
      const today = new Date();
      today.setHours(0, 0, 0, 0);
      const canClaimFree = !user?.lastFreeProductClaim || 
        new Date(user.lastFreeProductClaim) < today;

      const productsWithOwnership = products.map(p => ({
        ...p,
        isOwned: productCounts.has(p.id),
        ownedCount: productCounts.get(p.id) || 0,
        canClaimFree: p.isFree && canClaimFree,
      }));

      res.json(productsWithOwnership);
    } catch (error: any) {
      serverError(res, error);
    }
  });

  app.post("/api/products/:id/purchase", requireAuth, async (req, res) => {
    try {
      const productId = parseInt(req.params.id);
      const product = await storage.getProduct(productId);
      
      if (!product) {
        return res.status(404).json({ message: "Produit non trouvé" });
      }
      
      if (product.isFree) {
        return res.status(400).json({ message: "Utilisez /claim-free pour ce produit" });
      }

      const userProduct = await storage.purchaseProduct(req.session.userId!, productId);
      res.json(userProduct);
    } catch (error: any) {
      res.status(400).json({ message: error.message });
    }
  });

  app.post("/api/products/:id/claim-free", requireAuth, async (req, res) => {
    try {
      const productId = parseInt(req.params.id);
      const product = await storage.getProduct(productId);
      
      if (!product || !product.isFree) {
        return res.status(400).json({ message: "Produit non valide" });
      }

      const user = await storage.getUser(req.session.userId!);
      if (!user) {
        return res.status(401).json({ message: "Non authentifié" });
      }

      const today = new Date();
      today.setHours(0, 0, 0, 0);
      
      if (user.lastFreeProductClaim && new Date(user.lastFreeProductClaim) >= today) {
        return res.status(400).json({ message: "Déjà réclamé aujourd'hui" });
      }

      const newBalance = parseFloat(user.balance) + product.dailyEarnings;
      await storage.updateUser(user.id, { 
        balance: newBalance.toFixed(2),
        lastFreeProductClaim: new Date(),
      });

      await storage.createTransaction({
        userId: user.id,
        type: "free_claim",
        amount: product.dailyEarnings.toString(),
        description: "Bonus produit gratuit",
      });

      res.json({ success: true });
    } catch (error: any) {
      res.status(400).json({ message: error.message });
    }
  });

  // Get user's purchased products
  app.get("/api/user/products", requireAuth, async (req, res) => {
    try {
      const userProductsList = await storage.getAllUserProducts(req.session.userId!);
      
      const formattedProducts = userProductsList.map(up => ({
        id: up.userProduct.id,
        productId: up.userProduct.productId,
        purchasedAt: up.userProduct.purchaseDate,
        daysRemaining: up.userProduct.daysRemaining,
        totalEarned: up.userProduct.totalEarned,
        status: up.userProduct.isActive ? 'active' : 'completed',
        product: up.product
      }));
      
      res.json(formattedProducts);
    } catch (error: any) {
      serverError(res, error);
    }
  });

  // Collect earnings for user (manual trigger)
  app.post("/api/user/collect-earnings", requireAuth, async (req, res) => {
    try {
      const userId = req.session.userId!;
      const user = await storage.getUser(userId);
      if (!user) {
        return res.status(401).json({ message: "Non authentifie" });
      }

      const userProductsList = await storage.getAllUserProducts(userId);
      const now = new Date();
      let totalCollected = 0;
      let productsCollected = 0;

      for (const { userProduct, product } of userProductsList) {
        try {
          if (!userProduct.isActive || userProduct.daysRemaining <= 0) continue;

          const purchaseDate = userProduct.purchaseDate ? new Date(userProduct.purchaseDate) : null;
          if (!purchaseDate) continue;

          const lastEarning = userProduct.lastEarningDate ? new Date(userProduct.lastEarningDate) : purchaseDate;

          const msSincePurchase = now.getTime() - purchaseDate.getTime();
          const daysSincePurchase = Math.floor(msSincePurchase / (24 * 60 * 60 * 1000));

          const msSinceLastEarning = now.getTime() - lastEarning.getTime();
          const cyclesSinceLastEarning = Math.floor(msSinceLastEarning / (24 * 60 * 60 * 1000));

          if (cyclesSinceLastEarning >= 1 && daysSincePurchase >= 1) {
            const cyclesToCredit = Math.min(cyclesSinceLastEarning, userProduct.daysRemaining);
            const earningsPerCycle = product.dailyEarnings;
            const totalEarningsForProduct = earningsPerCycle * cyclesToCredit;

            const newLastEarningDate = new Date(lastEarning.getTime() + (cyclesToCredit * 24 * 60 * 60 * 1000));

            totalCollected += totalEarningsForProduct;
            productsCollected++;

            const newDaysRemaining = userProduct.daysRemaining - cyclesToCredit;
            const updateData: any = {
              lastEarningDate: newLastEarningDate,
              daysRemaining: newDaysRemaining,
              totalEarned: (parseFloat(userProduct.totalEarned || "0") + totalEarningsForProduct).toFixed(2),
            };
            
            if (newDaysRemaining <= 0) {
              updateData.isActive = false;
            }

            await storage.updateUserProduct(userProduct.id, updateData);

            for (let i = 0; i < cyclesToCredit; i++) {
              await storage.createTransaction({
                userId,
                type: "earning",
                amount: earningsPerCycle.toString(),
                description: `Gains ${product.name}`,
              });
            }
          }
        } catch (productError) {
          console.error(`Error processing product ${userProduct.id}:`, productError);
        }
      }

      if (totalCollected > 0) {
        const freshUser = await storage.getUser(userId);
        if (freshUser) {
          const newBalance = parseFloat(freshUser.balance || "0") + totalCollected;
          const newTodayEarnings = parseFloat(freshUser.todayEarnings || "0") + totalCollected;
          const newTotalEarnings = parseFloat(freshUser.totalEarnings || "0") + totalCollected;

          await storage.updateUser(userId, {
            balance: newBalance.toFixed(2),
            todayEarnings: newTodayEarnings.toFixed(2),
            totalEarnings: newTotalEarnings.toFixed(2),
          });
        }
      }

      const updatedUser = await storage.getUser(userId);
      res.json({ 
        success: true, 
        collected: totalCollected,
        productsCollected,
        newBalance: updatedUser?.balance || "0"
      });
    } catch (error: any) {
      console.error("Collect earnings error:", error);
      serverError(res, error);
    }
  });

  // Payment Channels
  app.get("/api/payment-channels", requireAuth, async (req, res) => {
    try {
      const [channels, settings] = await Promise.all([
        storage.getPaymentChannels(),
        storage.getSettings(),
      ]);

      const soleaspayEnabled = settings.soleaspayEnabled === "true";
      const soleaspayChannelName = settings.soleaspayChannelName || "Westpay";
      const sendavapayEnabled = settings.sendavapayEnabled === "true";
      const sendavapayChannelName = settings.sendavapayChannelName || "SendavaPay";
      // Build virtual gateway channels when enabled in settings
      const virtualChannels: any[] = [];
      if (sendavapayEnabled) {
        virtualChannels.push({
          id: -2,
          name: sendavapayChannelName,
          redirectUrl: "",
          isApi: true,
          isActive: true,
          gateway: "sendavapay",
        });
      }
      if (soleaspayEnabled) {
        virtualChannels.push({
          id: -1,
          name: soleaspayChannelName,
          redirectUrl: "",
          isApi: true,
          isActive: true,
          gateway: "soleaspay",
        });
      }
      const ashtechpayEnabled = settings.ashtechpayEnabled === "true";
      const ashtechpayChannelName = settings.ashtechpayChannelName || "AshtechPay";
      if (ashtechpayEnabled) {
        virtualChannels.push({
          id: -3,
          name: ashtechpayChannelName,
          redirectUrl: "",
          isApi: true,
          isActive: true,
          gateway: "ashtechpay",
        });
      }

      // Manual channels created by admin (no gateway auto-processing)
      const manualChannels = channels.map((ch) => ({ ...ch, gateway: null }));

      res.json([...virtualChannels, ...manualChannels]);
    } catch (error: any) {
      serverError(res, error);
    }
  });

  // Get Soleaspay supported services
  app.get("/api/soleaspay/services", requireAuth, async (req, res) => {
    try {
      const settings = await storage.getSettings();
      const soleaspayEnabled = settings.soleaspayEnabled !== "false";
      const soleaspayCountries = settings.soleaspayCountries ? settings.soleaspayCountries.split(",").filter(Boolean) : [];
      res.json({ 
        enabled: soleaspayEnabled,
        services: SOLEASPAY_SERVICE_MAP,
        enabledCountries: soleaspayCountries,
      });
    } catch (error: any) {
      serverError(res, error);
    }
  });

  // Staking Products (public)
  app.get("/api/staking/products", requireAuth, async (req, res) => {
    try {
      const all = await storage.getActiveStakingProducts();
      res.json(all);
    } catch (error: any) {
      serverError(res, error);
    }
  });

  app.post("/api/staking/purchase/:id", requireAuth, async (req, res) => {
    try {
      const id = parseInt(req.params.id);
      const staking = await storage.purchaseStaking(req.session.userId!, id);
      res.json(staking);
    } catch (error: any) {
      res.status(400).json({ message: error.message });
    }
  });

  app.get("/api/staking/my", requireAuth, async (req, res) => {
    try {
      const stakings = await storage.getUserStakings(req.session.userId!);
      res.json(stakings);
    } catch (error: any) {
      serverError(res, error);
    }
  });

  // Admin Staking
  app.get("/api/admin/staking/products", requireAdmin, async (req, res) => {
    try {
      const all = await storage.getStakingProducts();
      res.json(all);
    } catch (error: any) {
      serverError(res, error);
    }
  });

  app.post("/api/admin/staking/products", requireAdmin, async (req, res) => {
    try {
      const { name, description, price, returnAmount, lockDays, launchDate, imageUrl, isActive } = req.body;
      if (!name || !price || !returnAmount || !lockDays) {
        return res.status(400).json({ message: "Champs requis : nom, prix, retour, durée" });
      }
      const sp = await storage.createStakingProduct({
        name, description: description || null,
        price: parseInt(price),
        returnAmount: parseInt(returnAmount),
        lockDays: parseInt(lockDays),
        launchDate: launchDate ? new Date(launchDate) : null,
        imageUrl: imageUrl || null,
        isActive: isActive !== false,
        createdBy: req.session.userId,
      });
      res.json(sp);
    } catch (error: any) {
      res.status(400).json({ message: error.message });
    }
  });

  app.put("/api/admin/staking/products/:id", requireAdmin, async (req, res) => {
    try {
      const id = parseInt(req.params.id);
      const { name, description, price, returnAmount, lockDays, launchDate, imageUrl, isActive } = req.body;
      const sp = await storage.updateStakingProduct(id, {
        name, description,
        price: price !== undefined ? parseInt(price) : undefined,
        returnAmount: returnAmount !== undefined ? parseInt(returnAmount) : undefined,
        lockDays: lockDays !== undefined ? parseInt(lockDays) : undefined,
        launchDate: launchDate ? new Date(launchDate) : (launchDate === null ? null : undefined),
        imageUrl, isActive,
      });
      res.json(sp);
    } catch (error: any) {
      res.status(400).json({ message: error.message });
    }
  });

  app.delete("/api/admin/staking/products/:id", requireAdmin, async (req, res) => {
    try {
      await storage.deleteStakingProduct(parseInt(req.params.id));
      res.json({ success: true });
    } catch (error: any) {
      res.status(400).json({ message: error.message });
    }
  });

  app.get("/api/admin/staking/stakings", requireAdmin, async (req, res) => {
    try {
      const all = await storage.getAllUserStakings();
      res.json(all);
    } catch (error: any) {
      serverError(res, error);
    }
  });

  // Payment Numbers (public — filtered by country)
  app.get("/api/payment-numbers", requireAuth, async (req, res) => {
    try {
      const country = req.query.country as string;
      if (country) {
        const nums = await storage.getPaymentNumbersByCountry(country);
        return res.json(nums);
      }
      const nums = await storage.getPaymentNumbers();
      res.json(nums.filter(n => n.isActive));
    } catch (error: any) {
      serverError(res, error);
    }
  });

  // Admin Payment Numbers CRUD
  app.get("/api/admin/payment-numbers", requireAdmin, async (req, res) => {
    try {
      const nums = await storage.getPaymentNumbers();
      res.json(nums);
    } catch (error: any) {
      serverError(res, error);
    }
  });

  app.post("/api/admin/payment-numbers", requireAdmin, async (req, res) => {
    try {
      const { ownerName, phone, operatorName, country, logoUrl, isActive } = req.body;
      if (!ownerName || !phone || !operatorName || !country) {
        return res.status(400).json({ message: "Tous les champs sont requis" });
      }
      const normalizedPhone = validatePhone(phone, "Numéro");
      const num = await storage.createPaymentNumber({
        ownerName: String(ownerName).trim().slice(0, 100),
        phone: normalizedPhone,
        operatorName: String(operatorName).trim().slice(0, 60),
        country: String(country).trim().toUpperCase(),
        logoUrl: logoUrl || null,
        isActive: isActive !== false,
        createdBy: req.session.userId,
      });
      res.json(num);
    } catch (error: any) {
      res.status(400).json({ message: error.message });
    }
  });

  app.put("/api/admin/payment-numbers/:id", requireAdmin, async (req, res) => {
    try {
      const id = parseInt(req.params.id);
      const { ownerName, phone, operatorName, country, logoUrl, isActive } = req.body;
      const num = await storage.updatePaymentNumber(id, {
        ownerName: ownerName === undefined ? undefined : String(ownerName).trim().slice(0, 100),
        phone: phone === undefined ? undefined : validatePhone(phone, "Numéro"),
        operatorName: operatorName === undefined ? undefined : String(operatorName).trim().slice(0, 60),
        country: country === undefined ? undefined : String(country).trim().toUpperCase(),
        logoUrl, isActive,
      });
      res.json(num);
    } catch (error: any) {
      res.status(400).json({ message: error.message });
    }
  });

  app.delete("/api/admin/payment-numbers/:id", requireAdmin, async (req, res) => {
    try {
      await storage.deletePaymentNumber(parseInt(req.params.id));
      res.json({ success: true });
    } catch (error: any) {
      res.status(400).json({ message: error.message });
    }
  });

  // Deposits
  app.post("/api/deposits", requireAuth, async (req, res) => {
    try {
      const { amount, accountName, accountNumber, paymentMethod, country, paymentChannelId, useSoleaspay, otpCode,
        paymentNumberId, channelName, screenshot, paymentMessage, reference } = req.body;
      const user = await storage.getUser(req.session.userId!);
      
      if (!user) {
        return res.status(401).json({ message: "Non authentifie" });
      }

      const settings = await storage.getSettings();
      const minDeposit = parseInt(settings.minDeposit || "3500");
       const requestedAmount = typeof amount === "number" ? amount : Number(amount);
       if (!Number.isFinite(requestedAmount) || requestedAmount < minDeposit) {
        return res.status(400).json({ message: `Montant minimum: ${minDeposit.toLocaleString()} FCFA` });
      }

       const parsedDeposit = depositSchema.safeParse({
          amount: requestedAmount,
         accountName, accountNumber, paymentMethod, country,
         paymentChannelId: paymentChannelId === undefined ? undefined : Number(paymentChannelId),
       });
       if (!parsedDeposit.success) {
         return res.status(400).json({ message: parsedDeposit.error.errors[0]?.message || "Données invalides" });
       }
       if (screenshot !== undefined && screenshot !== null) {
         if (
           typeof screenshot !== "string" ||
           screenshot.length > 7_000_000 ||
           !/^data:image\/(?:jpeg|png|webp|gif);base64,[A-Za-z0-9+/=]+$/.test(screenshot)
         ) {
           return res.status(400).json({ message: "Capture invalide ou trop volumineuse (7 Mo maximum)" });
         }
       }
       const normalizedDeposit = parsedDeposit.data;

      const soleaspayEnabled = settings.soleaspayEnabled !== "false";
      const soleaspayCountries = settings.soleaspayCountries ? settings.soleaspayCountries.split(",").filter(Boolean) : [];
      const orderId = `JOLLIBEE-${Date.now()}-${user.id}`;
      
      // Only use Soleaspay when user explicitly chose the Soleaspay channel (Westpay)
      if (useSoleaspay && soleaspayEnabled) {
         if (!isSoleaspaySupported(normalizedDeposit.country, normalizedDeposit.paymentMethod)) {
          return res.status(400).json({
            message: `L'opérateur "${normalizedDeposit.paymentMethod}" n'est pas supporté par ce canal pour le pays "${normalizedDeposit.country}". Veuillez choisir un autre canal.`,
            soleaspay: true,
          });
        }
        try {
          const paymentResult = await initiatePayment(
            normalizedDeposit.accountNumber,
            normalizedDeposit.amount,
            normalizedDeposit.country,
            normalizedDeposit.paymentMethod,
            orderId,
            normalizedDeposit.accountName,
            `user${user.id}@intel.com`
          );

          if (paymentResult.success && paymentResult.data) {
            const deposit = await storage.createDeposit({
              userId: req.session.userId!,
             amount: normalizedDeposit.amount,
             accountName: normalizedDeposit.accountName,
             accountNumber: normalizedDeposit.accountNumber,
             country: normalizedDeposit.country,
             paymentMethod: normalizedDeposit.paymentMethod,
               paymentChannelId: normalizedDeposit.paymentChannelId && normalizedDeposit.paymentChannelId > 0 ? normalizedDeposit.paymentChannelId : null,
              status: "processing",
              soleaspayReference: paymentResult.data.reference,
              soleaspayOrderId: orderId,
            });

            return res.json({ 
              deposit,
              soleaspay: true,
              reference: paymentResult.data.reference,
              status: paymentResult.status,
              message: paymentResult.message
            });
          } else {
            return res.status(400).json({ 
              message: paymentResult.message || "Erreur Soleaspay",
              soleaspay: true
            });
          }
        } catch (soleaspayError: any) {
          console.error("[soleaspay] Payment error:", soleaspayError);
          return res.status(400).json({ 
            message: soleaspayError.message || "Erreur de paiement Soleaspay",
            soleaspay: true
          });
        }
      }



      const deposit = await storage.createDeposit({
        userId: req.session.userId!,
         amount: normalizedDeposit.amount,
         accountName: normalizedDeposit.accountName,
         accountNumber: normalizedDeposit.accountNumber,
         country: normalizedDeposit.country,
         paymentMethod: normalizedDeposit.paymentMethod,
         paymentChannelId: normalizedDeposit.paymentChannelId && normalizedDeposit.paymentChannelId > 0 ? normalizedDeposit.paymentChannelId : null,
        paymentNumberId: paymentNumberId || null,
        channelName: channelName || null,
        screenshot: screenshot || null,
        paymentMessage: paymentMessage || null,
        reference: reference || null,
        status: "pending",
      });

      res.json({ deposit, soleaspay: false });
    } catch (error: any) {
      res.status(400).json({ message: error.message });
    }
  });

  // Verify payment status (Soleaspay)
  app.get("/api/deposits/:id/verify", requireAuth, async (req, res) => {
    try {
      const depositId = parseInt(req.params.id);
      const deposit = await storage.getDeposit(depositId);
      
      if (!deposit) {
        return res.status(404).json({ message: "Depot non trouve" });
      }

      if (deposit.userId !== req.session.userId) {
        return res.status(403).json({ message: "Acces refuse" });
      }

      if (deposit.status === "approved" || deposit.status === "rejected") {
        return res.json({ status: deposit.status });
      }

      if (deposit.soleaspayReference && deposit.soleaspayOrderId) {
        try {
          const verifyResult = await verifyPayment(deposit.soleaspayOrderId, deposit.soleaspayReference);
          const newStatus = mapSoleaspayStatus(verifyResult.status);

          if (newStatus !== "pending" && newStatus !== deposit.status) {
            await storage.updateDeposit(depositId, { 
              status: newStatus,
              processedAt: new Date()
            });

            if (newStatus === "approved") {
              const user = await storage.getUser(deposit.userId);
              if (user) {
                const isFirstDeposit = !user.hasDeposited;
                const newBalance = parseFloat(user.balance) + deposit.amount;
                await storage.updateUser(deposit.userId, {
                  balance: newBalance.toFixed(2),
                  hasDeposited: true,
                });

                await storage.createTransaction({
                  userId: deposit.userId,
                  type: "deposit",
                  amount: deposit.amount.toString(),
                  description: `Depot Soleaspay #${deposit.id}`,
                });

                if (isFirstDeposit) await storage.processDepositReferralCommissions(deposit.userId, deposit.amount);
                await applyDepositBonus(deposit.userId, deposit.amount, deposit.id);
              }
            }
          }

          return res.json({ 
            status: newStatus,
            soleaspay: true,
            soleaspayStatus: verifyResult.status,
            message: verifyResult.message
          });
        } catch (verifyError: any) {
          console.error("[soleaspay] Verify error:", verifyError);
          return res.json({ 
            status: deposit.status,
            soleaspay: true,
            error: "Erreur de verification"
          });
        }
      }

      return res.json({ status: deposit.status });
    } catch (error: any) {
      serverError(res, error);
    }
  });

  app.get("/api/deposits/history", requireAuth, async (req, res) => {
    try {
      const deposits = await storage.getUserDeposits(req.session.userId!);
      res.json(deposits);
    } catch (error: any) {
      serverError(res, error);
    }
  });

  // ── SendavaPay routes ──────────────────────────────────────────────────────

  // Proxy: operators for a given country (public SendavaPay endpoint)
  app.get("/api/sendavapay/operators/:country", requireAuth, async (req, res) => {
    try {
      const svCountry = toSendavapayCountry(req.params.country);
      const r = await fetch(
        `https://sendavapay.com/api/sdk/v1/operators/${svCountry}`
      );
      const data = await r.json();
      res.json(data);
    } catch (error: any) {
      serverError(res, error); // success:false handled by serverError
    }
  });

  // Create payment (server-side, stores deposit record)
  app.post("/api/sendavapay/create", requireAuth, async (req, res) => {
    try {
      const { amount, country, operatorId, operatorName, payerPhone } = req.body;
      const user = await storage.getUser(req.session.userId!);
      if (!user) return res.status(401).json({ message: "Non authentifié" });

      const settings = await storage.getSettings();
      if (settings.sendavapayEnabled !== "true") {
        return res.status(400).json({ message: "SendavaPay non activé" });
      }
      const minDeposit = parseInt(settings.minDeposit || "3000");
      if (!amount || amount < minDeposit) {
        return res.status(400).json({ message: `Montant minimum: ${minDeposit.toLocaleString()} FCFA` });
      }

      const svCountry = toSendavapayCountry(country);
      const currency = sendavapayGetCurrency(country);
      const externalRef = `DEP-${Date.now()}-${user.id}`;
      // Use phone provided by user (they may have multiple SIM cards) or fall back to profile phone
      const rawPhone = (payerPhone && payerPhone.trim()) ? payerPhone.trim() : user.phone;
      const customerPhone = sendavapayFormatPhone(rawPhone, country);
      const devDomain = process.env.REPLIT_DEV_DOMAIN;
      const siteDomain = process.env.SITE_URL; // e.g. https://safwinn.site on Plesk
      const baseUrl = siteDomain || (devDomain ? `https://${devDomain}` : "https://safwinn.site");
      const webhookUrl = `${baseUrl}/api/webhooks/sendavapay`;

      const result = await sendavapayCreate({
        amount,
        currency,
        description: `Dépôt #${externalRef}`,
        customerName: user.fullName,
        customerPhone,
        customerEmail: `user${user.id}@doosan.app`,
        payerCountry: svCountry,
        webhookUrl,
        externalReference: externalRef,
      });

      if (!result.success || !result.data) {
        return res.status(400).json({
          message: result.error || "Erreur SendavaPay",
        });
      }

      const deposit = await storage.createDeposit({
        userId: user.id,
        amount,
        accountName: user.fullName,
        accountNumber: customerPhone,
        country,
        paymentMethod: operatorName || "SendavaPay",
        status: "processing",
        sendavapayReference: result.data.reference,
        sendavapayToken: result.data.paymentToken,
      });

      res.json({
        depositId: deposit.id,
        paymentToken: result.data.paymentToken,
        reference: result.data.reference,
        expiresAt: result.data.expiresAt,
      });
    } catch (error: any) {
      console.error("[sendavapay] create error:", error);
      serverError(res, error);
    }
  });

  // Initiate payment (proxy, calls CORS endpoint on behalf of authenticated user)
  app.post("/api/sendavapay/initiate", requireAuth, async (req, res) => {
    try {
      const { paymentToken, payerCountry, operatorId, depositId, payerPhone } = req.body;
      const user = await storage.getUser(req.session.userId!);
      if (!user) return res.status(401).json({ message: "Non authentifié" });

      const svCountry = toSendavapayCountry(payerCountry);
      const rawPhone = (payerPhone && payerPhone.trim()) ? payerPhone.trim() : user.phone;
      const customerPhone = sendavapayFormatPhone(rawPhone, payerCountry);

      const result = await sendavapayInitiate({
        paymentToken,
        payerName: user.fullName,
        payerPhone: customerPhone,
        payerCountry: svCountry,
        operatorId,
      });

      // Update deposit status to processing
      if (depositId) {
        await storage.updateDeposit(depositId, { status: "processing" });
      }

      res.json(result);
    } catch (error: any) {
      console.error("[sendavapay] initiate error:", error);
      serverError(res, error);
    }
  });

  // Submit OTP — CLIENT (CORS) endpoint, no SDK key
  app.post("/api/sendavapay/submit-otp", requireAuth, async (req, res) => {
    try {
      const { otpToken, otp } = req.body;
      if (!otpToken || !otp) {
        return res.status(400).json({ message: "otpToken et otp requis" });
      }
      const result = await sendavapaySubmitOtp({ otpToken, otp });
      res.json(result);
    } catch (error: any) {
      console.error("[sendavapay] submit-otp error:", error);
      serverError(res, error);
    }
  });

  // Retry a failed payment — CLIENT (CORS) endpoint, no SDK key
  app.post("/api/sendavapay/retry", requireAuth, async (req, res) => {
    try {
      const { paymentToken, depositId } = req.body;
      if (!paymentToken) {
        return res.status(400).json({ message: "paymentToken requis" });
      }
      // Reset deposit status to processing
      if (depositId) {
        await storage.updateDeposit(depositId, { status: "processing" });
      }
      const result = await sendavapayRetry(paymentToken);
      res.json(result);
    } catch (error: any) {
      console.error("[sendavapay] retry error:", error);
      serverError(res, error);
    }
  });

  // Poll payment status using GET /payment-status/:reference (lighter than verify-payment)
  app.get("/api/deposits/:id/sendavapay-status", requireAuth, async (req, res) => {
    try {
      const depositId = parseInt(req.params.id);
      const deposit = await storage.getDeposit(depositId);
      if (!deposit) return res.status(404).json({ message: "Dépôt non trouvé" });
      if (deposit.userId !== req.session.userId) return res.status(403).json({ message: "Accès refusé" });

      if (deposit.status === "approved" || deposit.status === "rejected") {
        return res.json({ status: deposit.status });
      }

      if (!deposit.sendavapayReference) {
        return res.json({ status: deposit.status });
      }

      // Use lightweight GET payment-status endpoint for polling
      const statusRes = await fetch(
        `${process.env.SENDAVAPAY_API_BASE || "https://sendavapay.com/api/sdk/v1"}/payment-status/${deposit.sendavapayReference}`,
        { headers: { Authorization: `Bearer ${process.env.SENDAVAPAY_API_KEY || ""}` } }
      );
      const statusData = await statusRes.json() as { success: boolean; data?: { status: string } };

      if (!statusData.success || !statusData.data) {
        return res.json({ status: deposit.status });
      }

      const newStatus = mapSendavapayStatus(statusData.data.status);
      if (newStatus !== "pending" && newStatus !== deposit.status) {
        await storage.updateDeposit(depositId, { status: newStatus, processedAt: new Date() });

        if (newStatus === "approved") {
          const user = await storage.getUser(deposit.userId);
          if (user) {
            const newBalance = parseFloat(user.balance) + deposit.amount;
            await storage.updateUser(deposit.userId, {
              balance: newBalance.toFixed(2),
              hasDeposited: true,
            });
            await storage.createTransaction({
              userId: deposit.userId,
              type: "deposit",
              amount: deposit.amount.toString(),
              description: `Dépôt SendavaPay #${deposit.id}`,
            });
            await storage.processDepositReferralCommissions(deposit.userId, deposit.amount);
            await applyDepositBonus(deposit.userId, deposit.amount, deposit.id);
          }
        }
      }

      res.json({ status: newStatus || deposit.status, rawStatus: statusData.data.status });
    } catch (error: any) {
      console.error("[sendavapay] status check error:", error);
      serverError(res, error);
    }
  });

  // Webhook (HMAC verified)
  app.post(
    "/api/webhooks/sendavapay",
    express.raw({ type: "application/json" }),
    async (req, res) => {
      try {
        const settings = await storage.getSettings();
        // Prefer the deployment secret; keep the admin setting as a
        // backwards-compatible fallback for existing installations.
        const secret = process.env.SENDAVAPAY_WEBHOOK_SECRET || settings.sendavapayWebhookSecret || "";
        const sig = req.headers["x-sendavapay-signature"] as string || "";

        if (secret && !sendavapayVerifySignature(req.body as Buffer, sig, secret)) {
          console.warn("[sendavapay webhook] Invalid signature");
          return res.status(401).json({ message: "Invalid signature" });
        }

        const payload = JSON.parse((req.body as Buffer).toString());
        const { event, reference, status } = payload;

        if (!reference) return res.json({ received: true });

        // Find deposit by sendavapay reference
        const deposit = await storage.getDepositBySendavapayReference(reference);
        if (!deposit) {
          console.warn(`[sendavapay webhook] No deposit found for reference ${reference}`);
          return res.json({ received: true });
        }

        if (deposit.status === "approved" || deposit.status === "rejected") {
          return res.json({ received: true }); // already processed
        }

        if (event === "payment.completed" || status === "completed") {
          await storage.updateDeposit(deposit.id, { status: "approved", processedAt: new Date() });
          const user = await storage.getUser(deposit.userId);
          if (user) {
            const isFirstDeposit = !user.hasDeposited;
            const newBalance = parseFloat(user.balance) + deposit.amount;
            await storage.updateUser(deposit.userId, {
              balance: newBalance.toFixed(2),
              hasDeposited: true,
            });
            await storage.createTransaction({
              userId: deposit.userId,
              type: "deposit",
              amount: deposit.amount.toString(),
              description: `Dépôt SendavaPay #${deposit.id}`,
            });
            if (isFirstDeposit) await storage.processDepositReferralCommissions(deposit.userId, deposit.amount);
            await applyDepositBonus(deposit.userId, deposit.amount, deposit.id);
          }
        } else if (event === "payment.failed" || event === "payment.expired" || status === "failed" || status === "cancelled") {
          await storage.updateDeposit(deposit.id, { status: "rejected", processedAt: new Date() });
        }

        res.json({ received: true });
      } catch (error: any) {
        console.error("[sendavapay webhook] error:", error);
        serverError(res, error);
      }
    }
  );

  // ── AshtechPay routes ─────────────────────────────────────────────────────

  // GET operators for a country — from admin DB config, not AshtechPay API
  app.get("/api/ashtechpay/operators/:country", requireAuth, async (req, res) => {
    try {
      const settings = await storage.getSettings();
      if (settings.ashtechpayEnabled !== "true")
        return res.status(403).json({ message: "AshtechPay désactivé" });

      // Use admin-configured operators for the country (from DB)
      const countries = await storage.getCountries();
      const found = countries.find(c => c.code === req.params.country.toUpperCase());
      let operators: string[] = [];
      if (found?.operators) {
        try {
          operators = typeof found.operators === "string"
            ? JSON.parse(found.operators)
            : (found.operators as string[]);
        } catch { operators = []; }
      }
      // Fallback to AshtechPay API only if admin hasn't configured any operators
      if (operators.length === 0) {
        operators = await ashtechpay.getOperatorsForCountry(req.params.country);
      }
      res.json({ operators });
    } catch (error: any) {
      console.error("[ashtechpay] operators error:", error);
      serverError(res, error);
    }
  });

  // POST initiate/retry collect (mobile money)
  app.post("/api/ashtechpay/collect", requireAuth, async (req, res) => {
    try {
      const settings = await storage.getSettings();
      if (settings.ashtechpayEnabled !== "true")
        return res.status(403).json({ message: "AshtechPay désactivé" });

      const { amount, country, phone, operator, otp, reference } = req.body;
      const user = await storage.getUser(req.session.userId!);
      if (!user) return res.status(401).json({ message: "Non authentifié" });

      const currency = ashtechpay.getCurrency(country);
      const ref = reference || `${Date.now()}-${user.id}`;

      const result = await ashtechpay.collect({ amount, currency, phone, operator, country_code: country, reference: ref, otp });

      // For OTP flows (no deposit yet) — return immediately so frontend can show OTP input
      if (result.type === "otp_ussd" || result.type === "otp_sms") {
        return res.json(result);
      }

      // For USSD push / Wave — create deposit record
      const deposit = await storage.createDeposit({
        userId: req.session.userId!,
        amount,
        accountName: user.fullName || "",
        accountNumber: phone,
        country,
        paymentMethod: operator,
        status: "processing",
        ashtechpayTransactionId: (result as any).transactionId,
        ashtechpayReference: ref,
      } as any);

      res.json({ ...result, depositId: deposit.id });
    } catch (error: any) {
      console.error("[ashtechpay] collect error:", error);
      res.status(400).json({ message: error.message || "Erreur AshtechPay" });
    }
  });

  // GET poll deposit status
  app.get("/api/deposits/:id/ashtechpay-status", requireAuth, async (req, res) => {
    try {
      const depositId = parseInt(req.params.id);
      const deposit = await storage.getDeposit(depositId);
      if (!deposit) return res.status(404).json({ message: "Dépôt non trouvé" });
      if (deposit.userId !== req.session.userId) return res.status(403).json({ message: "Accès refusé" });

      if (deposit.status === "approved" || deposit.status === "rejected") {
        return res.json({ status: deposit.status });
      }

      const txId = (deposit as any).ashtechpayTransactionId;
      if (!txId) return res.json({ status: deposit.status });

      const tx = await ashtechpay.getTransactionStatus(txId);

      if (tx.status === "success" && deposit.status !== "approved") {
        await storage.updateDeposit(depositId, { status: "approved", processedAt: new Date() });
        const u = await storage.getUser(deposit.userId);
        if (u) {
          const isFirstDeposit = !u.hasDeposited;
          const newBalance = parseFloat(u.balance) + deposit.amount;
          await storage.updateUser(deposit.userId, { balance: newBalance.toFixed(2), hasDeposited: true });
          await storage.createTransaction({ userId: deposit.userId, type: "deposit", amount: deposit.amount.toString(), description: `Dépôt AshtechPay #${deposit.id}` });
          if (isFirstDeposit) await storage.processDepositReferralCommissions(deposit.userId, deposit.amount);
          await applyDepositBonus(deposit.userId, deposit.amount, deposit.id);
        }
        return res.json({ status: "approved" });
      }
      if (tx.status === "failed" && deposit.status !== "rejected") {
        await storage.updateDeposit(depositId, { status: "rejected", processedAt: new Date() });
        return res.json({ status: "rejected" });
      }

      res.json({ status: deposit.status });
    } catch (error: any) {
      console.error("[ashtechpay] status error:", error);
      serverError(res, error);
    }
  });

  // GET crypto assets
  app.get("/api/ashtechpay/crypto/assets", requireAuth, async (req, res) => {
    try {
      const settings = await storage.getSettings();
      if (settings.ashtechpayEnabled !== "true")
        return res.status(403).json({ message: "AshtechPay désactivé" });
      const all = await ashtechpay.getCryptoAssets();
      // Only expose USDT on TRC20 and BEP20 (BSC) — confirmed working by provider
      const ALLOWED = ["USDT.TRC20", "USDT.BEP20", "USDT.BSC"];
      const assets = all.filter(a =>
        a.coin === "USDT" &&
        (ALLOWED.includes(a.asset_code) ||
          a.network?.toUpperCase().includes("TRC20") ||
          a.network?.toUpperCase().includes("BEP20") ||
          a.network?.toUpperCase().includes("BSC"))
      );
      res.json({ assets });
    } catch (error: any) {
      console.error("[ashtechpay] crypto assets error:", error);
      serverError(res, error);
    }
  });

  // POST initiate crypto deposit
  app.post("/api/ashtechpay/crypto/collect", requireAuth, async (req, res) => {
    try {
      const settings = await storage.getSettings();
      if (settings.ashtechpayEnabled !== "true")
        return res.status(403).json({ message: "AshtechPay désactivé" });

      const { amount, currency, asset_code } = req.body;
      const user = await storage.getUser(req.session.userId!);
      if (!user) return res.status(401).json({ message: "Non authentifié" });

      const ref = `${Date.now()}-${user.id}`;

      // Build customer object with all three fields — provider requires a complete object
      const nameParts = (user.fullName || "").trim().split(/\s+/);
      const firstName = nameParts[0] || "Client";
      const lastName  = nameParts.slice(1).join(" ") || "SATWIN";
      // Generate a deterministic valid email (provider rejects absent/incomplete customer)
      const safePhone = (user.phone || "").replace(/\D/g, "") || String(user.id);
      const customerEmail = `u${safePhone}@satwinfoot.app`;

      const result = await ashtechpay.collectCrypto({
        amount,
        currency: currency || "USDT",
        asset_code,
        reference: ref,
        customer: { firstName, lastName, email: customerEmail },
      });

      // Create a pending deposit record for crypto
      const amountXof = currency === "USDT" ? Math.round(amount * 650) : amount;
      const deposit = await storage.createDeposit({
        userId: req.session.userId!,
        amount: amountXof,
        accountName: user.fullName || "",
        accountNumber: result.address,
        country: user.country || "BJ",
        paymentMethod: `Crypto ${result.asset_code}`,
        status: "processing",
        ashtechpayTransactionId: result.transaction_id,
        ashtechpayReference: ref,
      } as any);

      res.json({ ...result, depositId: deposit.id });
    } catch (error: any) {
      console.error("[ashtechpay] crypto collect error:", error);
      res.status(400).json({ message: error.message || "Erreur AshtechPay Crypto" });
    }
  });

  // Webhook AshtechPay (optional — no signature secret required)
  app.post("/api/webhooks/ashtechpay", express.json(), async (req, res) => {
    try {
      res.status(200).json({ received: true });
      const { event, transaction_id, reference, amount } = req.body;

      // Find deposit by ashtechpay_transaction_id using raw SQL
      const rows = await db.execute(
        sql`SELECT * FROM deposits WHERE ashtechpay_transaction_id = ${transaction_id} LIMIT 1`
      ) as any;
      const row = Array.isArray(rows) ? rows[0] : (rows?.rows?.[0]);
      if (!row) return;
      if (row.status === "approved" || row.status === "rejected") return;

      if (event === "payment.completed") {
        await storage.updateDeposit(row.id, { status: "approved", processedAt: new Date() });
        const u = await storage.getUser(row.user_id);
        if (u) {
          const isFirstDeposit = !u.hasDeposited;
          const newBalance = parseFloat(u.balance) + row.amount;
          await storage.updateUser(row.user_id, { balance: newBalance.toFixed(2), hasDeposited: true });
          await storage.createTransaction({ userId: row.user_id, type: "deposit", amount: row.amount.toString(), description: `Dépôt AshtechPay #${row.id}` });
          if (isFirstDeposit) await storage.processDepositReferralCommissions(row.user_id, row.amount);
          await applyDepositBonus(row.user_id, row.amount, row.id);
        }
      } else if (event === "payment.failed") {
        await storage.updateDeposit(row.id, { status: "rejected", processedAt: new Date() });
      }
    } catch (error: any) {
      console.error("[ashtechpay webhook] error:", error);
    }
  });

  // Withdrawals
  app.post("/api/withdrawals", requireAuth, async (req, res) => {
    try {
      const { amount } = req.body;
      const user = await storage.getUser(req.session.userId!);
      
      if (!user) {
        return res.status(401).json({ message: "Non authentifié" });
      }

      // ── Dépôt obligatoire avant tout retrait ──────────────────────────────────
      const depositCheck = await db.execute(
        sql`SELECT COUNT(*) AS cnt FROM deposits
            WHERE user_id = ${user.id} AND status IN ('approved','completed')`
      );
      const depositCount = parseInt((depositCheck.rows[0] as any)?.cnt ?? "0", 10);
      if (depositCount === 0) {
        return res.status(400).json({
          message: "Vous devez effectuer un dépôt avant de pouvoir retirer",
          code: "DEPOSIT_REQUIRED",
        });
      }

      const settingsForWithdrawal = await storage.getSettings();
      const minWithdrawal = parseInt(settingsForWithdrawal.minWithdrawal || "1000");
      if (amount < minWithdrawal) {
        return res.status(400).json({ message: `Montant minimum: ${minWithdrawal} FCFA` });
      }

      // ── Éligibilité 48h : 2 jours consécutifs de paris ────────────────────────
      if (!user.withdrawalUnlocked) {
        const betDaysResult = await db.execute(
          sql`SELECT DISTINCT DATE(placed_at) AS bet_day
              FROM bets
              WHERE user_id = ${user.id}
              ORDER BY bet_day DESC
              LIMIT 10`
        );
        const betDays: string[] = (betDaysResult.rows as any[]).map(r =>
          typeof r.bet_day === "string" ? r.bet_day : (r.bet_day as Date).toISOString().slice(0, 10)
        );
        const today = new Date().toISOString().slice(0, 10);
        const yesterday = new Date(Date.now() - 86400000).toISOString().slice(0, 10);
        const isEligible = (() => {
          if (betDays.length < 2) return false;
          // Most recent bet day must be today or yesterday
          if (betDays[0] !== today && betDays[0] !== yesterday) return false;
          // Second bet day must be exactly 1 day before the first
          const d0 = new Date(betDays[0]);
          const d1 = new Date(betDays[1]);
          const diff = Math.round((d0.getTime() - d1.getTime()) / 86400000);
          return diff === 1;
        })();
        if (!isEligible) {
          return res.status(400).json({
            message: "Pariez sur des matchs pendant 2 jours consécutifs pour débloquer les retraits",
            code: "BET_DAYS_REQUIRED",
          });
        }
      }

      if (user.isWithdrawalBlocked) {
        return res.status(400).json({ message: "Retraits bloqués sur ce compte" });
      }

      if (user.mustInviteToWithdraw) {
        const stats = await storage.getTeamStats(user.id);
        if (stats.level1Invested < 1) {
          return res.status(400).json({ message: "Invitez quelqu'un qui investit" });
        }
      }

      const balance = parseFloat(user.balance);
      if (amount > balance) {
        return res.status(400).json({ message: "Solde insuffisant" });
      }

      const wallet = await storage.getDefaultWallet(user.id);
      if (!wallet) {
        return res.status(400).json({ message: "Enregistrez un portefeuille de retrait" });
      }

      const todayCount = await storage.getUserWithdrawalCountToday(user.id);
      const settingsForMax = await storage.getSettings();
      const maxPerDay = parseInt(settingsForMax.maxWithdrawalsPerDay || "1");
      if (todayCount >= maxPerDay) {
        return res.status(400).json({ message: `Maximum ${maxPerDay} retrait${maxPerDay > 1 ? 's' : ''} par jour` });
      }

      const settings = await storage.getSettings();
      const fees = parseFloat(settings.withdrawalFees || "18");
      const feeAmount = Math.round(amount * fees / 100);
      const netAmount = amount - feeAmount;

      // Deduct from balance
      await storage.updateUser(user.id, {
        balance: (balance - amount).toFixed(2),
      });

      const withdrawal = await storage.createWithdrawal({
        userId: user.id,
        amount,
        netAmount,
        fees: feeAmount,
        accountName: wallet.accountName,
        accountNumber: wallet.accountNumber,
        country: wallet.country,
        paymentMethod: wallet.paymentMethod,
        status: "pending",
      });

      res.json(withdrawal);
    } catch (error: any) {
      res.status(400).json({ message: error.message });
    }
  });

  app.get("/api/withdrawals/history", requireAuth, async (req, res) => {
    try {
      const withdrawals = await storage.getUserWithdrawals(req.session.userId!);
      res.json(withdrawals);
    } catch (error: any) {
      serverError(res, error);
    }
  });

  // Wallets
  app.get("/api/wallets", requireAuth, async (req, res) => {
    try {
      const wallets = await storage.getWallets(req.session.userId!);
      res.json(wallets);
    } catch (error: any) {
      serverError(res, error);
    }
  });

  app.post("/api/wallets", requireAuth, async (req, res) => {
    try {
      const parsedWallet = walletSchema.safeParse(req.body);
      if (!parsedWallet.success) {
        return res.status(400).json({ message: parsedWallet.error.errors[0]?.message || "Données invalides" });
      }
      const wallet = await storage.createWallet({
        userId: req.session.userId!,
        ...parsedWallet.data,
      });
      res.json(wallet);
    } catch (error: any) {
      res.status(400).json({ message: error.message });
    }
  });

  app.delete("/api/wallets/:id", requireAuth, async (req, res) => {
    try {
      await storage.deleteWallet(parseInt(req.params.id));
      res.json({ success: true });
    } catch (error: any) {
      res.status(400).json({ message: error.message });
    }
  });

  app.patch("/api/wallets/:id/default", requireAuth, async (req, res) => {
    try {
      await storage.setDefaultWallet(req.session.userId!, parseInt(req.params.id));
      res.json({ success: true });
    } catch (error: any) {
      res.status(400).json({ message: error.message });
    }
  });

  // Team
  app.get("/api/team/stats", requireAuth, async (req, res) => {
    try {
      const stats = await storage.getTeamStats(req.session.userId!);
      res.json(stats);
    } catch (error: any) {
      serverError(res, error);
    }
  });

  app.get("/api/team/details", requireAuth, async (req, res) => {
    try {
      const team = await storage.getDetailedTeam(req.session.userId!);
      res.json(team);
    } catch (error: any) {
      serverError(res, error);
    }
  });

  // ── Prime de parrainage — dépôts hebdomadaires des filleuls ──────────────
  app.get("/api/team/weekly-prime", requireAuth, async (req, res) => {
    try {
      const me = await storage.getUser(req.session.userId!);
      if (!me) return res.status(401).json({ message: "Non authentifié" });

      // Week boundaries (Monday 00:00 → Sunday 23:59)
      const now = new Date();
      const dayOfWeek = now.getDay() === 0 ? 6 : now.getDay() - 1; // 0=Mon … 6=Sun
      const thisMonday = new Date(now);
      thisMonday.setDate(now.getDate() - dayOfWeek);
      thisMonday.setHours(0, 0, 0, 0);
      const thisSunday = new Date(thisMonday);
      thisSunday.setDate(thisMonday.getDate() + 6);
      thisSunday.setHours(23, 59, 59, 999);
      const lastMonday = new Date(thisMonday);
      lastMonday.setDate(thisMonday.getDate() - 7);
      const lastSunday = new Date(thisSunday);
      lastSunday.setDate(thisSunday.getDate() - 7);

      type DayRow = { day: string; volume: string };

      const query = async (from: Date, to: Date): Promise<DayRow[]> => {
        const rows = await db.execute(sql`
          SELECT TO_CHAR(d.created_at AT TIME ZONE 'UTC', 'YYYY-MM-DD') AS day,
                 SUM(d.amount) AS volume
          FROM deposits d
          JOIN users u ON u.id = d.user_id
          WHERE u.referred_by = ${me.referralCode}
            AND d.status = 'completed'
            AND d.created_at >= ${from.toISOString()}::timestamptz
            AND d.created_at <= ${to.toISOString()}::timestamptz
          GROUP BY 1
          ORDER BY 1 DESC
        `);
        return ((rows as any)?.rows ?? rows) as DayRow[];
      };

      const [thisWeek, lastWeek] = await Promise.all([
        query(thisMonday, thisSunday),
        query(lastMonday, lastSunday),
      ]);

      const mapWeek = (rows: DayRow[]) => {
        const days = rows.map(r => ({
          date: r.day,
          volume: parseFloat(r.volume) || 0,
          gain: Math.round((parseFloat(r.volume) || 0) * 0.05 * 100) / 100,
        }));
        const totalVolume = days.reduce((s, d) => s + d.volume, 0);
        const totalGain   = Math.round(totalVolume * 0.05 * 100) / 100;
        return { days, totalVolume, totalGain };
      };

      res.json({ thisWeek: mapWeek(thisWeek), lastWeek: mapWeek(lastWeek) });
    } catch (error: any) {
      serverError(res, error);
    }
  });

  // Tasks
  app.get("/api/tasks", requireAuth, async (req, res) => {
    try {
      const tasks = await storage.getTasksWithStatus(req.session.userId!);
      res.json(tasks);
    } catch (error: any) {
      serverError(res, error);
    }
  });

  app.post("/api/tasks/:id/claim", requireAuth, async (req, res) => {
    try {
      await storage.claimTask(req.session.userId!, parseInt(req.params.id));
      res.json({ success: true });
    } catch (error: any) {
      res.status(400).json({ message: error.message });
    }
  });

  // Daily bonus claim (50 FCFA every 24h)
  app.post("/api/claim-daily-bonus", requireAuth, async (req, res) => {
    try {
      const user = await storage.getUser(req.session.userId!);
      if (!user) {
        return res.status(404).json({ message: "Utilisateur non trouve" });
      }

      const now = new Date();
      const lastClaim = user.lastDailyBonusClaim ? new Date(user.lastDailyBonusClaim) : null;
      
      if (lastClaim) {
        const hoursSinceClaim = (now.getTime() - lastClaim.getTime()) / (1000 * 60 * 60);
        if (hoursSinceClaim < 24) {
          const hoursRemaining = Math.ceil(24 - hoursSinceClaim);
          return res.status(400).json({ 
            message: `Vous pouvez reclamer dans ${hoursRemaining}h`,
            canClaim: false,
            nextClaimIn: hoursRemaining
          });
        }
      }

      // Add 50 FCFA to balance
      const newBalance = parseFloat(user.balance) + 50;
      await storage.updateUser(user.id, { 
        balance: newBalance.toString(),
        lastDailyBonusClaim: now
      });

      // Create transaction record
      await storage.createTransaction({
        userId: user.id,
        type: "bonus",
        amount: "50",
        description: "Bonus quotidien"
      });

      res.json({ success: true, message: "Bonus de 50 FCFA ajoute!" });
    } catch (error: any) {
      serverError(res, error);
    }
  });

  app.get("/api/daily-bonus-status", requireAuth, async (req, res) => {
    try {
      const user = await storage.getUser(req.session.userId!);
      if (!user) {
        return res.status(404).json({ message: "Utilisateur non trouve" });
      }

      const now = new Date();
      const lastClaim = user.lastDailyBonusClaim ? new Date(user.lastDailyBonusClaim) : null;
      
      let canClaim = true;
      let hoursRemaining = 0;

      if (lastClaim) {
        const hoursSinceClaim = (now.getTime() - lastClaim.getTime()) / (1000 * 60 * 60);
        if (hoursSinceClaim < 24) {
          canClaim = false;
          hoursRemaining = Math.ceil(24 - hoursSinceClaim);
        }
      }

      const allTransactions = await storage.getUserTransactions(req.session.userId!);
      const bonusTransactions = allTransactions.filter(
        (t: any) => t.type === "bonus" && t.description === "Bonus quotidien"
      );
      const totalBonusClaimed = bonusTransactions.reduce(
        (sum: number, t: any) => sum + parseFloat(t.amount || "0"), 0
      );
      const daysPointed = bonusTransactions.length;

      res.json({ canClaim, hoursRemaining, totalBonusClaimed, daysPointed });
    } catch (error: any) {
      serverError(res, error);
    }
  });

  // Transactions
  app.get("/api/transactions", requireAuth, async (req, res) => {
    try {
      const transactions = await storage.getUserTransactions(req.session.userId!);
      res.json(transactions);
    } catch (error: any) {
      serverError(res, error);
    }
  });

  // Settings
  app.get("/api/settings", async (req, res) => {
    try {
      const settings = await storage.getSettings();
      res.json(publicSettings(settings));
    } catch (error: any) {
      serverError(res, error);
    }
  });

  app.get("/api/settings/links", async (req, res) => {
    try {
      const settings = await storage.getSettings();
      res.json({
        supportLink: settings.supportLink || "https://t.me/intelappgroup",
        support2Link: settings.support2Link || "https://t.me/intelappgroup",
        channelLink: settings.channelLink || "https://t.me/intelappgroup",
        groupLink: settings.groupLink || "https://t.me/intelappgroup",
        supportType: settings.supportType || "telegram",
        support2Type: settings.support2Type || "telegram",
        channelType: settings.channelType || "telegram",
        groupType: settings.groupType || "telegram",
        supportLabel: settings.supportLabel || "Service client",
        support2Label: settings.support2Label || "Service client 2",
        channelLabel: settings.channelLabel || "Chaîne officielle",
        groupLabel: settings.groupLabel || "Groupe de discussion",
        supportEnabled: settings.supportEnabled !== "false",
        support2Enabled: settings.support2Enabled !== "false",
        channelEnabled: settings.channelEnabled !== "false",
        groupEnabled: settings.groupEnabled !== "false",
        popupButtonLabel: settings.popupButtonLabel || "Cliquez ici pour rejoindre le groupe",
        withdrawalStartHour: settings.withdrawalStartHour || "9",
        withdrawalEndHour: settings.withdrawalEndHour || "17",
      });
    } catch (error: any) {
      serverError(res, error);
    }
  });

  app.get("/api/settings/withdrawal", requireAuth, async (req, res) => {
    try {
      const settings = await storage.getSettings();
      res.json({
        withdrawalFees: parseFloat(settings.withdrawalFees || "18"),
        withdrawalStartHour: parseInt(settings.withdrawalStartHour || "9"),
        withdrawalEndHour: parseInt(settings.withdrawalEndHour || "17"),
        maxWithdrawalsPerDay: parseInt(settings.maxWithdrawalsPerDay || "1"),
        minWithdrawal: parseInt(settings.minWithdrawal || "1000"),
      });
    } catch (error: any) {
      serverError(res, error);
    }
  });

  // Admin routes
  app.get("/api/admin/stats", requireAdmin, async (req, res) => {
    try {
      const startDate = req.query.startDate ? new Date(req.query.startDate as string) : undefined;
      const endDate = req.query.endDate ? new Date(req.query.endDate as string) : undefined;
      const stats = await storage.getStats(startDate, endDate);
      res.json(stats);
    } catch (error: any) {
      serverError(res, error);
    }
  });

  app.get("/api/admin/deposits", requireAdmin, async (req, res) => {
    try {
      const status = req.query.status as string || "pending";
      const deposits = await storage.getDeposits(status === "pending" ? "pending" : undefined);
      const filtered = status === "all" ? deposits : deposits.filter(d => d.status === status);
      res.json(filtered);
    } catch (error: any) {
      serverError(res, error);
    }
  });

  app.get("/api/admin/deposits/soleaspay-stats", requireAdmin, async (req, res) => {
    try {
      const allDeposits = await storage.getDeposits();
      const soleaspayDeposits = allDeposits.filter((d: any) => d.soleaspayReference || d.soleaspayOrderId);

      const approvedSoleaspay = soleaspayDeposits.filter((d: any) => d.status === "approved");
      const totalAll = approvedSoleaspay.reduce((sum: number, d: any) => sum + Number(d.amount), 0);
      const countAll = approvedSoleaspay.length;

      const today = new Date();
      today.setHours(0, 0, 0, 0);
      const approvedToday = approvedSoleaspay.filter((d: any) => new Date(d.createdAt) >= today);
      const totalToday = approvedToday.reduce((sum: number, d: any) => sum + Number(d.amount), 0);
      const countToday = approvedToday.length;

      const pendingSoleaspay = soleaspayDeposits.filter((d: any) => d.status === "pending" || d.status === "processing");
      const totalPending = pendingSoleaspay.reduce((sum: number, d: any) => sum + Number(d.amount), 0);
      const countPending = pendingSoleaspay.length;

      res.json({
        totalAll,
        countAll,
        totalToday,
        countToday,
        totalPending,
        countPending,
      });
    } catch (error: any) {
      serverError(res, error);
    }
  });

  app.post("/api/admin/deposits/:id/approve", requireAdmin, async (req, res) => {
    try {
      const deposit = await storage.updateDeposit(parseInt(req.params.id), {
        status: "approved",
        processedAt: new Date(),
        processedBy: req.session.userId,
      });

      const user = await storage.getUser(deposit.userId);
      if (user) {
        const isFirstDeposit = !user.hasDeposited;
        const newBalance = parseFloat(user.balance) + deposit.amount;
        await storage.updateUser(user.id, { 
          balance: newBalance.toFixed(2),
          hasDeposited: true,
        });
        
        await storage.createTransaction({
          userId: user.id,
          type: "deposit",
          amount: deposit.amount.toString(),
          description: "Dépôt validé",
        });
        if (isFirstDeposit) await storage.processDepositReferralCommissions(user.id, deposit.amount);
        await applyDepositBonus(user.id, deposit.amount, deposit.id);
      }

      await storage.logAdminAction(req.session.userId!, "approve_deposit", deposit.userId, `Dépôt ${deposit.id} approuvé: ${deposit.amount}F`);
      res.json(deposit);
    } catch (error: any) {
      res.status(400).json({ message: error.message });
    }
  });

  app.post("/api/admin/deposits/:id/reject", requireAdmin, async (req, res) => {
    try {
      const { ban } = req.body;
      const deposit = await storage.updateDeposit(parseInt(req.params.id), {
        status: "rejected",
        processedAt: new Date(),
        processedBy: req.session.userId,
        screenshot: null,
      });

      if (ban) {
        await storage.updateUser(deposit.userId, { isBanned: true });
        await storage.logAdminAction(req.session.userId!, "ban_user", deposit.userId, `Utilisateur banni pour fraude`);
      }

      await storage.logAdminAction(req.session.userId!, "reject_deposit", deposit.userId, `Dépôt ${deposit.id} rejeté`);
      res.json(deposit);
    } catch (error: any) {
      res.status(400).json({ message: error.message });
    }
  });

  app.post("/api/admin/verify-pin", requireAuth, async (req, res) => {
    try {
      const { pin } = req.body;
      const user = await storage.getUser(req.session.userId!);
      
      if (!user?.isAdmin) {
        return res.status(403).json({ message: "Acces refuse" });
      }
      
      const adminPath = "/admin-panel";

      // If password is not required for this admin, auto-verify
      if (user.isAdminPasswordRequired === false) {
        return res.json({ success: true, path: adminPath });
      }

      if (!user.adminPin) {
        return res.status(400).json({ message: "Code PIN non configure" });
      }
      
      if (user.adminPin !== pin) {
        return res.status(401).json({ message: "Code PIN incorrect" });
      }
      
      res.json({ success: true, path: adminPath });
    } catch (error: any) {
      res.status(400).json({ message: error.message });
    }
  });

  app.get("/api/admin/withdrawals", requireAdmin, async (req, res) => {
    try {
      const status = req.query.status as string || "pending";
      const withdrawals = await storage.getWithdrawals(status === "pending" ? "pending" : undefined);
      const filtered = status === "all" ? withdrawals : withdrawals.filter(w => w.status === status);
      res.json(filtered);
    } catch (error: any) {
      serverError(res, error);
    }
  });

  app.post("/api/admin/withdrawals/:id/approve", requireAdmin, async (req, res) => {
    try {
      const withdrawalId = parseInt(req.params.id);
      const existingWithdrawal = await storage.getWithdrawals();
      const withdrawalData = existingWithdrawal.find(w => w.id === withdrawalId);
      
      if (!withdrawalData) {
        return res.status(404).json({ message: "Retrait non trouve" });
      }

      const withdrawal = await storage.updateWithdrawal(withdrawalId, {
        status: "approved",
        processedAt: new Date(),
        processedBy: req.session.userId,
      });

      await storage.logAdminAction(req.session.userId!, "approve_withdrawal", withdrawalData.userId, `Retrait ${withdrawal.id} approuvé: ${withdrawalData.netAmount}F`);
      res.json(withdrawal);
    } catch (error: any) {
      res.status(400).json({ message: error.message });
    }
  });

  app.post("/api/admin/withdrawals/:id/reject", requireAdmin, async (req, res) => {
    try {
      const withdrawal = await storage.updateWithdrawal(parseInt(req.params.id), {
        status: "rejected",
        processedAt: new Date(),
        processedBy: req.session.userId,
      });

      // Refund the user
      const user = await storage.getUser(withdrawal.userId);
      if (user) {
        const newBalance = parseFloat(user.balance) + withdrawal.amount;
        await storage.updateUser(user.id, { balance: newBalance.toFixed(2) });
      }

      await storage.logAdminAction(req.session.userId!, "reject_withdrawal", withdrawal.userId, `Retrait ${withdrawal.id} rejeté et remboursé`);
      res.json(withdrawal);
    } catch (error: any) {
      res.status(400).json({ message: error.message });
    }
  });

  // ── Withdrawal eligibility check (client-facing) ───────────────────────────
  app.get("/api/withdrawal/eligibility", requireAuth, async (req, res) => {
    try {
      const user = await storage.getUser(req.session.userId!);
      if (!user) return res.status(401).json({ message: "Non authentifié" });

      if (user.withdrawalUnlocked) {
        return res.json({ eligible: true, unlocked: true, days: 2, needed: 2 });
      }

      const betDaysResult = await db.execute(
        sql`SELECT DISTINCT DATE(placed_at) AS bet_day
            FROM bets
            WHERE user_id = ${user.id}
            ORDER BY bet_day DESC
            LIMIT 10`
      );
      const betDays: string[] = (betDaysResult.rows as any[]).map(r =>
        typeof r.bet_day === "string" ? r.bet_day : (r.bet_day as Date).toISOString().slice(0, 10)
      );

      const today = new Date().toISOString().slice(0, 10);
      const yesterday = new Date(Date.now() - 86400000).toISOString().slice(0, 10);

      // Count consecutive streak from today backwards
      let streak = 0;
      const cur = new Date(); cur.setHours(0, 0, 0, 0);
      for (let i = 0; i < 30; i++) {
        const dayStr = cur.toISOString().slice(0, 10);
        if (betDays.includes(dayStr)) { streak++; cur.setDate(cur.getDate() - 1); }
        else break;
      }

      const eligible = betDays.length >= 2 &&
        (betDays[0] === today || betDays[0] === yesterday) &&
        Math.round((new Date(betDays[0]).getTime() - new Date(betDays[1]).getTime()) / 86400000) === 1;

      res.json({ eligible, unlocked: false, days: Math.min(streak, 2), needed: 2 });
    } catch (e: any) {
      serverError(res, e);
    }
  });

  // ── Admin: toggle withdrawal unlock for a user ──────────────────────────────
  app.post("/api/admin/users/:id/toggle-withdrawal-unlock", requireAdmin, async (req, res) => {
    try {
      const userId = parseInt(req.params.id);
      const user = await storage.getUser(userId);
      if (!user) return res.status(404).json({ message: "Utilisateur introuvable" });
      const newVal = !user.withdrawalUnlocked;
      await storage.updateUser(userId, { withdrawalUnlocked: newVal });
      await storage.logAdminAction(req.session.userId!, "toggle_withdrawal_unlock", userId,
        `Retrait ${newVal ? "débloqué" : "re-bloqué"} pour user ${userId}`);
      res.json({ withdrawalUnlocked: newVal });
    } catch (e: any) {
      serverError(res, e);
    }
  });

  // ── Taux de commission individuel par agent ──────────────────────────────
  app.patch("/api/admin/users/:id/commission-rate", requireAdmin, async (req, res) => {
    try {
      const userId = parseInt(req.params.id);
      const { rate } = req.body; // null = réinitialiser au global (5%)
      if (rate !== null && (isNaN(Number(rate)) || Number(rate) < 0 || Number(rate) > 100)) {
        return res.status(400).json({ message: "Taux invalide (0-100)" });
      }
      await db.execute(sql`UPDATE users SET agency_commission_rate = ${rate === null ? null : String(rate)} WHERE id = ${userId}`);
      await storage.logAdminAction(req.session.userId!, "set_commission_rate", userId,
        `Taux commission agence → ${rate === null ? "défaut (5%)" : rate + "%"} pour user ${userId}`);
      res.json({ success: true, agencyCommissionRate: rate });
    } catch (e: any) {
      serverError(res, e);
    }
  });

  app.get("/api/admin/users", requireAdmin, async (req, res) => {
    try {
      const search = (req.query.search as string) || "";
      const page = parseInt(req.query.page as string) || 1;
      const limit = parseInt(req.query.limit as string) || 50;
      const offset = (page - 1) * limit;
      
      const { users: allUsers, total } = await storage.getAllUsers(search, limit, offset);
      const usersWithTeam = await Promise.all(allUsers.map(async (user) => {
        const teamStats = await storage.getTeamStatsSimple(user.id);
        return { ...safeUser(user), ...teamStats, referrerName: null };
      }));
      res.json({ users: usersWithTeam, total, page, limit, totalPages: Math.ceil(total / limit) });
    } catch (error: any) {
      serverError(res, error);
    }
  });

  // ═══════════════════════════════════════════════════════
  // PLAN B — VIP exclusive list
  // ═══════════════════════════════════════════════════════

  /** List all Plan B members (with user info) */
  app.get("/api/admin/plan-b/users", requireAdmin, async (req, res) => {
    try {
      const rows = await db.execute(
        // @ts-ignore
        `SELECT pb.id, pb.user_id, pb.added_at, pb.added_by, pb.expires_at,
                u.full_name, u.phone, u.country, u.balance, u.referral_code,
                (pb.expires_at IS NOT NULL AND pb.expires_at < NOW()) AS is_expired
         FROM plan_b_users pb
         JOIN users u ON u.id = pb.user_id
         ORDER BY pb.added_at DESC`
      );
      res.json(rows.rows);
    } catch (e: any) {
      serverError(res, e);
    }
  });

  /** Add user to Plan B by userId (with optional duration) */
  app.post("/api/admin/plan-b/users", requireAdmin, async (req, res) => {
    try {
      const { userId, durationDays } = req.body;
      if (!userId) return res.status(400).json({ message: "userId requis" });
      const uid = parseInt(userId);
      const days = durationDays ? parseInt(durationDays) : null;

      const [existing] = await db.select().from(planBUsers).where(eqOp(planBUsers.userId, uid));
      if (existing) {
        // Modifier la durée d'un membre existant
        if (days) {
          await db.execute(sql`UPDATE plan_b_users SET expires_at = NOW() + (${days} || ' days')::interval WHERE user_id = ${uid}`);
        } else {
          await db.execute(sql`UPDATE plan_b_users SET expires_at = NULL WHERE user_id = ${uid}`);
        }
        const label = days ? `${days}j` : "illimité";
        await storage.logAdminAction(req.session.userId!, "plan_b_update_duration", uid,
          `Durée Plan B mise à jour : ${label}`);
        return res.json({ success: true, durationDays: days });
      }

      // Nouveau membre
      if (days) {
        await db.execute(sql`
          INSERT INTO plan_b_users (user_id, added_by, expires_at)
          VALUES (${uid}, ${req.session.userId}, NOW() + (${days} || ' days')::interval)
        `);
      } else {
        await db.execute(sql`
          INSERT INTO plan_b_users (user_id, added_by, expires_at)
          VALUES (${uid}, ${req.session.userId}, NULL)
        `);
      }
      await storage.logAdminAction(req.session.userId!, "plan_b_add", uid,
        `Utilisateur ${uid} ajouté au Plan B${days ? ` (${days}j)` : " (illimité)"}`);
      res.json({ success: true, durationDays: days });
    } catch (e: any) {
      serverError(res, e);
    }
  });

  /** Remove user from Plan B */
  app.delete("/api/admin/plan-b/users/:userId", requireAdmin, async (req, res) => {
    try {
      const uid = parseInt(req.params.userId);
      await db.delete(planBUsers).where(eqOp(planBUsers.userId, uid));
      await storage.logAdminAction(req.session.userId!, "plan_b_remove", uid, `Utilisateur ${uid} retiré du Plan B`);
      res.json({ message: "Utilisateur retiré du Plan B" });
    } catch (e: any) {
      serverError(res, e);
    }
  });

  /** Vider TOUTE la liste Plan B */
  app.delete("/api/admin/plan-b/users", requireAdmin, async (req, res) => {
    try {
      const countRows = await db.execute(sql`SELECT COUNT(*)::int AS n FROM plan_b_users`);
      const count = Number(((countRows as any)?.rows ?? countRows)[0]?.n ?? 0);
      await db.execute(sql`DELETE FROM plan_b_users`);
      await storage.logAdminAction(req.session.userId!, "plan_b_clear_all", null,
        `Liste Plan B vidée — ${count} membre(s) supprimé(s)`);
      res.json({ success: true, removed: count });
    } catch (e: any) {
      serverError(res, e);
    }
  });

  /** Toggle isVipOnly on a match */
  app.post("/api/admin/plan-b/matches/:id/toggle-vip", requireAdmin, async (req, res) => {
    try {
      const id = parseInt(req.params.id);
      const [match] = await db.select().from(matches).where(eqOp(matches.id, id));
      if (!match) return res.status(404).json({ message: "Match introuvable" });
      const newVal = !(match as any).isVipOnly;
      await db.update(matches).set({ isVipOnly: newVal } as any).where(eqOp(matches.id, id));
      await storage.logAdminAction(req.session.userId!, "plan_b_match_toggle", null,
        `Match ${id} isVipOnly → ${newVal}`);
      res.json({ id, isVipOnly: newVal });
    } catch (e: any) {
      serverError(res, e);
    }
  });

  /** Analyse — users with balance > 20 000 F not yet in Plan B */
  app.get("/api/admin/plan-b/analyse", requireAdmin, async (req, res) => {
    try {
      const threshold = parseFloat((req.query.threshold as string) || "20000");
      // Fetch all non-admin non-banned users with balance >= threshold
      const result = await db.execute(sql`
        SELECT u.id, u.full_name, u.phone, u.country, u.balance, u.referral_code,
               u.has_deposited, u.has_active_product,
               (SELECT COUNT(*) FROM users ref WHERE ref.referred_by = u.referral_code)::int AS team_count
        FROM users u
        WHERE CAST(u.balance AS NUMERIC) >= ${threshold}
          AND u.is_admin = false
          AND u.is_banned = false
        ORDER BY CAST(u.balance AS NUMERIC) DESC
      `);
      const allCandidates: any[] = Array.isArray((result as any).rows)
        ? (result as any).rows
        : Array.isArray(result)
          ? result as any[]
          : [];

      // Exclude users already in plan_b_users (safe even if table is empty)
      let planBIds = new Set<number>();
      try {
        const pbResult = await db.execute(sql`SELECT user_id FROM plan_b_users`);
        const pbRows: any[] = Array.isArray((pbResult as any).rows)
          ? (pbResult as any).rows
          : Array.isArray(pbResult) ? pbResult as any[] : [];
        planBIds = new Set(pbRows.map((r: any) => Number(r.user_id)));
      } catch { /* table may not exist yet */ }

      const list = allCandidates.filter(u => !planBIds.has(Number(u.id)));
      res.json({ threshold, candidates: list });
    } catch (e: any) {
      console.error("[plan-b/analyse error]", e?.message || e);
      res.status(500).json({ message: String(e?.message || "Erreur serveur") });
    }
  });

  /** Add multiple users to Plan B in bulk (with optional duration) */
  app.post("/api/admin/plan-b/bulk-add", requireAdmin, async (req, res) => {
    try {
      const { userIds, durationDays } = req.body as { userIds: number[]; durationDays?: number };
      if (!Array.isArray(userIds) || userIds.length === 0)
        return res.status(400).json({ message: "userIds[] requis" });

      const days = durationDays ? parseInt(String(durationDays)) : null;
      let added = 0;
      for (const uid of userIds) {
        const [existing] = await db.select().from(planBUsers).where(eqOp(planBUsers.userId, uid));
        if (existing) continue;
        if (days) {
          await db.execute(sql`INSERT INTO plan_b_users (user_id, added_by, expires_at) VALUES (${uid}, ${req.session.userId}, NOW() + (${days} || ' days')::interval)`);
        } else {
          await db.execute(sql`INSERT INTO plan_b_users (user_id, added_by, expires_at) VALUES (${uid}, ${req.session.userId}, NULL)`);
        }
        added++;
      }
      await storage.logAdminAction(req.session.userId!, "plan_b_bulk_add", null,
        `Ajout en masse : ${added} utilisateur(s) ajouté(s) au Plan B${durationDays ? ` (${durationDays}j)` : " (illimité)"}`);
      res.json({ success: true, added });
    } catch (e: any) {
      serverError(res, e);
    }
  });

  /** List matches eligible for Plan B (active, not finished) */
  app.get("/api/admin/plan-b/matches", requireAdmin, async (req, res) => {
    try {
      const rows = await db.select().from(matches)
        .where(eqOp(matches.isActive, true))
        .orderBy(descOp(matches.matchDate));
      res.json(rows);
    } catch (e: any) {
      serverError(res, e);
    }
  });

  app.get("/api/admin/users/:id/team", requireAdmin, async (req, res) => {
    try {
      const userId = parseInt(req.params.id);
      const team = await storage.getDetailedTeam(userId);
      res.json(team);
    } catch (error: any) {
      serverError(res, error);
    }
  });

  app.post("/api/admin/users/:id/:action", requireAdmin, async (req, res) => {
    try {
      const userId = parseInt(req.params.id);
      const action = req.params.action;
      const { value } = req.body;
      const adminUser = await storage.getUser(req.session.userId!);

      switch (action) {
        case "balance":
          await storage.updateUser(userId, { balance: value.toFixed(2) });
          await storage.logAdminAction(req.session.userId!, "update_balance", userId, `Solde modifié: ${value}F`);
          break;
        case "password":
          await storage.updateUser(userId, { password: value });
          await storage.logAdminAction(req.session.userId!, "reset_password", userId, `Mot de passe réinitialisé`);
          break;
        case "toggle-ban":
          const user1 = await storage.getUser(userId);
          await storage.updateUser(userId, { isBanned: !user1?.isBanned });
          await storage.logAdminAction(req.session.userId!, "toggle_ban", userId, `Statut banni: ${!user1?.isBanned}`);
          break;
        case "toggle-withdrawal":
          const user2 = await storage.getUser(userId);
          await storage.updateUser(userId, { isWithdrawalBlocked: !user2?.isWithdrawalBlocked });
          await storage.logAdminAction(req.session.userId!, "toggle_withdrawal", userId, `Retrait bloqué: ${!user2?.isWithdrawalBlocked}`);
          break;
        case "toggle-promoter":
          const user3 = await storage.getUser(userId);
          await storage.updateUser(userId, { isPromoter: !user3?.isPromoter, promoterSetBy: req.session.userId });
          await storage.logAdminAction(req.session.userId!, "toggle_promoter", userId, `Promoteur: ${!user3?.isPromoter}`);
          break;
        case "toggle-must-invite":
          const user4 = await storage.getUser(userId);
          await storage.updateUser(userId, { mustInviteToWithdraw: !user4?.mustInviteToWithdraw });
          await storage.logAdminAction(req.session.userId!, "toggle_must_invite", userId, `Doit inviter: ${!user4?.mustInviteToWithdraw}`);
          break;
        case "toggle-admin":
          if (!adminUser?.isSuperAdmin) {
            return res.status(403).json({ message: "Action réservée au super admin" });
          }
          const user5 = await storage.getUser(userId);
          const newAdminStatus = !user5?.isAdmin;
          await storage.updateUser(userId, { 
            isAdmin: newAdminStatus,
            adminSetBy: req.session.userId,
            adminSetAt: new Date(),
            adminPin: newAdminStatus && value ? value : null,
          });
          await storage.logAdminAction(req.session.userId!, "toggle_admin", userId, `Admin: ${newAdminStatus}`);
          break;
        case "update-admin-pin":
          if (!adminUser?.isSuperAdmin) {
            return res.status(403).json({ message: "Action réservée au super admin" });
          }
          await storage.updateUser(userId, { adminPin: value });
          await storage.logAdminAction(req.session.userId!, "update_admin_pin", userId, `PIN admin mis à jour`);
          break;
        case "toggle-password-required":
          if (!adminUser?.isSuperAdmin) {
            return res.status(403).json({ message: "Action réservée au super admin" });
          }
          await storage.updateUser(userId, { isAdminPasswordRequired: value });
          await storage.logAdminAction(req.session.userId!, "toggle_password_required", userId, `Mot de passe admin requis: ${value}`);
          break;
        case "assign-product":
          await storage.purchaseProduct(userId, value, true);
          await storage.logAdminAction(req.session.userId!, "assign_product", userId, `Produit ${value} attribué`);
          break;
        case "revoke-product":
          await storage.removeUserProduct(userId, value);
          await storage.logAdminAction(req.session.userId!, "revoke_product", userId, `Produit ${value} révoqué`);
          break;
        case "toggle-super-admin":
          if (!adminUser?.isSuperAdmin) {
            return res.status(403).json({ message: "Action réservée au super admin" });
          }
          const userSA = await storage.getUser(userId);
          const newSuperAdminStatus = !userSA?.isSuperAdmin;
          await storage.updateUser(userId, {
            isSuperAdmin: newSuperAdminStatus,
            isAdmin: newSuperAdminStatus ? true : userSA?.isAdmin,
          });
          await storage.logAdminAction(req.session.userId!, "toggle_super_admin", userId, `Super Admin: ${newSuperAdminStatus}`);
          break;
        case "toggle-banker":
          if (!adminUser?.isSuperAdmin && !adminUser?.isAdmin) {
            return res.status(403).json({ message: "Action réservée aux admins" });
          }
          const userBanker = await storage.getUser(userId);
          const newBankerStatus = !userBanker?.isBanker;
          await storage.updateUser(userId, { 
            isBanker: newBankerStatus,
            bankerSetBy: newBankerStatus ? req.session.userId : null,
          });
          await storage.logAdminAction(req.session.userId!, "toggle_banker", userId, `Bankier: ${newBankerStatus}`);
          break;
        default:
          return res.status(400).json({ message: "Action invalide" });
      }

      res.json({ success: true });
    } catch (error: any) {
      res.status(400).json({ message: error.message });
    }
  });

  app.get("/api/admin/products/all", requireAdmin, async (req, res) => {
    try {
      const allProducts = await storage.getProducts();
      res.json(allProducts);
    } catch (error: any) {
      serverError(res, error);
    }
  });

  app.get("/api/admin/users/:id/products", requireAdmin, async (req, res) => {
    try {
      const userId = parseInt(req.params.id);
      const userProductsList = await storage.getAllUserProducts(userId);
      res.json(userProductsList.map(up => ({
        id: up.userProduct.id,
        productId: up.userProduct.productId,
        productName: up.product.name,
        productPrice: up.product.price,
        dailyEarnings: up.product.dailyEarnings,
        isActive: up.userProduct.isActive,
        purchaseDate: up.userProduct.purchaseDate,
        daysClaimed: up.product.cycleDays - up.userProduct.daysRemaining,
        totalCycle: up.product.cycleDays,
      })));
    } catch (error: any) {
      serverError(res, error);
    }
  });

  app.post("/api/admin/products", requireAdmin, async (req, res) => {
    try {
      const { name, price, dailyEarnings, cycleDays, imageUrl } = req.body;
      if (!name || !price || !dailyEarnings || !cycleDays) {
        return res.status(400).json({ message: "Champs requis manquants" });
      }
      const priceInt = parseInt(price);
      const dailyInt = parseInt(dailyEarnings);
      const cycleInt = parseInt(cycleDays);
      const product = await storage.createProduct({
        name,
        price: priceInt,
        dailyEarnings: dailyInt,
        cycleDays: cycleInt,
        totalReturn: dailyInt * cycleInt,
        imageUrl: imageUrl || null,
        isFree: false,
        isActive: true,
        sortOrder: 0,
      });
      await storage.logAdminAction(req.session.userId!, "create_product", null, `Produit ${product.name} créé`);
      res.json(product);
    } catch (error: any) {
      res.status(400).json({ message: error.message });
    }
  });

  app.patch("/api/admin/products/:id", requireAdmin, async (req, res) => {
    try {
      const product = await storage.updateProduct(parseInt(req.params.id), req.body);
      await storage.logAdminAction(req.session.userId!, "update_product", null, `Produit ${product.id} modifié`);
      res.json(product);
    } catch (error: any) {
      res.status(400).json({ message: error.message });
    }
  });

  app.delete("/api/admin/products/:id", requireAdmin, async (req, res) => {
    try {
      const id = parseInt(req.params.id);
      await storage.deleteProduct(id);
      await storage.logAdminAction(req.session.userId!, "delete_product", null, `Produit ${id} supprimé`);
      res.json({ success: true });
    } catch (error: any) {
      res.status(400).json({ message: error.message });
    }
  });

  app.get("/api/admin/channels", requireAdmin, async (req, res) => {
    try {
      const channels = await storage.getPaymentChannels();
      res.json(channels);
    } catch (error: any) {
      serverError(res, error);
    }
  });

  app.post("/api/admin/channels", requireAdmin, async (req, res) => {
    try {
      const channel = await storage.createPaymentChannel({
        ...req.body,
        modifiedBy: req.session.userId,
      });
      await storage.logAdminAction(req.session.userId!, "create_channel", null, `Canal ${channel.name} créé`);
      res.json(channel);
    } catch (error: any) {
      res.status(400).json({ message: error.message });
    }
  });

  app.patch("/api/admin/channels/:id", requireAdmin, async (req, res) => {
    try {
      const channel = await storage.updatePaymentChannel(parseInt(req.params.id), {
        ...req.body,
        modifiedBy: req.session.userId,
      });
      await storage.logAdminAction(req.session.userId!, "update_channel", null, `Canal ${channel.name} modifié`);
      res.json(channel);
    } catch (error: any) {
      res.status(400).json({ message: error.message });
    }
  });

  app.delete("/api/admin/channels/:id", requireAdmin, async (req, res) => {
    try {
      await storage.deletePaymentChannel(parseInt(req.params.id));
      await storage.logAdminAction(req.session.userId!, "delete_channel", null, `Canal supprimé`);
      res.json({ success: true });
    } catch (error: any) {
      res.status(400).json({ message: error.message });
    }
  });

  app.get("/api/admin/settings", requireAdmin, async (req, res) => {
    try {
      const settings = await storage.getSettings();
      res.json(adminSettings(settings));
    } catch (error: any) {
      serverError(res, error);
    }
  });

  app.post("/api/admin/settings", requireAdmin, async (req, res) => {
    try {
      const entries = Object.entries(req.body);
      for (const [key, value] of entries) {
        if (!ADMIN_SETTING_KEYS.has(key)) continue;
        if (SENSITIVE_SETTING_KEYS.has(key) && (value === "" || value === MASKED_SETTING_VALUE)) continue;
        await storage.setSetting(key, value as string, req.session.userId);
      }
      await storage.logAdminAction(req.session.userId!, "update_settings", null, `Paramètres modifiés`);
      res.json({ success: true });
    } catch (error: any) {
      res.status(400).json({ message: error.message });
    }
  });

  // Reset stats route (Super Admin only)
  // ── Prime de parrainage — aperçu et versement ────────────────────────────
  app.get("/api/admin/prime-preview", requireAdmin, async (req, res) => {
    try {
      // Semaine en cours : lundi 00:00 → dimanche 23:59
      const now = new Date();
      const dayOfWeek = now.getDay() === 0 ? 6 : now.getDay() - 1;
      const monday = new Date(now);
      monday.setDate(now.getDate() - dayOfWeek);
      monday.setHours(0, 0, 0, 0);
      const sunday = new Date(monday);
      sunday.setDate(monday.getDate() + 6);
      sunday.setHours(23, 59, 59, 999);

      const isTuesday = now.getDay() === 2;

      // Pour chaque parrain actif, calculer le total des dépôts de ses filleuls cette semaine
      const rows = await db.execute(sql`
        SELECT
          u.id           AS user_id,
          u.full_name    AS full_name,
          u.phone        AS phone,
          u.referral_code AS referral_code,
          COALESCE(SUM(d.amount), 0)::numeric AS deposit_volume
        FROM users u
        JOIN users referred ON referred.referred_by = u.referral_code
        JOIN deposits d ON d.user_id = referred.id
          AND d.status = 'completed'
          AND d.created_at >= ${monday.toISOString()}::timestamptz
          AND d.created_at <= ${sunday.toISOString()}::timestamptz
        GROUP BY u.id, u.full_name, u.phone, u.referral_code
        HAVING COALESCE(SUM(d.amount), 0) > 0
        ORDER BY deposit_volume DESC
      `);

      // Récupérer les taux individuels de commission
      const userRatesRows = await db.execute(sql`SELECT id, agency_commission_rate FROM users WHERE agency_commission_rate IS NOT NULL`);
      const userRates: Record<number, number> = {};
      for (const row of ((userRatesRows as any)?.rows ?? userRatesRows)) {
        userRates[Number(row.id)] = parseFloat(row.agency_commission_rate);
      }

      const list: any[] = ((rows as any)?.rows ?? rows);
      const beneficiaries = list.map(r => {
        const uid = Number(r.user_id);
        const rate = (userRates[uid] ?? 5) / 100;
        const ratePercent = userRates[uid] ?? 5;
        const depositVolume = parseFloat(r.deposit_volume);
        return {
          userId:        uid,
          fullName:      r.full_name,
          phone:         r.phone,
          depositVolume,
          ratePercent,
          primeAmount:   Math.round(depositVolume * rate * 100) / 100,
        };
      });
      const totalPrime = beneficiaries.reduce((s, b) => s + b.primeAmount, 0);

      res.json({ isTuesday, beneficiaries, totalPrime, weekStart: monday.toISOString().slice(0, 10), weekEnd: sunday.toISOString().slice(0, 10) });
    } catch (e: any) {
      serverError(res, e);
    }
  });

  app.post("/api/admin/pay-weekly-prime", requireAdmin, async (req, res) => {
    try {
      const now = new Date();
      const dayOfWeek = now.getDay() === 0 ? 6 : now.getDay() - 1;
      const monday = new Date(now);
      monday.setDate(now.getDate() - dayOfWeek);
      monday.setHours(0, 0, 0, 0);
      const sunday = new Date(monday);
      sunday.setDate(monday.getDate() + 6);
      sunday.setHours(23, 59, 59, 999);

      const rows = await db.execute(sql`
        SELECT
          u.id           AS user_id,
          COALESCE(SUM(d.amount), 0)::numeric AS deposit_volume
        FROM users u
        JOIN users referred ON referred.referred_by = u.referral_code
        JOIN deposits d ON d.user_id = referred.id
          AND d.status = 'completed'
          AND d.created_at >= ${monday.toISOString()}::timestamptz
          AND d.created_at <= ${sunday.toISOString()}::timestamptz
        GROUP BY u.id
        HAVING COALESCE(SUM(d.amount), 0) > 0
      `);

      // Taux individuels
      const rateRows = await db.execute(sql`SELECT id, agency_commission_rate FROM users WHERE agency_commission_rate IS NOT NULL`);
      const userRates2: Record<number, number> = {};
      for (const row of ((rateRows as any)?.rows ?? rateRows)) {
        userRates2[Number(row.id)] = parseFloat(row.agency_commission_rate);
      }

      const list: any[] = ((rows as any)?.rows ?? rows);
      let credited = 0;

      for (const r of list) {
        const uid  = Number(r.user_id);
        const rate = (userRates2[uid] ?? 5) / 100;
        const prime = Math.round(parseFloat(r.deposit_volume) * rate * 100) / 100;
        if (prime <= 0) continue;

        const user = await storage.getUser(uid);
        if (!user) continue;
        const newBalance = parseFloat(user.balance) + prime;
        await storage.updateUser(uid, { balance: String(newBalance) });
        await storage.createTransaction({
          userId: uid, type: "prime_parrainage",
          amount: String(prime),
          description: `Prime parrainage semaine du ${monday.toISOString().slice(0, 10)} (${(userRates2[uid] ?? 5)}% dépôts filleuls)`,
        });
        credited++;
      }

      await storage.logAdminAction(req.session.userId!, "pay_weekly_prime", null,
        `Prime hebdomadaire versée à ${credited} parrain(s) — semaine du ${monday.toISOString().slice(0, 10)}`);

      res.json({ success: true, credited });
    } catch (e: any) {
      serverError(res, e);
    }
  });

  app.post("/api/admin/reset-stats", requireAdmin, async (req, res) => {
    try {
      const adminUser = await storage.getUser(req.session.userId!);
      if (!adminUser?.isSuperAdmin) {
        return res.status(403).json({ message: "Action réservée au super admin" });
      }

      await storage.resetStats();
      await storage.logAdminAction(req.session.userId!, "reset_stats", null, "Réinitialisation des statistiques de la plateforme");
      res.json({ success: true, message: "Statistiques réinitialisées" });
    } catch (error: any) {
      res.status(400).json({ message: error.message });
    }
  });

  // Gift Codes Routes
  app.get("/api/admin/gift-codes", requireAdmin, async (req, res) => {
    try {
      const codes = await storage.getAllGiftCodes();
      res.json(codes);
    } catch (error: any) {
      res.status(400).json({ message: error.message });
    }
  });

  const createGiftCodeSchema = z.object({
    code: z.string().min(1, "Le code est requis"),
    amount: z.number().positive("Le montant doit etre positif").or(z.string().transform(Number)),
    maxUses: z.number().int().positive("Le nombre d'utilisations doit etre positif"),
    expiresAt: z.string().refine((val) => !isNaN(Date.parse(val)), "Date d'expiration invalide"),
  });

  app.post("/api/admin/gift-codes", requireAdmin, async (req, res) => {
    try {
      const parseResult = createGiftCodeSchema.safeParse(req.body);
      if (!parseResult.success) {
        return res.status(400).json({ message: parseResult.error.errors[0]?.message || "Donnees invalides" });
      }

      const { code, amount, maxUses, expiresAt } = parseResult.data;

      const existingCode = await storage.getGiftCodeByCode(code);
      if (existingCode) {
        return res.status(400).json({ message: "Ce code existe deja" });
      }

      const giftCode = await storage.createGiftCode({
        code,
        amount: amount.toString(),
        maxUses,
        expiresAt: new Date(expiresAt),
        createdBy: req.session.userId!,
      });

      await storage.logAdminAction(req.session.userId!, "create_gift_code", null, `Code cadeau cree: ${code} - ${amount} FCFA`);
      res.json(giftCode);
    } catch (error: any) {
      res.status(400).json({ message: error.message });
    }
  });

  app.delete("/api/admin/gift-codes/:id", requireAdmin, async (req, res) => {
    try {
      const id = parseInt(req.params.id);
      await storage.deleteGiftCode(id);
      await storage.logAdminAction(req.session.userId!, "delete_gift_code", null, `Code cadeau supprimé: #${id}`);
      res.json({ success: true });
    } catch (error: any) {
      res.status(400).json({ message: error.message });
    }
  });

  const claimGiftCodeSchema = z.object({
    code: z.string().min(1, "Le code est requis"),
  });

  app.post("/api/gift-codes/claim", requireAuth, async (req, res) => {
    try {
      const parseResult = claimGiftCodeSchema.safeParse(req.body);
      if (!parseResult.success) {
        return res.status(400).json({ message: parseResult.error.errors[0]?.message || "Le code est requis" });
      }

      const code = parseResult.data.code.trim().toUpperCase();
      const userId = req.session.userId!;

      const giftCode = await storage.getGiftCodeByCode(code);
      if (!giftCode) {
        return res.status(404).json({ message: "Code invalide" });
      }

      if (!giftCode.isActive) {
        return res.status(400).json({ message: "Ce code n'est plus actif" });
      }

      if (new Date() > new Date(giftCode.expiresAt)) {
        return res.status(400).json({ message: "Ce code a expiré" });
      }

      if (giftCode.currentUses >= giftCode.maxUses) {
        return res.status(400).json({ message: "Ce code a atteint sa limite d'utilisation" });
      }

      const hasClaimed = await storage.hasUserClaimedGiftCode(userId, giftCode.id);
      if (hasClaimed) {
        return res.status(400).json({ message: "Vous avez déjà utilisé ce code" });
      }

      await storage.claimGiftCode(userId, giftCode.id, parseFloat(giftCode.amount));
      
      res.json({ 
        success: true, 
        message: `Félicitations! Vous avez reçu ${parseFloat(giftCode.amount).toLocaleString()} FCFA`,
        amount: parseFloat(giftCode.amount)
      });
    } catch (error: any) {
      res.status(400).json({ message: error.message });
    }
  });

  // Countries routes (public)
  app.get("/api/countries", async (req, res) => {
    try {
      const activeCountries = await storage.getActiveCountries();
      res.json(activeCountries);
    } catch (error: any) {
      serverError(res, error);
    }
  });

  // Admin country routes
  app.get("/api/admin/countries", requireAdmin, async (req, res) => {
    try {
      const allCountries = await storage.getCountries();
      res.json(allCountries);
    } catch (error: any) {
      serverError(res, error);
    }
  });

  app.post("/api/admin/countries", requireAdmin, async (req, res) => {
    try {
      const { code, name, currency, phonePrefix, operators, isActive } = req.body;
      if (!code || !name || !currency || !phonePrefix) {
        return res.status(400).json({ message: "Code, nom, devise et indicatif sont requis" });
      }
      const country = await storage.createCountry({
        code: code.toUpperCase(),
        name,
        currency,
        phonePrefix,
        operators: operators || "[]",
        isActive: isActive !== undefined ? isActive : true,
      });
      res.json(country);
    } catch (error: any) {
      res.status(400).json({ message: error.message });
    }
  });

  app.put("/api/admin/countries/:id", requireAdmin, async (req, res) => {
    try {
      const id = parseInt(req.params.id);
      const { code, name, currency, phonePrefix, operators, isActive } = req.body;
      const updateData: any = {};
      if (name !== undefined) updateData.name = name;
      if (currency !== undefined) updateData.currency = currency;
      if (phonePrefix !== undefined) updateData.phonePrefix = phonePrefix;
      if (operators !== undefined) updateData.operators = operators;
      if (isActive !== undefined) updateData.isActive = isActive;
      const country = await storage.updateCountry(id, updateData);
      res.json(country);
    } catch (error: any) {
      res.status(400).json({ message: error.message });
    }
  });

  app.delete("/api/admin/countries/:id", requireAdmin, async (req, res) => {
    try {
      const id = parseInt(req.params.id);
      await storage.deleteCountry(id);
      res.json({ success: true });
    } catch (error: any) {
      res.status(400).json({ message: error.message });
    }
  });

  // ==================== BANKER ROUTES ====================
  // Accessible to both admins and bankers

  app.get("/api/banker/deposits", requireBanker, async (req, res) => {
    try {
      const deposits = await storage.getDeposits();
      res.json(deposits);
    } catch (error: any) {
      serverError(res, error);
    }
  });

  app.get("/api/banker/withdrawals", requireBanker, async (req, res) => {
    try {
      const withdrawals = await storage.getWithdrawals();
      res.json(withdrawals);
    } catch (error: any) {
      serverError(res, error);
    }
  });

  app.post("/api/banker/deposits/:id/approve", requireBanker, async (req, res) => {
    try {
      const deposit = await storage.updateDeposit(parseInt(req.params.id), {
        status: "approved",
        processedAt: new Date(),
        processedBy: req.session.userId,
      });
      const user = await storage.getUser(deposit.userId);
      if (user) {
        const isFirstDeposit = !user.hasDeposited;
        const newBalance = parseFloat(user.balance) + deposit.amount;
        await storage.updateUser(user.id, { balance: newBalance.toFixed(2), hasDeposited: true });
        await storage.createTransaction({ userId: user.id, type: "deposit", amount: deposit.amount.toString(), description: "Dépôt validé par bankier" });
        if (isFirstDeposit) await storage.processDepositReferralCommissions(deposit.userId, deposit.amount);
        await applyDepositBonus(deposit.userId, deposit.amount, deposit.id);
      }
      await storage.logAdminAction(req.session.userId!, "approve_deposit", deposit.userId, `Dépôt ${deposit.id} approuvé par bankier: ${deposit.amount}F`);
      res.json(deposit);
    } catch (error: any) {
      res.status(400).json({ message: error.message });
    }
  });

  app.post("/api/banker/deposits/:id/reject", requireBanker, async (req, res) => {
    try {
      const deposit = await storage.updateDeposit(parseInt(req.params.id), {
        status: "rejected",
        processedAt: new Date(),
        processedBy: req.session.userId,
        screenshot: null,
      });
      await storage.logAdminAction(req.session.userId!, "reject_deposit", deposit.userId, `Dépôt ${deposit.id} rejeté par bankier`);
      res.json(deposit);
    } catch (error: any) {
      res.status(400).json({ message: error.message });
    }
  });

  app.post("/api/banker/withdrawals/:id/approve", requireBanker, async (req, res) => {
    try {
      const allWithdrawals = await storage.getWithdrawals();
      const withdrawalData = allWithdrawals.find(w => w.id === parseInt(req.params.id));
      if (!withdrawalData) return res.status(404).json({ message: "Retrait non trouvé" });
      const withdrawal = await storage.updateWithdrawal(parseInt(req.params.id), {
        status: "approved",
        processedAt: new Date(),
        processedBy: req.session.userId,
      });
      await storage.logAdminAction(req.session.userId!, "approve_withdrawal", withdrawalData.userId, `Retrait ${withdrawal.id} approuvé par bankier: ${withdrawalData.netAmount}F`);
      res.json(withdrawal);
    } catch (error: any) {
      res.status(400).json({ message: error.message });
    }
  });

  app.post("/api/banker/withdrawals/:id/reject", requireBanker, async (req, res) => {
    try {
      const withdrawal = await storage.updateWithdrawal(parseInt(req.params.id), {
        status: "rejected",
        processedAt: new Date(),
        processedBy: req.session.userId,
      });
      const user = await storage.getUser(withdrawal.userId);
      if (user) {
        const newBalance = parseFloat(user.balance) + withdrawal.amount;
        await storage.updateUser(user.id, { balance: newBalance.toFixed(2) });
      }
      await storage.logAdminAction(req.session.userId!, "reject_withdrawal", withdrawal.userId, `Retrait ${withdrawal.id} rejeté par bankier et remboursé`);
      res.json(withdrawal);
    } catch (error: any) {
      res.status(400).json({ message: error.message });
    }
  });


  // ═══════════════════════════════════════════════════════
  // SATWIN FOOT — Matches (public)
  // ═══════════════════════════════════════════════════════

  app.get("/api/matches", async (req, res) => {
    try {
      const { sql: rawSql } = await import("drizzle-orm");
      const cutoff = new Date(Date.now() - 3 * 60 * 60 * 1000);
      const rows = await db.select().from(matches)
        .where(
          andOp(
            eqOp(matches.isActive, true),
            rawSql`${matches.status} NOT IN ('finished','cancelled')`,
            rawSql`${matches.matchDate} >= ${cutoff}`
          )
        )
        .orderBy(ascOp(matches.matchDate));

      // Filter VIP-only matches: only show to Plan B members
      const userId = req.session?.userId;
      let isPlanB = false;
      if (userId) {
          const [planBEntry] = await db.select().from(planBUsers).where(eqOp(planBUsers.userId, userId));
        isPlanB = !!planBEntry && (!planBEntry.expiresAt || new Date(planBEntry.expiresAt) > new Date());
      }

      const filtered = rows.filter((m: any) => !m.isVipOnly || isPlanB);
      res.json(filtered);
    } catch (e: any) {
      serverError(res, e);
    }
  });

  // Check current user's Plan B status
  app.get("/api/user/bet-stats", requireAuth, async (req, res) => {
    try {
      const userId = req.session.userId!;
      const userBets = await db.select().from(bets).where(eqOp(bets.userId, userId));
      const pendingAmount = userBets
        .filter(b => b.status === "pending")
        .reduce((s, b) => s + parseFloat(b.amount), 0);
      const totalVolume = userBets
        .reduce((s, b) => s + parseFloat(b.amount), 0);
      res.json({ pendingAmount, totalVolume });
    } catch (e: any) {
      serverError(res, e);
    }
  });

  app.get("/api/user/plan-b-status", requireAuth, async (req, res) => {
    try {
      const userId = req.session.userId!;
      const [entry] = await db.select().from(planBUsers).where(eqOp(planBUsers.userId, userId));
      const isPlanB = !!entry && (!entry.expiresAt || new Date(entry.expiresAt) > new Date());
      res.json({ isPlanB, expiresAt: entry?.expiresAt ?? null });
    } catch (e: any) {
      serverError(res, e);
    }
  });

  // ═══════════════════════════════════════════════════════
  // SATWIN FOOT — Bets (protected)
  // ═══════════════════════════════════════════════════════

  app.post("/api/bets", requireAuth, async (req, res) => {
    try {
      const { matchId, amount } = req.body;
      const userId = req.session.userId!;
      if (!matchId || !amount) return res.status(400).json({ message: "matchId et amount requis" });
      const betAmount = parseFloat(amount);
      if (isNaN(betAmount) || betAmount <= 0) return res.status(400).json({ message: "Montant invalide" });
      if (betAmount > 100_000_000) return res.status(400).json({ message: "Montant trop élevé" }); // plafond absolu 100M

      const [match] = await db.select().from(matches).where(eqOp(matches.id, parseInt(matchId)));
      if (!match || !match.isActive) return res.status(404).json({ message: "Match introuvable ou inactif" });
      if (match.status === "finished" || match.status === "cancelled") return res.status(400).json({ message: "Ce match est terminé" });
      if (match.status === "live") return res.status(400).json({ message: "Ce match est déjà en cours — les paris sont fermés." });
      if (betAmount < match.minBet) return res.status(400).json({ message: `Mise minimale: ${match.minBet} F` });
      if (betAmount > match.maxBet) return res.status(400).json({ message: `Mise maximale: ${match.maxBet} F` });

      // Plan B check: VIP-only matches require user to be an active (non-expired) Plan B member
      if ((match as any).isVipOnly) {
        const [planBEntry] = await db.select().from(planBUsers).where(eqOp(planBUsers.userId, userId));
        const active = !!planBEntry && (!planBEntry.expiresAt || new Date(planBEntry.expiresAt) > new Date());
        if (!active) return res.status(403).json({ message: "Ce match est réservé aux membres du Plan B." });
      }

      const user = await storage.getUser(userId);
      if (!user) return res.status(404).json({ message: "Utilisateur introuvable" });
      if (parseFloat(user.balance) < betAmount) return res.status(400).json({ message: "Solde insuffisant" });

      // Multiple bets on the same match are allowed

      // Deduct balance
      await storage.updateUser(userId, { balance: (parseFloat(user.balance) - betAmount).toFixed(2) });

      // Create bet
      const [newBet] = await db.insert(bets).values({
        userId,
        matchId: match.id,
        amount: betAmount.toFixed(2),
        status: "pending",
      }).returning();

      // Transaction record
      await storage.createTransaction({
        userId,
        type: "bet",
        amount: (-betAmount).toFixed(2),
        description: `Pari: ${match.homeTeam} vs ${match.awayTeam} (score prévu: ${match.predictedScore})`,
      });

      res.json(newBet);
    } catch (e: any) {
      res.status(400).json({ message: e.message });
    }
  });

  app.get("/api/bets", requireAuth, async (req, res) => {
    try {
      const userId = req.session.userId!;
      const rows = await db.select({ bet: bets, match: matches })
        .from(bets)
        .leftJoin(matches, eqOp(bets.matchId, matches.id))
        .where(eqOp(bets.userId, userId))
        .orderBy(descOp(bets.placedAt));
      res.json(rows);
    } catch (e: any) {
      serverError(res, e);
    }
  });

  // ═══════════════════════════════════════════════════════
  // SATWIN FOOT — Admin: Match management
  // ═══════════════════════════════════════════════════════

  app.get("/api/admin/matches", requireAdmin, async (req, res) => {
    try {
      const all = await db.select().from(matches).orderBy(descOp(matches.matchDate));
      res.json(all);
    } catch (e: any) {
      serverError(res, e);
    }
  });

  /* ── Match betting statistics (per match + summary) ────────────────────── */
  app.get("/api/admin/matches/stats", requireAdmin, async (req, res) => {
    try {
      const { sql: rawSql } = await import("drizzle-orm");

      // Per-match aggregates
      const rows = await db.execute(rawSql`
        SELECT
          b.match_id                                    AS "matchId",
          COUNT(b.id)::int                              AS "betCount",
          COUNT(DISTINCT b.user_id)::int                AS "uniqueUsers",
          COALESCE(SUM(b.amount::numeric), 0)::numeric  AS "totalAmount"
        FROM bets b
        GROUP BY b.match_id
      `);

      const matchStats: Record<number, { betCount: number; uniqueUsers: number; totalAmount: number }> = {};
      for (const r of rows.rows as any[]) {
        matchStats[Number(r.matchId)] = {
          betCount:    Number(r.betCount),
          uniqueUsers: Number(r.uniqueUsers),
          totalAmount: Number(r.totalAmount),
        };
      }

      // Featured match IDs (match du jour)
      const featuredMatches = await db
        .select({ id: matches.id })
        .from(matches)
        .where(rawSql`${matches.isFeatured} = true`);
      const featuredIds = new Set(featuredMatches.map(m => m.id));

      // Summary: featured vs others
      const featuredSummary = { betCount: 0, uniqueUsers: 0, totalAmount: 0 };
      const otherSummary    = { betCount: 0, uniqueUsers: 0, totalAmount: 0 };

      for (const [matchId, s] of Object.entries(matchStats)) {
        const target = featuredIds.has(Number(matchId)) ? featuredSummary : otherSummary;
        target.betCount    += s.betCount;
        target.uniqueUsers += s.uniqueUsers;
        target.totalAmount += s.totalAmount;
      }

      // Today's date range summary (bets placed today regardless of match)
      const todayRows = await db.execute(rawSql`
        SELECT
          m.is_featured                                                    AS "isFeatured",
          COUNT(b.id)::int                                                 AS "betCount",
          COUNT(DISTINCT b.user_id)::int                                   AS "uniqueUsers",
          COALESCE(SUM(b.amount::numeric), 0)::numeric                     AS "totalAmount"
        FROM bets b
        JOIN matches m ON m.id = b.match_id
        WHERE b.placed_at >= CURRENT_DATE AND b.placed_at < CURRENT_DATE + INTERVAL '1 day'
        GROUP BY m.is_featured
      `);
      const todayFeatured = { betCount: 0, uniqueUsers: 0, totalAmount: 0 };
      const todayOther    = { betCount: 0, uniqueUsers: 0, totalAmount: 0 };
      for (const r of todayRows.rows as any[]) {
        const target = r.isFeatured ? todayFeatured : todayOther;
        target.betCount    = Number(r.betCount);
        target.uniqueUsers = Number(r.uniqueUsers);
        target.totalAmount = Number(r.totalAmount);
      }

      res.json({ matchStats, featuredSummary, otherSummary, todayFeatured, todayOther });
    } catch (e: any) {
      serverError(res, e);
    }
  });

  /* ── API-Football sync: import upcoming fixtures ─────────────────────────── */
  app.post("/api/admin/matches/sync", requireAdmin, async (req, res) => {
    try {
      const days = parseInt(req.body?.days) || 7;
      const fixtures = await fetchUpcomingFixtures(days);

      let imported = 0;
      let skipped  = 0;

      for (const f of fixtures) {
        if (!f.externalId) { skipped++; continue; }

        // Parameterized duplicate check — no string interpolation
        const dupRows = await db.execute(sql`SELECT id FROM matches WHERE external_id = ${String(f.externalId)} LIMIT 1`);
        const already = (dupRows as any)?.rows?.length > 0 || (Array.isArray(dupRows) && dupRows.length > 0);
        if (already) { skipped++; continue; }

        await db.insert(matches).values({
          homeTeam:       f.homeTeam,
          awayTeam:       f.awayTeam,
          homeFlag:       f.homeFlag || "🏴",
          awayFlag:       f.awayFlag || "🏴",
          predictedScore: "0-0",
          profitRate:     "7.5",
          matchDate:      new Date(f.matchDate),
          league:         f.league || "",
          externalId:     String(f.externalId),
          createdBy:      req.session.userId ?? null,
        });
        imported++;
      }

      await storage.logAdminAction(req.session.userId!, "sync_matches", null,
        `Sync API-Football: ${imported} importé(s), ${skipped} ignoré(s) sur ${fixtures.length}`);

      res.json({ message: `${imported} match(s) importé(s), ${skipped} ignoré(s)`, imported, skipped, total: fixtures.length });
    } catch (e: any) {
      console.error("[sync_matches]", e);
      // Admin endpoint — surface the real error so the panel can show it
      res.status(500).json({ message: `Erreur sync: ${e?.message || e}` });
    }
  });

  app.post("/api/admin/matches", requireAdmin, async (req, res) => {
    try {
      const { homeTeam, awayTeam, homeFlag, awayFlag, predictedScore, profitRate, matchDate, minBet, maxBet, league } = req.body;
      if (!homeTeam || !awayTeam || !predictedScore || !profitRate || !matchDate)
        return res.status(400).json({ message: "Champs requis manquants" });
      const [match] = await db.insert(matches).values({
        homeTeam, awayTeam,
        homeFlag:  homeFlag  || "🏴",
        awayFlag:  awayFlag  || "🏴",
        predictedScore,
        profitRate: String(profitRate),
        matchDate:  new Date(matchDate),
        minBet:     parseInt(minBet)  || 1500,
        maxBet:     parseInt(maxBet)  || 6000000,
        league:     league || "",
        createdBy:  req.session.userId,
      }).returning();
      await storage.logAdminAction(req.session.userId!, "create_match", null, `Match créé: ${homeTeam} vs ${awayTeam} (${matchDate})`);
      res.json(match);
    } catch (e: any) {
      res.status(400).json({ message: e.message });
    }
  });

  app.put("/api/admin/matches/:id", requireAdmin, async (req, res) => {
    try {
      const id = parseInt(req.params.id);
      const updates = req.body;
      if (updates.matchDate) updates.matchDate = new Date(updates.matchDate);
      if (updates.profitRate) updates.profitRate = String(updates.profitRate);
      const [updated] = await db.update(matches).set(updates).where(eqOp(matches.id, id)).returning();
      if (!updated) return res.status(404).json({ message: "Match introuvable" });

      // If match is being cancelled → auto-refund all pending bets
      if (updates.status === "cancelled") {
        const pendingBets = await db.select().from(bets)
          .where(andOp(eqOp(bets.matchId, id), eqOp(bets.status, "pending")));
        for (const bet of pendingBets) {
          await db.update(bets).set({ status: "refunded", profit: "0", settledAt: new Date() })
            .where(eqOp(bets.id, bet.id));
          const u = await storage.getUser(bet.userId);
          if (u) {
            await storage.updateUser(bet.userId, {
              balance: (parseFloat(u.balance) + parseFloat(bet.amount)).toFixed(2),
            });
            await storage.createTransaction({
              userId: bet.userId, type: "bet_refund", amount: bet.amount,
              description: `Remboursement automatique — match annulé: ${updated.homeTeam} vs ${updated.awayTeam}`,
            });
          }
        }
        if (pendingBets.length > 0)
          console.log(`[cancel] Match ${id} annulé — ${pendingBets.length} pari(s) remboursé(s) automatiquement`);
      }

      await storage.logAdminAction(req.session.userId!, "update_match", null, `Match ${id} modifié`);
      res.json(updated);
    } catch (e: any) {
      res.status(400).json({ message: e.message });
    }
  });

  app.delete("/api/admin/matches/:id", requireAdmin, async (req, res) => {
    try {
      const id = parseInt(req.params.id);
      await db.update(matches).set({ isActive: false }).where(eqOp(matches.id, id));
      await storage.logAdminAction(req.session.userId!, "delete_match", null, `Match ${id} désactivé`);
      res.json({ message: "Match désactivé" });
    } catch (e: any) {
      res.status(400).json({ message: e.message });
    }
  });

  // ── Admin: list all bets ──────────────────────────────────────────────────
  app.get("/api/admin/bets", requireAdmin, async (req, res) => {
    try {
      const rows = await db.select({ bet: bets, match: matches })
        .from(bets)
        .leftJoin(matches, eqOp(bets.matchId, matches.id))
        .orderBy(descOp(bets.placedAt))
        .limit(300);

      // Attach user info
      const userIds = [...new Set(rows.map(r => r.bet.userId))];
      const userList = await Promise.all(userIds.map(id => storage.getUser(id)));
      const userMap = new Map(userList.filter(Boolean).map(u => [u!.id, u!]));

      res.json(rows.map(r => ({
        ...r.bet,
        match: r.match,
        user: userMap.get(r.bet.userId) || null,
      })));
    } catch (e) { serverError(res, e); }
  });

  // ── Admin: refund a single pending bet ────────────────────────────────────
  app.post("/api/admin/bets/:id/refund", requireAdmin, async (req, res) => {
    try {
      const id = parseInt(req.params.id);
      const [bet] = await db.select().from(bets).where(eqOp(bets.id, id));
      if (!bet) return res.status(404).json({ message: "Pari introuvable" });
      if (bet.status !== "pending") return res.status(400).json({ message: "Seuls les paris en attente peuvent être remboursés" });

      await db.update(bets).set({ status: "refunded", profit: "0", settledAt: new Date() }).where(eqOp(bets.id, id));
      const u = await storage.getUser(bet.userId);
      if (u) {
        const betAmount = parseFloat(bet.amount);
        await storage.updateUser(bet.userId, { balance: (parseFloat(u.balance) + betAmount).toFixed(2) });
        await storage.createTransaction({ userId: bet.userId, type: "bet_refund", amount: bet.amount,
          description: `Remboursement pari #${id} par admin` });
      }
      await storage.logAdminAction(req.session.userId!, "refund_bet", null, `Pari #${id} remboursé à user ${bet.userId}`);
      res.json({ message: "Pari remboursé avec succès" });
    } catch (e) { serverError(res, e); }
  });

  app.post("/api/admin/matches/:id/settle", requireAdmin, async (req, res) => {
    try {
      const id = parseInt(req.params.id);
      const { realScore } = req.body;
      if (!realScore) return res.status(400).json({ message: "realScore requis" });

      const [match] = await db.select().from(matches).where(eqOp(matches.id, id));
      if (!match) return res.status(404).json({ message: "Match introuvable" });
      if (match.status === "finished") return res.status(400).json({ message: "Match déjà réglé" });

      // ── PARIS RENVERSÉ ──────────────────────────────────────────────────────
      // Score réel ≠ score prédit  → utilisateurs GAGNENT (mise + profit)
      // Score réel = score prédit  → plateforme gagne :
      //   • match Plan B (isVipOnly) → REMBOURSEMENT (l'admin a offert ce match aux Plan B)
      //   • match du jour (isFeatured) → REMBOURSEMENT (mise seule)
      //   • match ordinaire            → PERTE (rien)
      const scored = realScore.trim() === match.predictedScore.trim();
      // @ts-ignore columns added via ALTER TABLE
      const isFeatured = (match as any).isFeatured ?? false;
      // @ts-ignore
      const isVipOnly  = (match as any).isVipOnly  ?? false;

      // Résultat global du match (pour la colonne matches.result)
      let matchResult: string;
      if (!scored) {
        matchResult = "won";         // real ≠ predicted → tous gagnent
      } else if (isVipOnly) {
        matchResult = "plan_b";      // Plan B → remboursement différencié par parieur
      } else if (isFeatured) {
        matchResult = "refunded";    // match du jour → remboursement de tous
      } else {
        matchResult = "lost";        // match ordinaire → perte pour tous
      }

      await db.update(matches).set({ realScore, result: matchResult, status: "finished" }).where(eqOp(matches.id, id));

      const pendingBets = await db.select().from(bets)
        .where(andOp(eqOp(bets.matchId, id), eqOp(bets.status, "pending")));

      // Charger la liste Plan B active (non expirée) une seule fois
      const planBRows = await db.execute(sql`
        SELECT user_id FROM plan_b_users
        WHERE expires_at IS NULL OR expires_at > NOW()
      `);
      const planBSet = new Set(((planBRows as any)?.rows ?? planBRows).map((r: any) => Number(r.user_id)));

      let settled = 0;
      const profitRate = parseFloat(match.profitRate);

      for (const bet of pendingBets) {
        const betAmount = parseFloat(bet.amount);
        const isBettorPlanB = planBSet.has(bet.userId);

        // Déterminer le résultat pour CE parieur
        let betOutcome: "won" | "refunded" | "lost";
        if (matchResult === "won") {
          betOutcome = "won";
        } else if (matchResult === "refunded") {
          betOutcome = "refunded";
        } else if (matchResult === "plan_b") {
          // Seuls les membres Plan B sont remboursés ; les autres perdent
          betOutcome = isBettorPlanB ? "refunded" : "lost";
        } else {
          betOutcome = "lost";
        }

        if (betOutcome === "won") {
          const profit = betAmount * profitRate / 100;
          const totalReturn = betAmount + profit;
          await db.update(bets).set({ status: "won", profit: profit.toFixed(2), settledAt: new Date() }).where(eqOp(bets.id, bet.id));
          const u = await storage.getUser(bet.userId);
          if (u) {
            await storage.updateUser(bet.userId, {
              balance:       (parseFloat(u.balance) + totalReturn).toFixed(2),
              todayEarnings: (parseFloat(u.todayEarnings) + profit).toFixed(2),
              totalEarnings: (parseFloat(u.totalEarnings) + profit).toFixed(2),
            });
            await storage.createTransaction({ userId: bet.userId, type: "bet_win", amount: totalReturn.toFixed(2),
              description: `Gain: ${match.homeTeam} vs ${match.awayTeam} — score réel ${realScore} ≠ ${match.predictedScore} +${profit.toFixed(0)}F` });
          }
        } else if (betOutcome === "refunded") {
          await db.update(bets).set({ status: "refunded", profit: "0", settledAt: new Date() }).where(eqOp(bets.id, bet.id));
          const u = await storage.getUser(bet.userId);
          if (u) {
            await storage.updateUser(bet.userId, { balance: (parseFloat(u.balance) + betAmount).toFixed(2) });
            const reason = matchResult === "plan_b" ? "Plan B" : "match du jour";
            await storage.createTransaction({ userId: bet.userId, type: "bet_refund", amount: betAmount.toFixed(2),
              description: `Remboursement (${reason}): ${match.homeTeam} vs ${match.awayTeam} — score ${realScore} = prédit` });
          }
        } else {
          // lost
          await db.update(bets).set({ status: "lost", profit: "0", settledAt: new Date() }).where(eqOp(bets.id, bet.id));
        }
        settled++;
      }

      await storage.logAdminAction(req.session.userId!, "settle_match", null, `Match ${id} réglé: ${matchResult}, ${settled} pari(s) traité(s), score réel: ${realScore}`);
      res.json({ message: `Match réglé (${matchResult}). ${settled} pari(s) traité(s).`, result: matchResult });
    } catch (e: any) {
      serverError(res, e);
    }
  });

  /* ── Live score polling job ───────────────────────────────────────────────── *
   * Every 60 s: fetch live fixtures from API-Football, update live_score on
   * matching DB rows, auto-settle when the match ends (status FT/AET/PEN).
   */
  async function runLiveScoreJob() {
    try {
      // ONE API call for all live matches — never call fetchFixtureById individually
      // (free plan has only 100 req/day; individual lookups drain the quota fast)
      const liveFixtures = await fetchLiveFixtures();
      if (liveFixtures.length === 0) {
        // Auto-cleanup: deactivate old finished/cancelled/stale upcoming matches
        await db.execute(
          // @ts-ignore
          `UPDATE matches SET is_active = false
           WHERE is_active = true
             AND status IN ('finished','cancelled')
             AND match_date < NOW() - INTERVAL '3 hours'`
        );
        await db.execute(
          // @ts-ignore
          `UPDATE matches SET is_active = false
           WHERE is_active = true AND status = 'upcoming'
             AND match_date < NOW() - INTERVAL '3 hours'`
        );
        return;
      }

      const liveMap = new Map(liveFixtures.map(f => [f.externalId, f]));

      // Fetch only DB matches whose external_id is currently live.
      // Uses Drizzle inArray — fully parameterized, no string interpolation.
      const externalIds = [...liveMap.keys()]
        .map(id => String(id).replace(/[^a-zA-Z0-9_-]/g, ""))
        .filter(Boolean);
      if (externalIds.length === 0) return;

      const rows = await db
        .select({
          id:             matches.id,
          external_id:    matches.externalId,
          predicted_score: matches.predictedScore,
          profit_rate:    matches.profitRate,
          home_team:      matches.homeTeam,
          away_team:      matches.awayTeam,
          status:         matches.status,
          is_featured:    matches.isFeatured,
          is_vip_only:    (matches as any).isVipOnly,
        })
        .from(matches)
        .where(andOp(eqOp(matches.isActive, true), inArray(matches.externalId, externalIds)))
        .limit(200);

      for (const row of rows) {
        const fixture = liveMap.get(row.external_id);
        if (!fixture) continue;

        const scoreStr = liveScoreStr(fixture);

        if (isFinished(fixture.statusShort) && row.status !== "finished") {
          // ── PARIS RENVERSÉ auto-settle ──────────────────────────────────────
          // Score réel ≠ prédit → tous GAGNENT
          // Score réel = prédit :
          //   isVipOnly (Plan B) → membres Plan B REMBOURSÉS, autres PERDENT
          //   isFeatured         → tous REMBOURSÉS
          //   ordinaire          → tous PERDENT
          const realScore = `${fixture.goalsHome}-${fixture.goalsAway}`;
          const scored = realScore.trim() === (row.predicted_score ?? "").trim();
          const isFeatured    = !!row.is_featured;
          const isVipOnlyLive = !!row.is_vip_only;

          let matchResult: string;
          if (!scored)          matchResult = "won";
          else if (isVipOnlyLive) matchResult = "plan_b";   // différencié par parieur
          else if (isFeatured)  matchResult = "refunded";
          else                  matchResult = "lost";

          // Sanitize before interpolation
          const safeRealScore  = realScore.replace(/[^0-9\-]/g, "").slice(0, 10);
          const safeMatchResult = ["won","plan_b","refunded","lost"].includes(matchResult) ? matchResult : "lost";
          await db.execute(
            // @ts-ignore
            `UPDATE matches SET real_score = '${safeRealScore}', result = '${safeMatchResult}', status = 'finished', live_score = NULL WHERE id = ${Number(row.id)}`
          );

          // Charger liste Plan B pour ce settle
          const pbRowsLive = await db.execute(sql`SELECT user_id FROM plan_b_users`);
          const planBSetLive = new Set(((pbRowsLive as any)?.rows ?? pbRowsLive).map((r: any) => Number(r.user_id)));

          // Settle pending bets
          const pendingBets = await db.select().from(bets)
            .where(andOp(eqOp(bets.matchId, row.id), eqOp(bets.status, "pending")));

          const profitRate = parseFloat(row.profit_rate);
          for (const bet of pendingBets) {
            const betAmount = parseFloat(bet.amount);
            const isBettorPlanB = planBSetLive.has(bet.userId);

            let betOutcome: "won" | "refunded" | "lost";
            if (matchResult === "won")      betOutcome = "won";
            else if (matchResult === "refunded") betOutcome = "refunded";
            else if (matchResult === "plan_b")   betOutcome = isBettorPlanB ? "refunded" : "lost";
            else                                 betOutcome = "lost";

            if (betOutcome === "won") {
              const profit = betAmount * profitRate / 100;
              const total  = betAmount + profit;
              await db.update(bets).set({ status: "won", profit: profit.toFixed(2), settledAt: new Date() })
                .where(eqOp(bets.id, bet.id));
              const u = await storage.getUser(bet.userId);
              if (u) {
                await storage.updateUser(bet.userId, {
                  balance:       (parseFloat(u.balance) + total).toFixed(2),
                  todayEarnings: (parseFloat(u.todayEarnings) + profit).toFixed(2),
                  totalEarnings: (parseFloat(u.totalEarnings) + profit).toFixed(2),
                });
                await storage.createTransaction({
                  userId: bet.userId, type: "bet_win", amount: total.toFixed(2),
                  description: `Gain auto: ${row.home_team} vs ${row.away_team} — ${realScore} ≠ ${row.predicted_score} +${profit.toFixed(0)}F`,
                });
              }
            } else if (betOutcome === "refunded") {
              await db.update(bets).set({ status: "refunded", profit: "0", settledAt: new Date() })
                .where(eqOp(bets.id, bet.id));
              const u = await storage.getUser(bet.userId);
              if (u) {
                await storage.updateUser(bet.userId, { balance: (parseFloat(u.balance) + betAmount).toFixed(2) });
                const reason = matchResult === "plan_b" ? "Plan B" : "match du jour";
                await storage.createTransaction({
                  userId: bet.userId, type: "bet_refund", amount: betAmount.toFixed(2),
                  description: `Remboursement auto (${reason}): ${row.home_team} vs ${row.away_team}`,
                });
              }
            } else {
              // lost
              await db.update(bets).set({ status: "lost", profit: "0", settledAt: new Date() })
                .where(eqOp(bets.id, bet.id));
            }
          }
          console.log(`[liveJob] Match ${row.id} (${row.home_team} vs ${row.away_team}) auto-réglé: ${matchResult}`);

        } else if (isInPlay(fixture.statusShort)) {
          // Sanitize scoreStr: keep digits, dash, apostrophe, space, quote-escape
          const safeScoreStr = scoreStr.replace(/'/g, "''").replace(/[^\w\s\-':]/g, "").slice(0, 50);
          await db.execute(
            // @ts-ignore
            `UPDATE matches SET live_score = '${safeScoreStr}', status = 'live' WHERE id = ${Number(row.id)}`
          );
        }
      }

      // Auto-deactivate finished/cancelled matches older than 3 hours
      await db.execute(
        // @ts-ignore
        `UPDATE matches
         SET is_active = false
         WHERE is_active = true
           AND status IN ('finished', 'cancelled')
           AND match_date < NOW() - INTERVAL '3 hours'`
      );

      // Auto-deactivate upcoming matches whose date passed more than 3 hours ago
      // (missed by the live job — no external_id or API didn't return them)
      await db.execute(
        // @ts-ignore
        `UPDATE matches
         SET is_active = false
         WHERE is_active = true
           AND status = 'upcoming'
           AND match_date < NOW() - INTERVAL '3 hours'`
      );

    } catch (e) {
      console.error("[liveJob] Erreur:", e);
    }
  }

  /* ── Catch-up job: settle matches that finished while server was offline ─────
   * Runs every 15 min. Finds "upcoming" DB rows whose match_date has passed
   * 90+ min ago and that still have pending bets. Groups by date → ONE API call
   * per date (preserves the 100 req/day free-plan quota).
   */
  async function runCatchUpSettlement() {
    try {
      // Find external_ids of upcoming matches with pending bets, past 90 min
      const staleRows = (await db.execute(
        // @ts-ignore
        `SELECT DISTINCT m.id, m.external_id, m.predicted_score, m.profit_rate,
                m.home_team, m.away_team, m.is_featured, m.is_vip_only,
                DATE(m.match_date AT TIME ZONE 'UTC') AS match_day
         FROM matches m
         JOIN bets b ON b.match_id = m.id AND b.status = 'pending'
         WHERE m.status = 'upcoming'
           AND m.external_id IS NOT NULL
           AND m.match_date < NOW() - INTERVAL '90 minutes'
         LIMIT 50`
      )) as any;
      const rows: any[] = staleRows?.rows ?? staleRows ?? [];
      if (rows.length === 0) return;

      console.log(`[catchUp] ${rows.length} match(s) non réglé(s) détecté(s)`);

      // Group by match_day → one API call per date
      const byDate = new Map<string, typeof rows>();
      for (const r of rows) {
        const day = String(r.match_day).slice(0, 10);
        if (!byDate.has(day)) byDate.set(day, []);
        byDate.get(day)!.push(r);
      }

      for (const [dateStr, dayRows] of byDate) {
        let apiFixtures: any[] = [];
        try {
          const json = await (await import("./apiFootball")).fetchUpcomingFixtures(0);
          // fetchUpcomingFixtures(0) won't work — call apiFetch directly via /fixtures?date=
          const res2 = await fetch(
            `https://v3.football.api-sports.io/fixtures?date=${dateStr}&timezone=Africa%2FAbidjan`,
            { headers: { "x-apisports-key": process.env.API_FOOTBALL_KEY || "" } }
          );
          const j2 = await res2.json();
          apiFixtures = j2.response ?? [];
        } catch (e) {
          console.error(`[catchUp] API error for ${dateStr}:`, e);
          continue;
        }

        const apiMap = new Map<string, any>(
          apiFixtures.map((f: any) => [String(f.fixture?.id), f])
        );

        for (const row of dayRows) {
          const apiF = apiMap.get(String(row.external_id));
          if (!apiF) continue;

          const statusShort: string = apiF.fixture?.status?.short ?? "";
          const finished = ["FT", "AET", "PEN"].includes(statusShort);
          if (!finished) continue;

          const goalsHome = apiF.goals?.home ?? 0;
          const goalsAway = apiF.goals?.away ?? 0;
          const realScore = `${goalsHome}-${goalsAway}`;
          const scored = realScore.trim() === (row.predicted_score ?? "").trim();
          const isFeatured = !!row.is_featured;
          const isVip = !!row.is_vip_only;

          let matchResult: string;
          if (!scored)              matchResult = "won";
          else if (isVip || isFeatured) matchResult = "refunded";
          else                      matchResult = "lost";

          const safeScore  = realScore.replace(/[^0-9\-]/g, "").slice(0, 10);
          const safeResult = ["won","refunded","lost"].includes(matchResult) ? matchResult : "lost";

          await db.execute(
            // @ts-ignore
            `UPDATE matches SET real_score='${safeScore}', result='${safeResult}', status='finished', live_score=NULL WHERE id=${Number(row.id)}`
          );

          const pendingBets = await db.select().from(bets)
            .where(andOp(eqOp(bets.matchId, row.id), eqOp(bets.status, "pending")));

          const profitRate = parseFloat(row.profit_rate);
          for (const bet of pendingBets) {
            const betAmount = parseFloat(bet.amount);
            if (matchResult === "won") {
              const profit = betAmount * profitRate / 100;
              const total  = betAmount + profit;
              await db.update(bets).set({ status: "won", profit: profit.toFixed(2), settledAt: new Date() }).where(eqOp(bets.id, bet.id));
              const u = await storage.getUser(bet.userId);
              if (u) {
                await storage.updateUser(bet.userId, {
                  balance:       (parseFloat(u.balance) + total).toFixed(2),
                  todayEarnings: (parseFloat(u.todayEarnings) + profit).toFixed(2),
                  totalEarnings: (parseFloat(u.totalEarnings) + profit).toFixed(2),
                });
                await storage.createTransaction({ userId: bet.userId, type: "bet_win", amount: total.toFixed(2),
                  description: `Gain rattrapage: ${row.home_team} vs ${row.away_team} — ${realScore} ≠ ${row.predicted_score} +${profit.toFixed(0)}F` });
              }
            } else if (matchResult === "refunded") {
              await db.update(bets).set({ status: "refunded", profit: "0", settledAt: new Date() }).where(eqOp(bets.id, bet.id));
              const u = await storage.getUser(bet.userId);
              if (u) {
                await storage.updateUser(bet.userId, { balance: (parseFloat(u.balance) + betAmount).toFixed(2) });
                await storage.createTransaction({ userId: bet.userId, type: "bet_refund", amount: betAmount.toFixed(2),
                  description: `Remboursement rattrapage: ${row.home_team} vs ${row.away_team}` });
              }
            } else {
              await db.update(bets).set({ status: "lost", profit: "0", settledAt: new Date() }).where(eqOp(bets.id, bet.id));
            }
          }
          console.log(`[catchUp] Match ${row.id} (${row.home_team} vs ${row.away_team}) réglé en rattrapage: ${matchResult} (${realScore})`);
        }
      }
    } catch (e) {
      console.error("[catchUp] Erreur:", e);
    }
  }

  // Run catch-up every 15 minutes
  setInterval(runCatchUpSettlement, 15 * 60 * 1000);
  runCatchUpSettlement(); // once at startup

  // ── Midnight auto-sync: import upcoming fixtures every night at 00:00 ──────
  async function runMidnightSync() {
    try {
      console.log("[midnightSync] Début de la synchronisation automatique…");
      const fixtures = await fetchUpcomingFixtures(2); // free plan: today + tomorrow
      let imported = 0, skipped = 0;

      for (const f of fixtures) {
        if (!f.externalId) { skipped++; continue; }
        // Parameterized duplicate check
        const dupRows = await db.execute(sql`SELECT id FROM matches WHERE external_id = ${String(f.externalId)} LIMIT 1`);
        const already = (dupRows as any)?.rows?.length > 0 || (Array.isArray(dupRows) && dupRows.length > 0);
        if (already) { skipped++; continue; }

        await db.insert(matches).values({
          homeTeam:       f.homeTeam,
          awayTeam:       f.awayTeam,
          homeFlag:       f.homeFlag || "🏴",
          awayFlag:       f.awayFlag || "🏴",
          predictedScore: "0-0",
          profitRate:     "7.5",
          matchDate:      new Date(f.matchDate),
          league:         f.league || "",
          externalId:     String(f.externalId),
        });
        imported++;
      }
      console.log(`[midnightSync] Terminé: ${imported} importé(s), ${skipped} ignoré(s)`);
    } catch (e) {
      console.error("[midnightSync] Erreur:", e);
    }
  }

  function scheduleMidnightSync() {
    const now = new Date();
    const nextMidnight = new Date(now);
    nextMidnight.setHours(24, 0, 30, 0); // 00:00:30 next day
    const msUntilMidnight = nextMidnight.getTime() - now.getTime();
    setTimeout(() => {
      runMidnightSync();
      setInterval(runMidnightSync, 24 * 60 * 60 * 1000); // repeat every 24h
    }, msUntilMidnight);
    const h = Math.floor(msUntilMidnight / 3600000);
    const m = Math.floor((msUntilMidnight % 3600000) / 60000);
    console.log(`[midnightSync] Prochaine sync dans ${h}h${m}m (à minuit)`);
  }

  // Start the jobs if API key is present
  if (process.env.API_FOOTBALL_KEY) {
    setInterval(runLiveScoreJob, 60_000);
    console.log("[liveJob] Score live activé (toutes les 60s)");
    scheduleMidnightSync();
  }

  return httpServer;
}
