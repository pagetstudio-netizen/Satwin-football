import { db } from "./db";
import { users, products, tasks, paymentChannels, platformSettings, countries, stakingProducts } from "@shared/schema";
import bcrypt from "bcrypt";
import { eq, sql } from "drizzle-orm";

export async function seed() {
  console.log("Seeding database...");

  // Create session table for connect-pg-simple (if not exists)
  await db.execute(sql`
    CREATE TABLE IF NOT EXISTS "session" (
      "sid" varchar NOT NULL COLLATE "default",
      "sess" json NOT NULL,
      "expire" timestamp(6) NOT NULL,
      CONSTRAINT "session_pkey" PRIMARY KEY ("sid") NOT DEFERRABLE INITIALLY IMMEDIATE
    ) WITH (OIDS=FALSE)
  `);
  await db.execute(sql`
    CREATE INDEX IF NOT EXISTS "IDX_session_expire" ON "session" ("expire")
  `);

  // Ensure countries table exists
  await db.execute(sql`
    CREATE TABLE IF NOT EXISTS "countries" (
      "id" serial PRIMARY KEY,
      "code" text NOT NULL UNIQUE,
      "name" text NOT NULL,
      "currency" text NOT NULL,
      "phone_prefix" text NOT NULL,
      "operators" text NOT NULL DEFAULT '[]',
      "is_active" boolean NOT NULL DEFAULT true
    )
  `);

  // Check if admin already exists
  const existingAdmin = await db.select().from(users).where(eq(users.phone, "99935673"));
  const adminPassword = process.env.ADMIN_PASSWORD;

  const adminPin = process.env.ADMIN_PIN;

  if (existingAdmin.length === 0) {
    if (!adminPassword) {
      console.warn("No administrator exists yet; set ADMIN_PASSWORD to provision the initial admin.");
    } else {
      const hashedPassword = await bcrypt.hash(adminPassword, 12);
      await db.insert(users).values({
        fullName: "pagetstudio",
        phone: "99935673",
        country: "TG",
        password: hashedPassword,
        referralCode: "ADMIN1",
        balance: "0",
        isAdmin: true,
        isSuperAdmin: true,
        adminPin: adminPin || null,
      });
      console.log("Super admin created");
      if (adminPin) console.log("Super admin PIN configured");
    }
  } else {
    // Always update admin flags; also update password and PIN if env vars are set
    const updateData: any = { country: "TG", isAdmin: true, isSuperAdmin: true };
    if (adminPassword) {
      updateData.password = await bcrypt.hash(adminPassword, 12);
      console.log("Super admin password updated");
    }
    if (adminPin) {
      updateData.adminPin = adminPin;
      console.log("Super admin PIN updated");
    }
    await db.update(users)
      .set(updateData)
      .where(eq(users.phone, "99935673"));
    console.log("Super admin access verified");
  }

  // Seed countries only on first install — never overwrite admin changes
  const existingCountries = await db.select().from(countries);
  if (existingCountries.length === 0) {
    const defaultCountries = [
      {
        code: "TG",
        name: "Togo",
        currency: "XOF",
        phonePrefix: "228",
        operators: JSON.stringify(["Togocel", "Moov Africa Togo"]),
        isActive: true,
      },
      {
        code: "CM",
        name: "Cameroun",
        currency: "XAF",
        phonePrefix: "237",
        operators: JSON.stringify(["Orange Cameroun", "MTN Cameroun"]),
        isActive: true,
      },
      {
        code: "BF",
        name: "Burkina Faso",
        currency: "XOF",
        phonePrefix: "226",
        operators: JSON.stringify(["Orange Burkina", "Moov Africa Burkina"]),
        isActive: true,
      },
      {
        code: "NE",
        name: "Niger",
        currency: "XOF",
        phonePrefix: "227",
        operators: JSON.stringify(["NITA TRANSFERT", "AMANA TRANSFERT"]),
        isActive: true,
      },
      {
        code: "BJ",
        name: "Benin",
        currency: "XOF",
        phonePrefix: "229",
        operators: JSON.stringify(["MTN Benin", "Moov Africa Benin"]),
        isActive: true,
      },
    ];
    for (const countryData of defaultCountries) {
      await db.insert(countries).values(countryData);
      console.log(`Country added: ${countryData.name}`);
    }
  } else {
    console.log(`Countries skipped — ${existingCountries.length} existing countries preserved`);
  }

  // Seed products only if table is empty (first install only — never overwrite admin changes)
  const existingProducts = await db.select().from(products);
  if (existingProducts.length === 0) {
    const defaultProducts = [
      { name: "Bonus Gratuit", price: 0, dailyEarnings: 50, cycleDays: 1, totalReturn: 50, isFree: true, sortOrder: 0 },
      { name: "VIP 1", price: 4000, dailyEarnings: 300, cycleDays: 90, totalReturn: 27000, sortOrder: 1 },
      { name: "VIP 2", price: 10000, dailyEarnings: 800, cycleDays: 90, totalReturn: 72000, sortOrder: 2 },
      { name: "VIP 3", price: 15000, dailyEarnings: 1500, cycleDays: 90, totalReturn: 135000, sortOrder: 3 },
      { name: "VIP 4", price: 25000, dailyEarnings: 2000, cycleDays: 90, totalReturn: 180000, sortOrder: 4 },
      { name: "VIP 5", price: 40000, dailyEarnings: 3500, cycleDays: 90, totalReturn: 315000, sortOrder: 5 },
      { name: "VIP 6", price: 100000, dailyEarnings: 10000, cycleDays: 90, totalReturn: 900000, sortOrder: 6 },
      { name: "VIP 7", price: 250000, dailyEarnings: 30000, cycleDays: 90, totalReturn: 2700000, sortOrder: 7 },
    ];
    await db.insert(products).values(defaultProducts);
    console.log("Products seeded (first install)");
  } else {
    console.log(`Products skipped — ${existingProducts.length} existing products preserved`);
  }

  // Seed tasks only if table is empty (first install only — never overwrite admin changes)
  const existingTasks = await db.select().from(tasks);
  if (existingTasks.length === 0) {
    await db.insert(tasks).values([
      { name: "Parrain Bronze", description: "Inviter 3 personnes a investir", requiredInvites: 3, reward: 350, sortOrder: 1 },
      { name: "Parrain Argent", description: "Inviter 5 personnes a investir", requiredInvites: 5, reward: 750, sortOrder: 2 },
      { name: "Parrain Or", description: "Inviter 10 personnes a investir", requiredInvites: 10, reward: 2500, sortOrder: 3 },
      { name: "Parrain Platine", description: "Inviter 30 personnes a investir", requiredInvites: 30, reward: 6500, sortOrder: 4 },
      { name: "Parrain Diamant", description: "Inviter 100 personnes a investir", requiredInvites: 100, reward: 15000, sortOrder: 5 },
      { name: "Parrain Elite", description: "Inviter 300 personnes a investir", requiredInvites: 300, reward: 50000, sortOrder: 6 },
    ]);
    console.log("Tasks seeded (first install)");
  } else {
    console.log(`Tasks skipped — ${existingTasks.length} existing tasks preserved`);
  }

  // Check if payment channels exist
  const existingChannels = await db.select().from(paymentChannels);
  if (existingChannels.length === 0) {
    await db.insert(paymentChannels).values([
      { name: "LeekPay", redirectUrl: "https://leekpay.com/pay", isApi: false },
      { name: "FedaPay", redirectUrl: "https://fedapay.com/payment", isApi: false },
    ]);
    console.log("Payment channels seeded");
  }

  // Check if settings exist - apply new values for new keys or update existing
  const existingSettings = await db.select().from(platformSettings);
  const requiredSettings = [
    { key: "supportLink", value: "https://t.me/doosangroup" },
    { key: "supportType", value: "telegram" },
    { key: "supportLabel", value: "Service client" },
    { key: "support2Link", value: "https://t.me/doosangroup" },
    { key: "support2Type", value: "telegram" },
    { key: "support2Label", value: "Service client 2" },
    { key: "channelLink", value: "https://t.me/doosangroup" },
    { key: "channelType", value: "telegram" },
    { key: "channelLabel", value: "Chaîne officielle" },
    { key: "groupLink", value: "https://t.me/doosangroup" },
    { key: "groupType", value: "telegram" },
    { key: "groupLabel", value: "Groupe de discussion" },
    { key: "popupButtonLabel", value: "Cliquez ici pour rejoindre le groupe Telegram" },
   { key: "noticeText", value: "Bienvenue sur Doosan Robotics Investment Platform ! Investissez dans nos robots industriels et générez des revenus quotidiens. Rejoignez notre communauté et commencez à gagner dès aujourd'hui !" },
    { key: "supportEnabled", value: "true" },
    { key: "support2Enabled", value: "true" },
    { key: "channelEnabled", value: "true" },
    { key: "groupEnabled", value: "true" },
    { key: "minDeposit", value: "3000" },
    { key: "minWithdrawal", value: "1500" },
    { key: "withdrawalFees", value: "18" },
    { key: "withdrawalStartHour", value: "9" },
    { key: "withdrawalEndHour", value: "17" },
    { key: "maxWithdrawalsPerDay", value: "1" },
    { key: "level1Commission", value: "25" },
    { key: "level2Commission", value: "3" },
    { key: "level3Commission", value: "2" },
    { key: "signupBonus", value: "500" },
    { key: "soleaspayEnabled", value: "false" },
    { key: "soleaspayCountries", value: "" },
    { key: "soleaspayChannelName", value: "Westpay" },
    { key: "omnipayEnabled", value: "false" },
    { key: "omnipayChannelName", value: "OmniPay" },
    { key: "omnipayCallbackKey", value: "" },
    { key: "sendavapayEnabled", value: "false" },
    { key: "sendavapayChannelName", value: "SendavaPay" },
    { key: "sendavapayWebhookSecret", value: "" },
  ];

  for (const settingData of requiredSettings) {
    const existing = existingSettings.find(s => s.key === settingData.key);
    const isSensitive = /secret|key|token|password/i.test(settingData.key);
    if (!existing) {
      await db.insert(platformSettings).values(settingData);
      console.log(`Setting added: ${settingData.key}${isSensitive ? "" : ` = ${settingData.value}`}`);
    } else {
      console.log(`Setting preserved: ${existing.key}${isSensitive ? "" : ` = ${existing.value}`}`);
    }
  }
  console.log("Settings check complete");

  // Seed staking products only if table is empty (first install only — never overwrite admin changes)
  const existingStakingProducts = await db.select().from(stakingProducts);
  if (existingStakingProducts.length === 0) {
    await db.insert(stakingProducts).values([
      { name: "Produit 1", description: "5% par jour pendant 3 jours. Capital récupérable à la fin.", price: 2000, returnAmount: 2300, lockDays: 3, isActive: true },
      { name: "Produit 2", description: "5% par jour pendant 7 jours. Capital récupérable à la fin.", price: 5000, returnAmount: 6750, lockDays: 7, isActive: true },
      { name: "Produit 3", description: "5% par jour pendant 12 jours. Capital récupérable à la fin.", price: 10000, returnAmount: 16000, lockDays: 12, isActive: true },
      { name: "Produit 4", description: "5% par jour pendant 16 jours. Capital récupérable à la fin.", price: 20000, returnAmount: 36000, lockDays: 16, isActive: true },
      { name: "Produit 5", description: "5% par jour pendant 20 jours. Capital récupérable à la fin.", price: 50000, returnAmount: 100000, lockDays: 20, isActive: true },
    ]);
    console.log("Staking products seeded (first install)");
  } else {
    console.log(`Staking products skipped — ${existingStakingProducts.length} existing staking products preserved`);
  }

  console.log("Database seeding complete!");
}
