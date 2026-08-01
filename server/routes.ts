import type { Express, Request, Response, NextFunction } from "express";
import { createServer, type Server } from "http";
import session from "express-session";
import { storage } from "./storage";
import bcrypt from "bcrypt";
import { registerSchema, loginSchema, depositSchema, walletSchema, phoneNumberSchema, matches, bets } from "@shared/schema";
import { db } from "./db";
import { eq as eqOp, and as andOp, asc as ascOp, desc as descOp } from "drizzle-orm";
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
const sessionDatabaseUrl = process.env.DATABASE_URL || process.env.SUPABASE_DATABASE_URL;
const sessionSecret = process.env.SESSION_SECRET;

if (!sessionDatabaseUrl) {
  throw new Error("No database URL configured for session storage.");
}
if (!sessionSecret) {
  throw new Error("SESSION_SECRET must be configured.");
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
      res.status(500).json({ message: error.message || "Erreur serveur" });
    }
  });

  app.post("/api/auth/login", async (req, res) => {
    if (checkBruteForce(req, res)) return;
    try {
      const data = loginSchema.parse(req.body);

      // Primary: look up by fullName (username chosen at registration)
      let user = await storage.getUserByFullName(data.username);

      // Fallback: phone-based lookup for admins or legacy accounts
      if (!user && data.phone && data.country) {
        user = await storage.getUserByPhone(data.phone, data.country);
      }
      if (!user && data.phone) {
        const adminCandidate = await storage.getUserByPhoneAnyCountry(data.phone);
        if (adminCandidate?.isAdmin) user = adminCandidate;
      }
      // Also try username as phone (legacy)
      if (!user) {
        const byPhone = await storage.getUserByPhoneAnyCountry(data.username);
        if (byPhone) user = byPhone;
      }

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
      res.status(500).json({ message: error.message || "Erreur serveur" });
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
      res.status(500).json({ message: error.message || "Erreur serveur" });
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
      res.status(500).json({ message: e.message || "Erreur serveur" });
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
      res.status(500).json({ message: error.message });
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
      res.status(500).json({ message: error.message });
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
      res.status(500).json({ message: error.message });
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

      // Manual channels created by admin (no gateway auto-processing)
      const manualChannels = channels.map((ch) => ({ ...ch, gateway: null }));

      res.json([...virtualChannels, ...manualChannels]);
    } catch (error: any) {
      res.status(500).json({ message: error.message });
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
      res.status(500).json({ message: error.message });
    }
  });

  // Staking Products (public)
  app.get("/api/staking/products", requireAuth, async (req, res) => {
    try {
      const all = await storage.getActiveStakingProducts();
      res.json(all);
    } catch (error: any) {
      res.status(500).json({ message: error.message });
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
      res.status(500).json({ message: error.message });
    }
  });

  // Admin Staking
  app.get("/api/admin/staking/products", requireAdmin, async (req, res) => {
    try {
      const all = await storage.getStakingProducts();
      res.json(all);
    } catch (error: any) {
      res.status(500).json({ message: error.message });
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
      res.status(500).json({ message: error.message });
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
      res.status(500).json({ message: error.message });
    }
  });

  // Admin Payment Numbers CRUD
  app.get("/api/admin/payment-numbers", requireAdmin, async (req, res) => {
    try {
      const nums = await storage.getPaymentNumbers();
      res.json(nums);
    } catch (error: any) {
      res.status(500).json({ message: error.message });
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

                await storage.processDepositReferralCommissions(deposit.userId, deposit.amount);
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
      res.status(500).json({ message: error.message });
    }
  });

  app.get("/api/deposits/history", requireAuth, async (req, res) => {
    try {
      const deposits = await storage.getUserDeposits(req.session.userId!);
      res.json(deposits);
    } catch (error: any) {
      res.status(500).json({ message: error.message });
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
      res.status(500).json({ success: false, message: error.message });
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
      const baseUrl = devDomain ? `https://${devDomain}` : "https://doosan.replit.app";
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
      res.status(500).json({ message: error.message || "Erreur serveur" });
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
      res.status(500).json({ message: error.message || "Erreur serveur" });
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
      res.status(500).json({ message: error.message || "Erreur serveur" });
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
      res.status(500).json({ message: error.message || "Erreur serveur" });
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
          }
        }
      }

      res.json({ status: newStatus || deposit.status, rawStatus: statusData.data.status });
    } catch (error: any) {
      console.error("[sendavapay] status check error:", error);
      res.status(500).json({ message: error.message });
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
          }
        } else if (event === "payment.failed" || event === "payment.expired" || status === "failed" || status === "cancelled") {
          await storage.updateDeposit(deposit.id, { status: "rejected", processedAt: new Date() });
        }

        res.json({ received: true });
      } catch (error: any) {
        console.error("[sendavapay webhook] error:", error);
        res.status(500).json({ message: error.message });
      }
    }
  );

  // Withdrawals
  app.post("/api/withdrawals", requireAuth, async (req, res) => {
    try {
      const { amount } = req.body;
      const user = await storage.getUser(req.session.userId!);
      
      if (!user) {
        return res.status(401).json({ message: "Non authentifié" });
      }

      const settingsForWithdrawal = await storage.getSettings();
      const minWithdrawal = parseInt(settingsForWithdrawal.minWithdrawal || "1000");
      if (amount < minWithdrawal) {
        return res.status(400).json({ message: `Montant minimum: ${minWithdrawal} FCFA` });
      }

      if (!user.hasActiveProduct) {
        return res.status(400).json({ message: "Achetez d'abord un produit" });
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
      res.status(500).json({ message: error.message });
    }
  });

  // Wallets
  app.get("/api/wallets", requireAuth, async (req, res) => {
    try {
      const wallets = await storage.getWallets(req.session.userId!);
      res.json(wallets);
    } catch (error: any) {
      res.status(500).json({ message: error.message });
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
      res.status(500).json({ message: error.message });
    }
  });

  app.get("/api/team/details", requireAuth, async (req, res) => {
    try {
      const team = await storage.getDetailedTeam(req.session.userId!);
      res.json(team);
    } catch (error: any) {
      res.status(500).json({ message: error.message });
    }
  });

  // Tasks
  app.get("/api/tasks", requireAuth, async (req, res) => {
    try {
      const tasks = await storage.getTasksWithStatus(req.session.userId!);
      res.json(tasks);
    } catch (error: any) {
      res.status(500).json({ message: error.message });
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
      res.status(500).json({ message: error.message });
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
      res.status(500).json({ message: error.message });
    }
  });

  // Transactions
  app.get("/api/transactions", requireAuth, async (req, res) => {
    try {
      const transactions = await storage.getUserTransactions(req.session.userId!);
      res.json(transactions);
    } catch (error: any) {
      res.status(500).json({ message: error.message });
    }
  });

  // Settings
  app.get("/api/settings", async (req, res) => {
    try {
      const settings = await storage.getSettings();
      res.json(publicSettings(settings));
    } catch (error: any) {
      res.status(500).json({ message: error.message });
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
        withdrawalStartHour: settings.withdrawalStartHour || "9",
        withdrawalEndHour: settings.withdrawalEndHour || "17",
      });
    } catch (error: any) {
      res.status(500).json({ message: error.message });
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
      res.status(500).json({ message: error.message });
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
      res.status(500).json({ message: error.message });
    }
  });

  app.get("/api/admin/deposits", requireAdmin, async (req, res) => {
    try {
      const status = req.query.status as string || "pending";
      const deposits = await storage.getDeposits(status === "pending" ? "pending" : undefined);
      const filtered = status === "all" ? deposits : deposits.filter(d => d.status === status);
      res.json(filtered);
    } catch (error: any) {
      res.status(500).json({ message: error.message });
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
      res.status(500).json({ message: error.message });
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
      
      // If password is not required for this admin, auto-verify
      if (user.isAdminPasswordRequired === false) {
        return res.json({ success: true });
      }

      if (!user.adminPin) {
        return res.status(400).json({ message: "Code PIN non configure" });
      }
      
      if (user.adminPin !== pin) {
        return res.status(401).json({ message: "Code PIN incorrect" });
      }
      
      res.json({ success: true });
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
      res.status(500).json({ message: error.message });
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
      res.status(500).json({ message: error.message });
    }
  });

  app.get("/api/admin/users/:id/team", requireAdmin, async (req, res) => {
    try {
      const userId = parseInt(req.params.id);
      const team = await storage.getDetailedTeam(userId);
      res.json(team);
    } catch (error: any) {
      res.status(500).json({ message: error.message });
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
      res.status(500).json({ message: error.message });
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
      res.status(500).json({ message: error.message });
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
      res.status(500).json({ message: error.message });
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
      res.status(500).json({ message: error.message });
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
      res.status(500).json({ message: error.message });
    }
  });

  // Admin country routes
  app.get("/api/admin/countries", requireAdmin, async (req, res) => {
    try {
      const allCountries = await storage.getCountries();
      res.json(allCountries);
    } catch (error: any) {
      res.status(500).json({ message: error.message });
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
      res.status(500).json({ message: error.message });
    }
  });

  app.get("/api/banker/withdrawals", requireBanker, async (req, res) => {
    try {
      const withdrawals = await storage.getWithdrawals();
      res.json(withdrawals);
    } catch (error: any) {
      res.status(500).json({ message: error.message });
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
        const newBalance = parseFloat(user.balance) + deposit.amount;
        await storage.updateUser(user.id, { balance: newBalance.toFixed(2), hasDeposited: true });
        await storage.createTransaction({ userId: user.id, type: "deposit", amount: deposit.amount.toString(), description: "Dépôt validé par bankier" });
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
      // Use Drizzle ORM so columns come back camelCase (homeTeam, matchDate…)
      // Filter: active, not finished/cancelled, match_date within last 3 hours
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
      res.json(rows);
    } catch (e: any) {
      res.status(500).json({ message: e.message });
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
      if (betAmount < match.minBet) return res.status(400).json({ message: `Mise minimale: ${match.minBet} F` });
      if (betAmount > match.maxBet) return res.status(400).json({ message: `Mise maximale: ${match.maxBet} F` });

      const user = await storage.getUser(userId);
      if (!user) return res.status(404).json({ message: "Utilisateur introuvable" });
      if (parseFloat(user.balance) < betAmount) return res.status(400).json({ message: "Solde insuffisant" });

      const [existing] = await db.select().from(bets)
        .where(andOp(eqOp(bets.userId, userId), eqOp(bets.matchId, match.id)));
      if (existing) return res.status(400).json({ message: "Vous avez déjà misé sur ce match" });

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
      res.status(500).json({ message: e.message });
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
      res.status(500).json({ message: e.message });
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

        // Check duplicate by external_id
        const existing = await db.execute(
          `SELECT id FROM matches WHERE external_id = $1 LIMIT 1`,
          // @ts-ignore raw query
        ).catch(() => null);

        // Use raw SQL to avoid TS issues with new columns not yet in Drizzle inferred type
        const rows = await db.execute(
          // @ts-ignore
          `SELECT id FROM matches WHERE external_id = '${f.externalId.replace(/'/g, "''")}' LIMIT 1`
        );
        const already = (rows as any)?.rows?.length > 0 || (rows as any)?.length > 0;
        if (already) { skipped++; continue; }

        await db.insert(matches).values({
          homeTeam:       f.homeTeam,
          awayTeam:       f.awayTeam,
          homeFlag:       f.homeFlag || "🏴",
          awayFlag:       f.awayFlag || "🏴",
          predictedScore: "0-0",   // admin can edit after import
          profitRate:     "7.5",
          matchDate:      f.matchDate,
          league:         f.league || "",
          // @ts-ignore extra columns added via ALTER TABLE
          externalId:     f.externalId,
          createdBy:      req.session.userId,
        });
        imported++;
      }

      await storage.logAdminAction(req.session.userId!, "sync_matches", null,
        `Sync API-Football: ${imported} importé(s), ${skipped} ignoré(s) sur ${fixtures.length}`);

      res.json({ message: `${imported} match(s) importé(s), ${skipped} ignoré(s)`, imported, skipped, total: fixtures.length });
    } catch (e: any) {
      console.error("[sync_matches]", e);
      res.status(500).json({ message: e.message });
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
        minBet:     parseInt(minBet)  || 1000,
        maxBet:     parseInt(maxBet)  || 500000,
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
      //   • match du jour (isFeatured) → REMBOURSEMENT (mise seule)
      //   • match ordinaire            → PERTE (rien)
      const scored = realScore.trim() === match.predictedScore.trim();
      // @ts-ignore isFeatured added via ALTER TABLE
      const isFeatured = (match as any).isFeatured ?? false;

      let matchResult: string;
      if (!scored) {
        matchResult = "won";         // real ≠ predicted → users win
      } else if (isFeatured) {
        matchResult = "refunded";    // real = predicted + featured → refund
      } else {
        matchResult = "lost";        // real = predicted + ordinary  → lose
      }

      await db.update(matches).set({ realScore, result: matchResult, status: "finished" }).where(eqOp(matches.id, id));

      const pendingBets = await db.select().from(bets)
        .where(andOp(eqOp(bets.matchId, id), eqOp(bets.status, "pending")));

      let settled = 0;
      const profitRate = parseFloat(match.profitRate);

      for (const bet of pendingBets) {
        const betAmount = parseFloat(bet.amount);
        if (matchResult === "won") {
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
            await storage.createTransaction({ userId: bet.userId, type: "bet_win", amount: totalReturn.toFixed(2), description: `Gain: ${match.homeTeam} vs ${match.awayTeam} — score réel ${realScore} ≠ ${match.predictedScore} +${profit.toFixed(0)}F` });
          }
        } else if (matchResult === "refunded") {
          await db.update(bets).set({ status: "refunded", profit: "0", settledAt: new Date() }).where(eqOp(bets.id, bet.id));
          const u = await storage.getUser(bet.userId);
          if (u) {
            await storage.updateUser(bet.userId, { balance: (parseFloat(u.balance) + betAmount).toFixed(2) });
            await storage.createTransaction({ userId: bet.userId, type: "bet_refund", amount: betAmount.toFixed(2), description: `Remboursement (match du jour): ${match.homeTeam} vs ${match.awayTeam} — score ${realScore} = prédit` });
          }
        } else {
          // matchResult === "lost" — ordinary match, platform wins, no refund
          await db.update(bets).set({ status: "lost", profit: "0", settledAt: new Date() }).where(eqOp(bets.id, bet.id));
        }
        settled++;
      }

      await storage.logAdminAction(req.session.userId!, "settle_match", null, `Match ${id} réglé: ${matchResult}, ${settled} pari(s) traité(s), score réel: ${realScore}`);
      res.json({ message: `Match réglé (${matchResult}). ${settled} pari(s) traité(s).`, result: matchResult });
    } catch (e: any) {
      res.status(500).json({ message: e.message });
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
      // Sanitize IDs to digits/alphanumeric only before interpolating into IN-clause.
      const sanitizedIds = [...liveMap.keys()]
        .map(id => String(id).replace(/[^a-zA-Z0-9_-]/g, ""))
        .filter(Boolean)
        .map(id => `'${id}'`)
        .join(",");
      if (!sanitizedIds) return;

      const liveRows = (await db.execute(
        // @ts-ignore
        `SELECT id, external_id, predicted_score, profit_rate, home_team, away_team, status, is_featured
         FROM matches
         WHERE is_active = true
           AND external_id IN (${sanitizedIds})
         LIMIT 200`
      )) as any;
      const rows: any[] = liveRows?.rows ?? liveRows ?? [];

      for (const row of rows) {
        const fixture = liveMap.get(row.external_id);
        if (!fixture) continue;

        const scoreStr = liveScoreStr(fixture);

        if (isFinished(fixture.statusShort) && row.status !== "finished") {
          // ── PARIS RENVERSÉ auto-settle ──────────────────────────────────────
          // Score réel ≠ prédit → users WIN | = prédit + featured → REFUND | = prédit + ordinary → LOSE
          const realScore = `${fixture.goalsHome}-${fixture.goalsAway}`;
          const scored = realScore.trim() === (row.predicted_score ?? "").trim();
          const isFeatured = !!row.is_featured;
          let matchResult: string;
          if (!scored)          matchResult = "won";
          else if (isFeatured)  matchResult = "refunded";
          else                  matchResult = "lost";

          // Sanitize before interpolation: realScore = "N-N" digits only, matchResult = enum word
          const safeRealScore = realScore.replace(/[^0-9\-]/g, "").slice(0, 10);
          const safeMatchResult = ["won","refunded","lost"].includes(matchResult) ? matchResult : "lost";
          await db.execute(
            // @ts-ignore
            `UPDATE matches SET real_score = '${safeRealScore}', result = '${safeMatchResult}', status = 'finished', live_score = NULL WHERE id = ${Number(row.id)}`
          );

          // Settle pending bets
          const pendingBets = await db.select().from(bets)
            .where(andOp(eqOp(bets.matchId, row.id), eqOp(bets.status, "pending")));

          const profitRate = parseFloat(row.profit_rate);
          for (const bet of pendingBets) {
            const betAmount = parseFloat(bet.amount);
            if (matchResult === "won") {
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
            } else if (matchResult === "refunded") {
              await db.update(bets).set({ status: "refunded", profit: "0", settledAt: new Date() })
                .where(eqOp(bets.id, bet.id));
              const u = await storage.getUser(bet.userId);
              if (u) {
                await storage.updateUser(bet.userId, { balance: (parseFloat(u.balance) + betAmount).toFixed(2) });
                await storage.createTransaction({
                  userId: bet.userId, type: "bet_refund", amount: betAmount.toFixed(2),
                  description: `Remboursement (match du jour): ${row.home_team} vs ${row.away_team}`,
                });
              }
            } else {
              // lost — ordinary match, platform wins, no refund
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

  // ── Midnight auto-sync: import upcoming fixtures every night at 00:00 ──────
  async function runMidnightSync() {
    try {
      console.log("[midnightSync] Début de la synchronisation automatique…");
      const fixtures = await fetchUpcomingFixtures(2); // free plan: today + tomorrow
      let imported = 0, skipped = 0;

      for (const f of fixtures) {
        if (!f.externalId) { skipped++; continue; }
        const rows = await db.execute(
          // @ts-ignore
          `SELECT id FROM matches WHERE external_id = '${f.externalId.replace(/'/g, "''")}' LIMIT 1`
        );
        const already = (rows as any)?.rows?.length > 0 || (Array.isArray(rows) && rows.length > 0);
        if (already) { skipped++; continue; }

        await db.execute(
          // @ts-ignore
          `INSERT INTO matches (home_team, away_team, home_flag, away_flag, predicted_score,
             profit_rate, match_date, league, external_id, is_active, created_at)
           VALUES ('${f.homeTeam.replace(/'/g,"''")}', '${f.awayTeam.replace(/'/g,"''")}',
             '${(f.homeFlag||"🏴").replace(/'/g,"''")}', '${(f.awayFlag||"🏴").replace(/'/g,"''")}',
             '0-0', '7.5', '${f.matchDate.toISOString()}',
             '${(f.league||"").replace(/'/g,"''")}', '${f.externalId}', true, NOW())
           ON CONFLICT DO NOTHING`
        );
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
