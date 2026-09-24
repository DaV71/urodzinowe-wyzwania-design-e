import { describe, it, expect } from "vitest";
import { loadEnv } from "./env";
const base = {
  DATABASE_URL: "postgresql://u:p@localhost:5432/db", AUTH_SECRET: "a".repeat(40), CODES_SECRET: "b".repeat(20),
  PLAYER_TOKEN: "c".repeat(32), ADMIN_PASSWORD: "haslo-admina-16zn", APP_URL: "http://localhost:3000", UPLOAD_DIR: "./.data/uploads",
};
describe("loadEnv", () => {
  it("parsuje poprawny zestaw i ustawia domyślne NODE_ENV", () => {
    const env = loadEnv(base);
    expect(env.NODE_ENV).toBe("development");
    expect(env.UPLOAD_DIR).toBe("./.data/uploads");
  });
  it("rzuca błąd z nazwami brakujących zmiennych", () => {
    const { AUTH_SECRET: _omit, ...rest } = base;
    expect(() => loadEnv(rest)).toThrow(/AUTH_SECRET/);
  });
  it("odrzuca za krótki AUTH_SECRET", () => expect(() => loadEnv({ ...base, AUTH_SECRET: "short" })).toThrow(/AUTH_SECRET/));
  it("odrzuca ADMIN_PASSWORD krótsze niż 16 znaków", () =>
    expect(() => loadEnv({ ...base, ADMIN_PASSWORD: "p".repeat(15) })).toThrow(/ADMIN_PASSWORD/));
  it("przyjmuje ADMIN_PASSWORD z 16 znakami", () =>
    expect(loadEnv({ ...base, ADMIN_PASSWORD: "p".repeat(16) }).ADMIN_PASSWORD).toHaveLength(16));
});
