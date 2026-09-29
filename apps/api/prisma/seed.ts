import bcrypt from "bcryptjs";
import { PrismaClient } from "@prisma/client";
import type { MetalTier, PlanType } from "@prisma/client";

const prisma = new PrismaClient();
const PASSWORD_HASH_ROUNDS = 12;
const SEED_PASSWORD = "Password123!";

// ─── Plan catalog (mock data; carriers are fictional) ────────────────────────

const PLAN_YEAR = 2027;
const SEED_ZIPS = ["90001", "94103", "10001", "11201", "78701", "33101"];

// commissionBps: placeholder commission rates (basis points of annualized
// premium) until real rate tables exist.
const CARRIERS: Array<{
  code: string;
  name: string;
  priceFactor: number;
  zips: string[];
  planType: PlanType;
  commissionBps: number;
}> = [
  { code: "BLUEPEAK", name: "BluePeak Health", priceFactor: 1.0, zips: SEED_ZIPS, planType: "PPO", commissionBps: 500 },
  { code: "MERIDIAN", name: "Meridian Care", priceFactor: 0.9, zips: ["90001", "94103", "78701"], planType: "HMO", commissionBps: 400 },
  { code: "SUMMIT", name: "Summit Mutual", priceFactor: 1.12, zips: ["10001", "11201", "33101"], planType: "EPO", commissionBps: 550 },
  { code: "HARBOR", name: "Harbor Health Plans", priceFactor: 0.97, zips: ["94103", "10001", "33101"], planType: "POS", commissionBps: 450 },
];

// Baseline cost-sharing per metal tier, in dollars; premiums get scaled per carrier.
const TIERS: Array<{
  tier: MetalTier;
  label: string;
  premium: number;
  deductible: number;
  oopMax: number;
  pcp: number;
  specialist: number;
  generic: number;
  hsa: boolean;
}> = [
  { tier: "BRONZE", label: "Bronze Saver", premium: 342, deductible: 7500, oopMax: 9200, pcp: 60, specialist: 110, generic: 25, hsa: true },
  { tier: "SILVER", label: "Silver Select", premium: 468, deductible: 4000, oopMax: 8500, pcp: 35, specialist: 70, generic: 15, hsa: false },
  { tier: "GOLD", label: "Gold Plus", premium: 579, deductible: 1500, oopMax: 6500, pcp: 20, specialist: 45, generic: 10, hsa: false },
  { tier: "PLATINUM", label: "Platinum Premier", premium: 712, deductible: 250, oopMax: 3500, pcp: 10, specialist: 25, generic: 5, hsa: false },
];

const dollarsToCents = (dollars: number) => Math.round(dollars * 100);

async function seedPlanCatalog(): Promise<number> {
  let planCount = 0;

  for (const c of CARRIERS) {
    const carrier = await prisma.carrier.upsert({
      where: { code: c.code },
      update: { name: c.name },
      create: { code: c.code, name: c.name },
    });
    await prisma.commissionRate.upsert({
      where: { carrierId: carrier.id },
      update: {},
      create: { carrierId: carrier.id, rateBps: c.commissionBps },
    });

    for (const t of TIERS) {
      const name = `${c.name} ${t.label} ${c.planType}`;
      const data = {
        metalTier: t.tier,
        planType: c.planType,
        monthlyPremiumCents: dollarsToCents(t.premium * c.priceFactor),
        deductibleCents: dollarsToCents(t.deductible),
        outOfPocketMaxCents: dollarsToCents(t.oopMax),
        primaryCareCopayCents: dollarsToCents(t.pcp),
        specialistCopayCents: dollarsToCents(t.specialist),
        genericDrugCopayCents: dollarsToCents(t.generic),
        hsaEligible: t.hsa,
      };
      const plan = await prisma.plan.upsert({
        where: { carrierId_name_planYear: { carrierId: carrier.id, name, planYear: PLAN_YEAR } },
        update: data,
        create: { ...data, carrierId: carrier.id, name, planYear: PLAN_YEAR },
      });
      await prisma.planServiceArea.createMany({
        data: c.zips.map((zipCode) => ({ planId: plan.id, zipCode })),
        skipDuplicates: true,
      });
      planCount++;
    }
  }

  return planCount;
}

async function main() {
  const passwordHash = await bcrypt.hash(SEED_PASSWORD, PASSWORD_HASH_ROUNDS);

  const admin = await prisma.user.upsert({
    where: { email: "admin@example.com" },
    update: {},
    create: {
      email: "admin@example.com",
      passwordHash,
      firstName: "Ada",
      lastName: "Admin",
      role: "ADMIN",
      adminRole: "SUPER",
    },
  });

  const agent = await prisma.user.upsert({
    where: { email: "agent@example.com" },
    update: {},
    create: {
      email: "agent@example.com",
      passwordHash,
      firstName: "Alex",
      lastName: "Agent",
      role: "AGENT",
      agentProfile: {
        create: {
          licenseNumber: "LIC-000001",
          regions: ["CA", "NY"],
        },
      },
    },
  });

  // Second agent so every seeded ZIP's state has someone to assign to.
  const agent2 = await prisma.user.upsert({
    where: { email: "agent2@example.com" },
    update: {},
    create: {
      email: "agent2@example.com",
      passwordHash,
      firstName: "Sam",
      lastName: "Agent",
      role: "AGENT",
      agentProfile: {
        create: {
          licenseNumber: "LIC-000002",
          regions: ["TX", "FL"],
        },
      },
    },
  });

  const user = await prisma.user.upsert({
    where: { email: "user@example.com" },
    update: {},
    create: {
      email: "user@example.com",
      passwordHash,
      firstName: "Uma",
      lastName: "User",
      role: "USER",
    },
  });

  const planCount = await seedPlanCatalog();

  // eslint-disable-next-line no-console
  console.log("Seeded users:", { admin: admin.email, agent: agent.email, agent2: agent2.email, user: user.email });
  // eslint-disable-next-line no-console
  console.log(`Seeded ${planCount} plans across ZIPs: ${SEED_ZIPS.join(", ")}`);
  // eslint-disable-next-line no-console
  console.log(`All seeded accounts use the password: ${SEED_PASSWORD}`);
}

main()
  .catch((err) => {
    console.error(err);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
