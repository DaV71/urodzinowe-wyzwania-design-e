import { PrismaClient } from "@/generated/prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";
import { getEnv } from "./env";

// Singleton — w dev chroni przed wieloma pulami połączeń przy HMR.
const g = globalThis as unknown as { prisma?: PrismaClient };

export const prisma =
  g.prisma ?? new PrismaClient({ adapter: new PrismaPg({ connectionString: getEnv().DATABASE_URL }) });

if (process.env.NODE_ENV !== "production") g.prisma = prisma;
