import { sql, relations } from "drizzle-orm";
import { pgTable, text, varchar, integer, boolean, timestamp, decimal, serial } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod";


// Countries table (admin-managed)
export const countries = pgTable("countries", {
  id: serial("id").primaryKey(),
  code: text("code").notNull().unique(),
  name: text("name").notNull(),
  currency: text("currency").notNull(),
  phonePrefix: text("phone_prefix").notNull(),
  operators: text("operators").notNull().default("[]"), // JSON array string
  isActive: boolean("is_active").notNull().default(true),
});

// Users table
export const users = pgTable("users", {
  id: serial("id").primaryKey(),
  fullName: text("full_name").notNull(),
  phone: text("phone").notNull().unique(),
  country: text("country").notNull(),
  password: text("password").notNull(),
  referralCode: text("referral_code").notNull().unique(),
  referredBy: text("referred_by"),
  balance: decimal("balance", { precision: 15, scale: 2 }).notNull().default("200"),
  todayEarnings: decimal("today_earnings", { precision: 15, scale: 2 }).notNull().default("0"),
  totalEarnings: decimal("total_earnings", { precision: 15, scale: 2 }).notNull().default("0"),
  isAdmin: boolean("is_admin").notNull().default(false),
  isSuperAdmin: boolean("is_super_admin").notNull().default(false),
  isBanned: boolean("is_banned").notNull().default(false),
  isWithdrawalBlocked: boolean("is_withdrawal_blocked").notNull().default(false),
  isPromoter: boolean("is_promoter").notNull().default(false),
  mustInviteToWithdraw: boolean("must_invite_to_withdraw").notNull().default(false),
  hasDeposited: boolean("has_deposited").notNull().default(false),
  hasActiveProduct: boolean("has_active_product").notNull().default(false),
  createdAt: timestamp("created_at").notNull().defaultNow(),
  lastFreeProductClaim: timestamp("last_free_product_claim"),
  lastDailyBonusClaim: timestamp("last_daily_bonus_claim"),
  promoterSetBy: integer("promoter_set_by"),
  adminSetBy: integer("admin_set_by"),
  adminSetAt: timestamp("admin_set_at"),
  adminPin: text("admin_pin"),
  isAdminPasswordRequired: boolean("is_admin_password_required").notNull().default(true),
  isBanker: boolean("is_banker").notNull().default(false),
  bankerSetBy: integer("banker_set_by"),
  // User-configurable profile fields
  whatsapp: text("whatsapp"),
  telegram: text("telegram"),
  withdrawalCode: text("withdrawal_code"),
  securityQuestion: text("security_question"),
  securityAnswer: text("security_answer"),
  autoBetEnabled: boolean("auto_bet_enabled").notNull().default(false),
  amountShortcuts: text("amount_shortcuts").notNull().default("3000/5000/10000"),
  withdrawalUnlocked: boolean("withdrawal_unlocked").notNull().default(false),
  agencyCommissionRate: decimal("agency_commission_rate", { precision: 5, scale: 2 }), // null = 5% global
});

// Withdrawal wallets
export const withdrawalWallets = pgTable("withdrawal_wallets", {
  id: serial("id").primaryKey(),
  userId: integer("user_id").notNull().references(() => users.id),
  accountName: text("account_name").notNull(),
  accountNumber: text("account_number").notNull(),
  paymentMethod: text("payment_method").notNull(),
  country: text("country").notNull(),
  isDefault: boolean("is_default").notNull().default(true),
  createdAt: timestamp("created_at").notNull().defaultNow(),
});

// Products table
export const products = pgTable("products", {
  id: serial("id").primaryKey(),
  name: text("name").notNull(),
  price: integer("price").notNull(),
  dailyEarnings: integer("daily_earnings").notNull(),
  cycleDays: integer("cycle_days").notNull().default(80),
  totalReturn: integer("total_return").notNull(),
  imageUrl: text("image_url"),
  isFree: boolean("is_free").notNull().default(false),
  isActive: boolean("is_active").notNull().default(true),
  sortOrder: integer("sort_order").notNull().default(0),
});

