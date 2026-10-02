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

// ─── CMS ─────────────────────────────────────────────────────────────────────

const BLOG_POSTS = [
  {
    slug: "how-to-choose-a-health-plan",
    title: "How to choose a health plan in 5 steps",
    excerpt: "Premiums, deductibles and networks, explained — so you can compare plans with confidence.",
    status: "PUBLISHED" as const,
    content: [
      "<p>Picking a plan comes down to balancing what you pay every month against what you pay when you need care.</p>",
      "<h2>1. Start with your doctors</h2><p>If you have doctors you want to keep, check which plan networks include them before anything else.</p>",
      "<h2>2. Compare total cost, not just premiums</h2><p>A low premium usually means a higher deductible. Add the premium for a year to the out-of-pocket maximum to see your worst case.</p>",
      "<h2>3. Pick a metal tier</h2><ul><li><strong>Bronze</strong> — lowest premium, highest costs when you get care.</li><li><strong>Silver</strong> — balanced; may qualify for extra savings.</li><li><strong>Gold &amp; Platinum</strong> — higher premium, low costs at the doctor.</li></ul>",
      "<h2>4. Check prescriptions</h2><p>Look at the generic drug copay if you take regular medication.</p>",
      "<h2>5. Talk to a licensed agent</h2><p>Our agents can walk you through the options at no cost.</p>",
    ].join(""),
  },
  {
    slug: "open-enrollment-checklist",
    title: "Your open enrollment checklist",
    excerpt: "Documents to gather before you apply.",
    status: "DRAFT" as const,
    content: "<p>Have a photo ID, proof of address and, if you're applying for savings, recent proof of income ready.</p>",
  },
];

async function seedBlog(authorId: string): Promise<void> {
  for (const post of BLOG_POSTS) {
    await prisma.blogPost.upsert({
      where: { slug: post.slug },
      update: {},
      create: { ...post, authorId, publishedAt: post.status === "PUBLISHED" ? new Date() : null },
    });
  }
}

// ─── Optional demo history (SEED_DEMO_DATA=true) ─────────────────────────────
// Six months of fictional sign-ups, applications, decisions and commissions so
// the analytics dashboard has something to show in a fresh environment. Never
// run this against production.

const DEMO_FIRST = ["Ava", "Liam", "Mia", "Noah", "Zoe", "Eli", "Ivy", "Leo", "Ada", "Kai", "Nora", "Owen"];
const DEMO_LAST = ["Rivera", "Chen", "Patel", "Kim", "Brooks", "Nguyen", "Lopez", "Shah", "Reed", "Cole"];
const DEMO_COUNT = 60;
const DAY_MS = 86_400_000;

// Deterministic pseudo-random so re-seeding produces the same data.
function rng(seed: number) {
  let x = seed;
  return () => {
    x = (x * 1103515245 + 12345) % 2147483648;
    return x / 2147483648;
  };
}

async function seedDemoHistory(agentIds: string[], adminId: string, passwordHash: string): Promise<number> {
  const { encryptField, encryptJson } = await import("../src/lib/fieldCrypto");
  const { commissionAmountCents } = await import("../src/modules/agent/commissions");
  const plans = await prisma.plan.findMany({ include: { carrier: { include: { commissionRate: true } }, serviceAreas: true } });
  const rand = rng(42);
  let created = 0;

  for (let i = 0; i < DEMO_COUNT; i++) {
    const email = `demo${i + 1}@example.com`;
    if (await prisma.user.findUnique({ where: { email } })) continue;
    const createdAt = new Date(Date.now() - Math.floor(rand() * 180) * DAY_MS);
    const user = await prisma.user.create({
      data: {
        email,
        passwordHash,
        role: "USER",
        firstName: DEMO_FIRST[i % DEMO_FIRST.length],
        lastName: DEMO_LAST[i % DEMO_LAST.length],
        createdAt,
        lastLoginAt: createdAt,
      },
    });
    created++;

    // Roughly: 70% start, 80% of those submit, 85% accepted, then 75% approved.
    if (rand() > 0.7) continue;
    const plan = plans[Math.floor(rand() * plans.length)];
    const agentId = agentIds[Math.floor(rand() * agentIds.length)];
    const appCreated = new Date(createdAt.getTime() + Math.floor(rand() * 5) * DAY_MS);
    const submitted = rand() < 0.8;
    const accepted = submitted && rand() < 0.85;
    const decided = accepted && rand() < 0.8;
    const approved = decided && rand() < 0.75;
    const reviewedAt = decided ? new Date(appCreated.getTime() + (1 + Math.floor(rand() * 4)) * DAY_MS) : null;
    const rateBps = plan.carrier.commissionRate?.rateBps ?? 0;

    await prisma.application.create({
      data: {
        userId: user.id,
        agentId,
        planId: plan.id,
        status: !submitted ? "DRAFT" : !accepted ? "REJECTED" : !decided ? "SUBMITTED" : approved ? "APPROVED" : "REJECTED",
        submissionStatus: !submitted ? "NOT_SUBMITTED" : accepted ? "ACCEPTED" : "REJECTED",
        submissionAttempts: submitted ? 1 : 0,
        submittedAt: submitted ? appCreated : null,
        carrierReference: accepted ? `DEMO-${1000 + i}` : null,
        firstName: user.firstName,
        lastName: user.lastName,
        dateOfBirth: new Date("1988-04-12T00:00:00Z"),
        zipCode: plan.serviceAreas[0]?.zipCode ?? "10001",
        ssnEncrypted: encryptField(`12345${String(1000 + i).slice(-4)}`),
        ssnLast4: String(1000 + i).slice(-4),
        healthInfoEncrypted: encryptJson({ conditions: [], otherConditions: "", preferredDoctors: [] }),
        reviewedAt,
        reviewedById: decided ? adminId : null,
        reviewNotes: decided && !approved ? "Demo: outside eligibility window" : null,
        createdAt: appCreated,
        ...(accepted
          ? {
              commission: {
                create: {
                  agentId,
                  carrierId: plan.carrierId,
                  premiumCents: plan.monthlyPremiumCents,
                  rateBps,
                  amountCents: commissionAmountCents(plan.monthlyPremiumCents, rateBps),
                  status: !decided ? "PENDING" : approved ? (rand() < 0.4 ? "PAID" : "EARNED") : "VOID",
                  createdAt: appCreated,
                },
              },
            }
          : {}),
      },
    });
  }
  return created;
}

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
  await seedBlog(admin.id);

  if (process.env.SEED_DEMO_DATA === "true") {
    const demoUsers = await seedDemoHistory([agent.id, agent2.id], admin.id, passwordHash);
    // eslint-disable-next-line no-console
    console.log(`Seeded ${demoUsers} demo users with application history (SEED_DEMO_DATA=true)`);
  }

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
