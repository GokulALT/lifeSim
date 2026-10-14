import { z } from "zod";

export const UserSchema = z.object({
  _id:               z.string(),
  email:             z.string().email(),
  passwordHash:      z.string(),
  createdAt:         z.string(),
  unlockedDLCs:      z.array(z.string()),
  activeCharacterId: z.string().nullable(),
});

export type User = z.infer<typeof UserSchema>;
