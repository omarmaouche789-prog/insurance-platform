import bcrypt from "bcryptjs";
import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();
const PASSWORD_HASH_ROUNDS = 12;
const SEED_PASSWORD = "Password123!";

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

  // eslint-disable-next-line no-console
  console.log("Seeded users:", { admin: admin.email, agent: agent.email, user: user.email });
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
