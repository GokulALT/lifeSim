import { z } from "zod";

export const AgeRequestSchema = z.object({
  characterId: z.string().min(1),
});

export const ChoiceRequestSchema = z.object({
  characterId:  z.string().min(1),
  eventId:      z.string().min(1),   // "_id" of static event, or "ai" for AI events
  choiceIndex:  z.number().int().min(0).max(3),
  eventPayload: z.any().optional(),  // full AI event object (ephemeral, not in DB)
});

export const CreateCharacterSchema = z.object({
  firstName:    z.string().min(1).max(50),
  lastName:     z.string().min(1).max(50),
  birthCountry: z.string().min(1).max(60),
  birthCity:    z.string().min(1).max(60),
  gender:       z.string().min(1).max(60),
  sexuality:    z.string().min(1).max(60),
  packId:       z.string().default("core_realistic"),
});

export const DlcUpdateSchema = z.object({
  unlockedDLCs: z.array(z.string()),
});
