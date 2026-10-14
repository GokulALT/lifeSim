import { z } from "zod";

// Lives in its own module so both character.ts and event.ts can use it without a circular import.
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