// User products (investments)
export const userProducts = pgTable("user_products", {
  id: serial("id").primaryKey(),
  userId: integer("user_id").notNull().references(() => users.id),
  productId: integer("product_id").notNull().references(() => products.id),
  purchaseDate: timestamp("purchase_date").notNull().defaultNow(),
  lastEarningDate: timestamp("last_earning_date"),
  daysRemaining: integer("days_remaining").notNull(),
  totalEarned: decimal("total_earned", { precision: 15, scale: 2 }).notNull().default("0"),
  isActive: boolean("is_active").notNull().default(true),
  assignedByAdmin: boolean("assigned_by_admin").notNull().default(false),
});

// Deposits
export const deposits = pgTable("deposits", {
  id: serial("id").primaryKey(),
  userId: integer("user_id").notNull().references(() => users.id),
  amount: integer("amount").notNull(),
  accountName: text("account_name").notNull(),
  accountNumber: text("account_number").notNull(),
  country: text("country").notNull(),
  paymentMethod: text("payment_method").notNull(),
  paymentChannelId: integer("payment_channel_id"),
  paymentNumberId: integer("payment_number_id"),
  channelName: text("channel_name"),
  screenshot: text("screenshot"),
  paymentMessage: text("payment_message"),
  reference: text("reference"),
  status: text("status").notNull().default("pending"),
  soleaspayReference: text("soleaspay_reference"),
  soleaspayOrderId: text("soleaspay_order_id"),
  inpayOrderNumber: text("inpay_order_number"),
  inpayOutTradeNo: text("inpay_out_trade_no"),
  omnipayId: text("omnipay_id"),
  omnipayReference: text("omnipay_reference"),
  sendavapayReference: text("sendavapay_reference"),
  sendavapayToken: text("sendavapay_token"),
  ashtechpayTransactionId: text("ashtechpay_transaction_id"),
  ashtechpayReference: text("ashtechpay_reference"),
  createdAt: timestamp("created_at").notNull().defaultNow(),
  processedAt: timestamp("processed_at"),
  processedBy: integer("processed_by"),
});

// Withdrawals
export const withdrawals = pgTable("withdrawals", {
  id: serial("id").primaryKey(),
  userId: integer("user_id").notNull().references(() => users.id),
  amount: integer("amount").notNull(),
  netAmount: integer("net_amount").notNull(),
  fees: integer("fees").notNull(),
  accountName: text("account_name").notNull(),
  accountNumber: text("account_number").notNull(),
  country: text("country").notNull(),
  paymentMethod: text("payment_method").notNull(),
  status: text("status").notNull().default("pending"),
  inpayOrderNumber: text("inpay_order_number"),
  inpayOutTradeNo: text("inpay_out_trade_no"),
  omnipayId: text("omnipay_id"),
  omnipayReference: text("omnipay_reference"),
  createdAt: timestamp("created_at").notNull().defaultNow(),
  processedAt: timestamp("processed_at"),
  processedBy: integer("processed_by"),
});

// Payment channels (kept for withdrawal compatibility)
export const paymentChannels = pgTable("payment_channels", {
  id: serial("id").primaryKey(),
  name: text("name").notNull(),
  redirectUrl: text("redirect_url").notNull(),
  isApi: boolean("is_api").notNull().default(false),
  isActive: boolean("is_active").notNull().default(true),
  createdAt: timestamp("created_at").notNull().defaultNow(),
  modifiedBy: integer("modified_by"),
  modifiedAt: timestamp("modified_at"),
});

// Staking products (created by admin, locked funds)
export const stakingProducts = pgTable("staking_products", {
  id: serial("id").primaryKey(),
  name: text("name").notNull(),
  description: text("description"),
  price: integer("price").notNull(),
  returnAmount: integer("return_amount").notNull(),
  lockDays: integer("lock_days").notNull(),
  launchDate: timestamp("launch_date"),
  imageUrl: text("image_url"),
  isActive: boolean("is_active").notNull().default(true),
  createdAt: timestamp("created_at").notNull().defaultNow(),
  createdBy: integer("created_by"),
});
export type StakingProduct = typeof stakingProducts.$inferSelect;
export type InsertStakingProduct = typeof stakingProducts.$inferInsert;

