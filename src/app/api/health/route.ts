import { prisma } from "@/lib/db";

export const dynamic = "force-dynamic";

// Healthcheck dla Dockera/proxy: sprawdza połączenie z bazą.
export async function GET() {
  try {
    await prisma.$queryRaw`SELECT 1`;
    return Response.json({ ok: true });
  } catch (err) {
    console.error("Healthcheck: brak połączenia z bazą", err);
    return Response.json({ ok: false }, { status: 503 });
  }
}
