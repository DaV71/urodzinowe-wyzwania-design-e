import { describe, it, expect } from "vitest";
import { assertLocalDatabaseUrl } from "./setup";

describe("assertLocalDatabaseUrl (strażnik przed TRUNCATE)", () => {
  it("przepuszcza localhost i 127.0.0.1", () => {
    expect(() => assertLocalDatabaseUrl("postgresql://u:p@localhost:55433/db")).not.toThrow();
    expect(() => assertLocalDatabaseUrl("postgresql://u:p@127.0.0.1:5432/db")).not.toThrow();
  });
  it("przerywa dla zdalnego hosta", () => {
    expect(() => assertLocalDatabaseUrl("postgresql://u:p@db.example.pl:5432/db")).toThrow(/db\.example\.pl/);
    expect(() => assertLocalDatabaseUrl("postgresql://u:p@db:5432/db")).toThrow(/TRUNCATE/);
  });
  it("przerywa dla brakującego lub błędnego URL", () => {
    expect(() => assertLocalDatabaseUrl(undefined)).toThrow();
    expect(() => assertLocalDatabaseUrl("nie-url")).toThrow();
  });
});
