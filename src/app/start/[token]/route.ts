import { redirect } from "next/navigation";
import { getEnv } from "@/lib/env";
import { setPlayerCookie } from "@/lib/auth/player";
import { safeEqual } from "@/lib/auth/session";

export async function GET(_request: Request, { params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  if (!safeEqual(token, getEnv().PLAYER_TOKEN)) {
    return new Response("Nie znaleziono", { status: 404, headers: { "Content-Type": "text/plain; charset=utf-8" } });
  }
  await setPlayerCookie();
  redirect("/");
}