// User stakings (purchases)
export const userStakings = pgTable("user_stakings", {
  id: serial("id").primaryKey(),
  userId: integer("user_id").notNull().references(() => users.id),
  stakingProductId: integer("staking_product_id").notNull().references(() => stakingProducts.id),
  amountPaid: integer("amount_paid").notNull(),
  returnAmount: integer("return_amount").notNull(),
  purchasedAt: timestamp("purchased_at").notNull().defaultNow(),
  releaseDate: timestamp("release_date").notNull(),
  status: text("status").notNull().default("active"),
  releasedAt: timestamp("released_at"),
});
export type UserStaking = typeof userStakings.$inferSelect;
export type InsertUserStaking = typeof userStakings.$inferInsert;

// Payment numbers (new deposit system)
export const paymentNumbers = pgTable("payment_numbers", {
  id: serial("id").primaryKey(),
  ownerName: text("owner_name").notNull(),
  phone: text("phone").notNull(),
  operatorName: text("operator_name").notNull(),
  country: text("country").notNull(),
  logoUrl: text("logo_url"),
  isActive: boolean("is_active").notNull().default(true),
  createdAt: timestamp("created_at").notNull().defaultNow(),
  createdBy: integer("created_by"),
});
export type PaymentNumber = typeof paymentNumbers.$inferSelect;
export type InsertPaymentNumber = typeof paymentNumbers.$inferInsert;

// Referral commissions
export const referralCommissions = pgTable("referral_commissions", {
  id: serial("id").primaryKey(),
  userId: integer("user_id").notNull().references(() => users.id),
  fromUserId: integer("from_user_id").notNull().references(() => users.id),
  level: integer("level").notNull(),
  amount: decimal("amount", { precision: 15, scale: 2 }).notNull(),
  productId: integer("product_id").references(() => products.id),
  createdAt: timestamp("created_at").notNull().defaultNow(),
});

// Tasks
export const tasks = pgTable("tasks", {
  id: serial("id").primaryKey(),
  name: text("name").notNull(),
  description: text("description").notNull(),
  requiredInvites: integer("required_invites").notNull(),
  reward: integer("reward").notNull(),
  sortOrder: integer("sort_order").notNull().default(0),
  isActive: boolean("is_active").notNull().default(true),
});

// User completed tasks
export const userTasks = pgTable("user_tasks", {
  id: serial("id").primaryKey(),
  userId: integer("user_id").notNull().references(() => users.id),
  taskId: integer("task_id").notNull().references(() => tasks.id),
  completedAt: timestamp("completed_at").notNull().defaultNow(),
  rewardClaimed: boolean("reward_claimed").notNull().default(true),
});

// Transaction history
export const transactions = pgTable("transactions", {
  id: serial("id").primaryKey(),
  userId: integer("user_id").notNull().references(() => users.id),
  type: text("type").notNull(),
  amount: decimal("amount", { precision: 15, scale: 2 }).notNull(),
  description: text("description").notNull(),
  createdAt: timestamp("created_at").notNull().defaultNow(),
});

// Platform settings
export const platformSettings = pgTable("platform_settings", {
  id: serial("id").primaryKey(),
  key: text("key").notNull().unique(),
  value: text("value").notNull(),
  modifiedBy: integer("modified_by"),
  modifiedAt: timestamp("modified_at"),
});

// Admin audit log
export const adminAuditLog = pgTable("admin_audit_log", {
  id: serial("id").primaryKey(),
  adminId: integer("admin_id").notNull().references(() => users.id),
  action: text("action").notNull(),
  targetUserId: integer("target_user_id"),
  details: text("details").notNull(),
  createdAt: timestamp("created_at").notNull().defaultNow(),
});

// Gift codes
export const giftCodes = pgTable("gift_codes", {
  id: serial("id").primaryKey(),
  code: text("code").notNull().unique(),
  amount: decimal("amount", { precision: 15, scale: 2 }).notNull(),
  maxUses: integer("max_uses").notNull(),
  currentUses: integer("current_uses").notNull().default(0),
  expiresAt: timestamp("expires_at").notNull(),
  createdBy: integer("created_by").notNull().references(() => users.id),
  createdAt: timestamp("created_at").notNull().defaultNow(),
  isActive: boolean("is_active").notNull().default(true),
});

// Gift code claims
export const giftCodeClaims = pgTable("gift_code_claims", {
  id: serial("id").primaryKey(),
  giftCodeId: integer("gift_code_id").notNull().references(() => giftCodes.id),
  userId: integer("user_id").notNull().references(() => users.id),
  claimedAt: timestamp("claimed_at").notNull().defaultNow(),
});

