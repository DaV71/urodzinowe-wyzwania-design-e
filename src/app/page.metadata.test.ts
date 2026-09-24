import { describe, it, expect, vi, beforeEach } from "vitest";
import { site } from "@/config/site";

const isPlayer = vi.fn<() => Promise<boolean>>();
vi.mock("@/lib/auth/player", () => ({ isPlayer: () => isPlayer() }));
vi.mock("@/lib/progress", () => ({ getBoard: vi.fn() }));

const { generateMetadata } = await import("./page");

describe("generateMetadata strony jubilata", () => {
  beforeEach(() => isPlayer.mockReset());

  it("bez cookie gracza — neutralny tytuł, bez imienia i wieku", async () => {
    isPlayer.mockResolvedValue(false);
    const meta = await generateMetadata();
    const text = JSON.stringify(meta);
    expect(meta.title).toBe("Urodzinowe wyzwania");
    expect(text).not.toContain(site.name);
    expect(text).not.toContain(`${site.age}.`);
  });

  it("z cookie gracza — spersonalizowany tytuł i opis", async () => {
    isPlayer.mockResolvedValue(true);
    const meta = await generateMetadata();
    expect(meta.title).toBe(`Urodzinowe wyzwania — ${site.name}`);
    expect(meta.description).toBe(`${site.totalTasks} wyzwań na ${site.age}. urodziny`);
  });
});
