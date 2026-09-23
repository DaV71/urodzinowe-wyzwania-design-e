import type { Actor, Prisma } from "@/generated/prisma/client";
import { prisma } from "./db";

type Db = Pick<Prisma.TransactionClient, "auditLog">;

// Wpis dziennika zdarzeń. `db` pozwala zapisać w tej samej transakcji co zmiana stanu.
export async function audit(
  actor: Actor,
  action: string,
  taskId?: number | null,
  meta?: Prisma.InputJsonValue,
  db: Db = prisma,
): Promise<void> {
  await db.auditLog.create({ data: { actor, action, taskId: taskId ?? null, meta } });
}