// Relations
export const usersRelations = relations(users, ({ many, one }) => ({
  products: many(userProducts),
  deposits: many(deposits),
  withdrawals: many(withdrawals),
  wallets: many(withdrawalWallets),
  commissionsReceived: many(referralCommissions, { relationName: "receiver" }),
  commissionsGiven: many(referralCommissions, { relationName: "giver" }),
  tasks: many(userTasks),
  transactions: many(transactions),
  referrer: one(users, {
    fields: [users.referredBy],
    references: [users.referralCode],
    relationName: "referrals",
  }),
  referrals: many(users, { relationName: "referrals" }),
}));

export const userProductsRelations = relations(userProducts, ({ one }) => ({
  user: one(users, { fields: [userProducts.userId], references: [users.id] }),
  product: one(products, { fields: [userProducts.productId], references: [products.id] }),
}));

export const depositsRelations = relations(deposits, ({ one }) => ({
  user: one(users, { fields: [deposits.userId], references: [users.id] }),
  channel: one(paymentChannels, { fields: [deposits.paymentChannelId], references: [paymentChannels.id] }),
}));

export const withdrawalsRelations = relations(withdrawals, ({ one }) => ({
  user: one(users, { fields: [withdrawals.userId], references: [users.id] }),
}));

export const referralCommissionsRelations = relations(referralCommissions, ({ one }) => ({
  receiver: one(users, { fields: [referralCommissions.userId], references: [users.id], relationName: "receiver" }),
  giver: one(users, { fields: [referralCommissions.fromUserId], references: [users.id], relationName: "giver" }),
  product: one(products, { fields: [referralCommissions.productId], references: [products.id] }),
}));

// Schemas
export const insertUserSchema = createInsertSchema(users).omit({
  id: true,
  balance: true,
  todayEarnings: true,
  totalEarnings: true,
  isAdmin: true,
  isSuperAdmin: true,
  isBanned: true,
  isWithdrawalBlocked: true,
  isPromoter: true,
  mustInviteToWithdraw: true,
  hasDeposited: true,
  hasActiveProduct: true,
  createdAt: true,
  lastFreeProductClaim: true,
  promoterSetBy: true,
  adminSetBy: true,
  adminSetAt: true,
});

export const insertCountrySchema = createInsertSchema(countries).omit({ id: true });

export const phoneNumberSchema = z.string()
  .trim()
  .regex(/^\+?[0-9]{8,15}$/, "Numéro de téléphone invalide");

export const registerSchema = z.object({
  fullName: z.string().trim().min(2, "Le nom complet est requis").max(100, "Nom trop long"),
  phone: phoneNumberSchema,
  country: z.string().trim().regex(/^[A-Z]{2,3}$/, "Pays invalide"),
  password: z.string().min(6, "Le mot de passe doit avoir au moins 6 caractères"),
  invitationCode: z.string().optional(),
});

export const loginSchema = z.object({
  username: z.string().trim().min(1, "Le nom d'utilisateur est requis"),
  password: z.string().min(1, "Le mot de passe est requis"),
});

export const depositSchema = z.object({
  amount: z.number().min(2000, "Le montant minimum est de 2000 FCFA"),
  accountName: z.string().trim().min(2, "Le nom du compte est requis").max(100, "Nom trop long"),
  accountNumber: phoneNumberSchema,
  country: z.string().trim().regex(/^[A-Z]{2,3}$/, "Pays invalide"),
  paymentMethod: z.string().trim().min(2, "Le moyen de paiement est requis").max(60, "Moyen de paiement invalide"),
  paymentChannelId: z.number().optional(),
});

export const withdrawalSchema = z.object({
  amount: z.number().min(1000, "Le montant minimum est de 1000 FCFA"),
});

export const walletSchema = z.object({
  accountName: z.string().trim().min(2, "Le nom du compte est requis").max(100, "Nom trop long"),
  accountNumber: phoneNumberSchema,
  paymentMethod: z.string().trim().min(2, "Le moyen de paiement est requis").max(60, "Moyen de paiement invalide"),
  country: z.string().trim().regex(/^[A-Z]{2,3}$/, "Pays invalide"),
});

