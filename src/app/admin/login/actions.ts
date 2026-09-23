"use server";

import { redirect } from "next/navigation";
import { getEnv } from "@/lib/env";
import { setAdminCookie } from "@/lib/auth/admin";
import { safeEqual } from "@/lib/auth/session";

export type LoginState = { error: string | null };

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

export async function loginAdmin(_prev: LoginState, formData: FormData): Promise<LoginState> {
  const password = formData.get("password");
  if (typeof password !== "string" || !safeEqual(password, getEnv().ADMIN_PASSWORD)) {
    await sleep(1000);
    return { error: "Nieprawidłowe hasło" };
  }
  await setAdminCookie();
  redirect("/admin");
}
