import { z } from "zod";

const EffectsSchema = z.object({
  happiness:        z.number().int().min(-30).max(30).optional(),
  health:           z.number().int().min(-30).max(30).optional(),
  smarts:           z.number().int().min(-15).max(15).optional(),
  looks:            z.number().int().min(-15).max(15).optional(),
  bankBalance:      z.number().int().optional(),
  karma:            z.number().int().min(-20).max(20).optional(),
  careerPerformance: z.number().int().min(-20).max(20).optional(),
});

const ProbabilisticSchema = z.object({
  chance:  z.number().min(0).max(1),
  success: EffectsSchema.extend({ outcomeText: z.string() }),
  failure: EffectsSchema.extend({ outcomeText: z.string() }),
});

export const ChoiceSchema = z.object({
  text:          z.string().min(2).max(120),
  effects:       EffectsSchema.optional(),
  outcomeText:   z.string().optional(),
  probabilistic: ProbabilisticSchema.optional(),
});

export const ConditionsSchema = z.object({
  ageMin:         z.number().int().min(0).default(0),
  ageMax:         z.number().int().max(120).default(120),
  requiredFlags:  z.array(z.string()).default([]),
  blockedFlags:   z.array(z.string()).default([]),
  statThresholds: z.record(z.object({
    min: z.number().int().optional(),
    max: z.number().int().optional(),
  })).default({}),
});

export const EventTemplateSchema = z.object({
  _id:        z.string(),
  packId:     z.string(),
  tier:       z.enum(["common", "uncommon", "flag_override"]),
  conditions: ConditionsSchema,
  eventText:  z.string().min(10).max(500),
  choices:    z.array(ChoiceSchema).min(2).max(4),
});

// AI event output schema (Zod-validated from LLM)
export const AiEventSchema = z.object({
  eventText: z.string().min(20).max(300),
  choices: z.array(z.object({
    text:        z.string().min(5).max(100),
    effects:     EffectsSchema,
    outcomeText: z.string().min(10).max(200),
  })).min(2).max(4),
});

export type EventTemplate = z.infer<typeof EventTemplateSchema>;
export type AiEvent       = z.infer<typeof AiEventSchema>;
export type Choice        = z.infer<typeof ChoiceSchema>;
export type Effects       = z.infer<typeof EffectsSchema>;
