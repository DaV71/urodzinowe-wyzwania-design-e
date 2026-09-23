import { describe, it, expect } from "vitest";
import raw from "../../prisma/seed-data/tasks.json";
import { taskSeedSchema, TASK_COUNT, STAGE_SIZE, type TaskSeed } from "./tasks";

const tasks: TaskSeed[] = (raw as unknown[]).map((t) => taskSeedSchema.parse(t));
const byId = (id: number) => tasks.find((t) => t.id === id)!;

describe("tasks.json", () => {
  it("ma 28 zadań o id 1..28, każde przechodzi schemat", () => {
    expect(tasks).toHaveLength(TASK_COUNT);
    expect(tasks.map((t) => t.id).sort((a, b) => a - b)).toEqual(Array.from({ length: TASK_COUNT }, (_, i) => i + 1));
  });
  it("po 7 zadań na etap, etap zgodny z id", () => {
    for (let stage = 1; stage <= 4; stage++) {
      expect(tasks.filter((t) => t.stage === stage)).toHaveLength(STAGE_SIZE);
    }
    for (const t of tasks) expect(t.stage).toBe(Math.ceil(t.id / STAGE_SIZE));
  });
  it("PHOTO i PHOTO_OPTIONAL mają niepusty proofHint", () => {
    for (const t of tasks.filter((t) => t.proof !== "NONE")) expect(t.proofHint.trim()).not.toBe("");
  });
  it("zadanie 11 porównuje z 6 (min. 30 s)", () => {
    expect(byId(11)).toMatchObject({ compareToTask: 6, minImprovementS: 30 });
  });
  it("zadanie 21 bez dowodu", () => expect(byId(21).proof).toBe("NONE"));
  it("8 i 14 przyjmują do 4 zdjęć", () => {
    expect(byId(8).maxPhotos).toBe(4);
    expect(byId(14).maxPhotos).toBe(4);
  });
  it("limity czasu dla 2 i 26", () => {
    expect(byId(2).maxDurationS).toBe(2400);
    expect(byId(26).maxDurationS).toBe(2100);
  });
  it("każde askDistance ma minDistanceM", () => {
    for (const t of tasks.filter((t) => t.askDistance)) expect(t.minDistanceM, `zadanie ${t.id}`).toBeGreaterThan(0);
  });
});
