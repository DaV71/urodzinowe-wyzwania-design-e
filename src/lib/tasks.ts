import { z } from "zod";

export const TASK_COUNT = 28;
export const STAGE_SIZE = 7;

export const taskSeedSchema = z
  .object({
    id: z.number().int().min(1).max(TASK_COUNT),
    stage: z.number().int().min(1).max(4),
    title: z.string().min(1),
    description: z.string().min(1),
    proof: z.enum(["PHOTO", "PHOTO_OPTIONAL", "NONE"]),
    proofHint: z.string().min(1),
    askDistance: z.boolean(),
    askDuration: z.boolean(),
    maxPhotos: z.union([z.literal(1), z.literal(4)]),
    compareToTask: z.number().int().optional(),
    minImprovementS: z.number().int().positive().optional(),
    minDistanceM: z.number().int().positive().optional(), // do ostrzeżeń: dystans poniżej progu z tytułu
    maxDurationS: z.number().int().positive().optional(), // do ostrzeżeń: czas powyżej limitu (zad. 2, 26)
  })
  .refine((t) => (t.compareToTask === undefined) === (t.minImprovementS === undefined), {
    message: "compareToTask i minImprovementS razem",
  });

export type TaskSeed = z.infer<typeof taskSeedSchema>;
