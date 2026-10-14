import { z } from "zod";

export const StatBlockSchema = z.object({
  happiness: z.number().int().min(0).max(100),
  health:    z.number().int().min(0).max(100),
  smarts:    z.number().int().min(0).max(100),
  looks:     z.number().int().min(0).max(100),
});

export const HiddenStatBlockSchema = z.object({
  karma:     z.number().int().min(0).max(100),
  fertility: z.number().int().min(0).max(100),
  willpower: z.number().int().min(0).max(100),
});

export const FlagsSchema = z.object({
  isEmployed:      z.boolean(),
  isMarried:       z.boolean(),
  hasChildren:     z.boolean(),
  inPrison:        z.boolean(),
  hasDrugHabit:    z.boolean(),
  isStudent:       z.boolean(),
  inDebt:          z.boolean(),
  isTerminallyIll: z.boolean(),
});

export const AssetSchema = z.object({
  type:       z.enum(["car", "house", "investment"]),
  name:       z.string(),
  value:      z.number().int(),
  annualCost: z.number().int(),
});

export const FinancialsSchema = z.object({
  bankBalance:    z.number().int(),
  salary:         z.number().int(),
  annualExpenses: z.number().int(),
  assets:         z.array(AssetSchema),
});

export const CareerSchema = z.object({
  education:   z.enum(["none", "highschool", "bachelor", "master", "phd"]),
  currentJob:  z.string().nullable(),
  employer:    z.string().nullable(),
  yearsInRole: z.number().int().min(0),
  performance: z.number().int().min(0).max(100),
  salaryGrade: z.enum(["none", "junior", "mid", "senior", "executive"]),
});

export const RelationshipSchema = z.object({
  npcId:     z.string(),
  name:      z.string(),
  relation:  z.string(),
  closeness: z.number().int().min(0).max(100),
});

export const LogEntrySchema = z.object({
  age:  z.number().int().min(0),
  text: z.string(),
});

export const CharacterSchema = z.object({
  _id:          z.string(),
  userId:       z.string(),
  packId:       z.string(),
  metadata: z.object({
    firstName:   z.string(),
    lastName:    z.string(),
    birthCountry: z.string(),
    birthCity:   z.string(),
    gender:      z.string(),
    sexuality:   z.string(),
  }),
  age:         z.number().int().min(0),
  isAlive:     z.boolean(),
  stats:       StatBlockSchema,
  hiddenStats: HiddenStatBlockSchema,
  flags:       FlagsSchema,
  financials:  FinancialsSchema,
  career:      CareerSchema,
  relationships: z.array(RelationshipSchema),
  log:         z.array(LogEntrySchema),
  createdAt:   z.string(),
  updatedAt:   z.string(),
});

// Client-safe version: hiddenStats omitted
export const CharacterClientSchema = CharacterSchema.omit({ hiddenStats: true });

export type Character       = z.infer<typeof CharacterSchema>;
export type CharacterClient = z.infer<typeof CharacterClientSchema>;
export type StatBlock       = z.infer<typeof StatBlockSchema>;
export type Flags           = z.infer<typeof FlagsSchema>;
export type Asset           = z.infer<typeof AssetSchema>;
export type LogEntry        = z.infer<typeof LogEntrySchema>;