export const giftCodeSchema = z.object({
  code: z.string().min(4, "Le code doit avoir au moins 4 caracteres"),
  amount: z.number().min(1, "Le montant doit etre positif"),
  maxUses: z.number().min(1, "Le nombre d'utilisations doit etre au moins 1"),
  expiresAt: z.string(),
});

// ── SATWIN FOOT: Matches ────────────────────────────────────────────────────
export const matches = pgTable("matches", {
  id:             serial("id").primaryKey(),
  homeTeam:       text("home_team").notNull(),
  awayTeam:       text("away_team").notNull(),
  homeFlag:       text("home_flag").notNull().default("🏴"),
  awayFlag:       text("away_flag").notNull().default("🏴"),
  predictedScore: text("predicted_score").notNull(),   // e.g. "2-1"
  profitRate:     decimal("profit_rate", { precision: 5, scale: 2 }).notNull(),
  matchDate:      timestamp("match_date").notNull(),
  minBet:         integer("min_bet").notNull().default(1500),
  maxBet:         integer("max_bet").notNull().default(6000000),
  status:         text("status").notNull().default("upcoming"), // upcoming|live|finished|cancelled
  realScore:      text("real_score"),
  result:         text("result"),                      // "won" | "lost"
  league:         text("league").notNull().default(""),
  isActive:       boolean("is_active").notNull().default(true),
  createdAt:      timestamp("created_at").notNull().defaultNow(),
  createdBy:      integer("created_by"),
  externalId:     text("external_id"),   // API-Football fixture ID
  liveScore:      text("live_score"),    // current score while live (e.g. "1-0 45'")
  isFeatured:     boolean("is_featured").notNull().default(false), // "match du jour"
  isVipOnly:      boolean("is_vip_only").notNull().default(false), // Plan B exclusif
});

// ── SATWIN FOOT: Bets ────────────────────────────────────────────────────────
export const bets = pgTable("bets", {
  id:         serial("id").primaryKey(),
  userId:     integer("user_id").notNull().references(() => users.id),
  matchId:    integer("match_id").notNull().references(() => matches.id),
  amount:     decimal("amount",  { precision: 15, scale: 2 }).notNull(),
  status:     text("status").notNull().default("pending"), // pending|won|refunded
  profit:     decimal("profit",  { precision: 15, scale: 2 }),
  placedAt:   timestamp("placed_at").notNull().defaultNow(),
  settledAt:  timestamp("settled_at"),
});

export type Match    = typeof matches.$inferSelect;
export type InsertMatch = typeof matches.$inferInsert;
export type Bet      = typeof bets.$inferSelect;
export type InsertBet = typeof bets.$inferInsert;

// ── SATWIN FOOT: Plan B (VIP exclusive) ─────────────────────────────────────
export const planBUsers = pgTable("plan_b_users", {
  id:        serial("id").primaryKey(),
  userId:    integer("user_id").notNull().references(() => users.id),
  addedAt:   timestamp("added_at").notNull().defaultNow(),
  addedBy:   integer("added_by"),
  expiresAt: timestamp("expires_at"),          // NULL = illimité
});
export type PlanBUser    = typeof planBUsers.$inferSelect;
export type InsertPlanBUser = typeof planBUsers.$inferInsert;

// Types
export type Country = typeof countries.$inferSelect;
export type InsertCountry = z.infer<typeof insertCountrySchema>;
export type User = typeof users.$inferSelect;
export type InsertUser = z.infer<typeof insertUserSchema>;
export type Product = typeof products.$inferSelect;
export type UserProduct = typeof userProducts.$inferSelect;
export type Deposit = typeof deposits.$inferSelect;
export type Withdrawal = typeof withdrawals.$inferSelect;
export type WithdrawalWallet = typeof withdrawalWallets.$inferSelect;
export type PaymentChannel = typeof paymentChannels.$inferSelect;
export type ReferralCommission = typeof referralCommissions.$inferSelect;
export type Task = typeof tasks.$inferSelect;
export type UserTask = typeof userTasks.$inferSelect;
export type Transaction = typeof transactions.$inferSelect;
export type PlatformSetting = typeof platformSettings.$inferSelect;
export type AdminAuditLog = typeof adminAuditLog.$inferSelect;
export type GiftCode = typeof giftCodes.$inferSelect;
export type GiftCodeClaim = typeof giftCodeClaims.$inferSelect;
