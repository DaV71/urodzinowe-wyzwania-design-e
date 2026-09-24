import { z } from "zod";

// Jedyne miejsce czytające sekrety z process.env.
const schema = z.object({
  NODE_ENV: z.enum(["development", "test", "production"]).default("development"),
  DATABASE_URL: z.string().url(),
  AUTH_SECRET: z.string().min(32),
  CODES_SECRET: z.string().min(16),
  PLAYER_TOKEN: z.string().min(16),
  ADMIN_PASSWORD: z.string().min(16),
  APP_URL: z.string().url(),
  UPLOAD_DIR: z.string().min(1),
});

export type Env = z.infer<typeof schema>;

export function loadEnv(source: Record<string, string | undefined>): Env {
  const parsed = schema.safeParse(source);
  if (!parsed.success) {
    throw new Error(
      `Błędna konfiguracja środowiska: ${parsed.error.issues.map((i) => i.path.join(".")).join(", ")}`,
    );
  }
  return parsed.data;
}

let cached: Env | undefined;

export function getEnv(): Env {
  return (cached ??= loadEnv(process.env));
}
