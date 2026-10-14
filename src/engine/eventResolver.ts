import type { Db } from "mongodb";
import type { Character } from "@/lib/schemas/character";
import type { EventTemplate } from "@/lib/schemas/event";

/**
 * Probability per turn that an active flag's override event is served (ruling R28).
 * Below it, flag_override events take priority; otherwise normal tier selection runs,
 * so a flag such as inDebt cannot lock a character into the same event forever.
 */
export const FLAG_OVERRIDE_CHANCE = 0.35;

export const FALLBACK_EVENT: EventTemplate = {
  _id: "evt_builtin_quiet_year",
  packId: "core_realistic",
  tier: "common",
  conditions: { ageMin: 0, ageMax: 120, requiredFlags: [], blockedFlags: [], statThresholds: {} },
  eventText: "A quiet year passes. Nothing remarkable happened, but you had time to think.",
  choices: [
    { text: "Reflect on your life.", effects: { happiness: 3 }, outcomeText: "You feel a little more settled." },
    { text: "Spend the year resting.", effects: { health: 2 }, outcomeText: "You feel well rested." },
  ],
};

function thresholdValue(char: Character, key: string): number | undefined {
  if (key in char.stats) return (char.stats as Record<string, number>)[key];
  if (key === "careerPerformance") return char.career.performance;
  return undefined;
}

export function filterEventsByConditions(events: EventTemplate[], char: Character): EventTemplate[] {
  return events.filter(evt => {
    const c = evt.conditions;

    if (char.age < c.ageMin || char.age > c.ageMax) return false;

    for (const flag of c.requiredFlags) {
      if (!(char.flags as Record<string, boolean>)[flag]) return false;
    }
    for (const flag of c.blockedFlags) {
      if ((char.flags as Record<string, boolean>)[flag]) return false;
    }

    for (const [statKey, threshold] of Object.entries(c.statThresholds)) {
      const value = thresholdValue(char, statKey);
      if (value === undefined) return false; // unknown keys fail closed
      if (threshold.min !== undefined && value < threshold.min) return false;
      if (threshold.max !== undefined && value > threshold.max) return false;
    }

    return true;
  });
}

export async function resolveEvent(
  char: Character,
  tier: "common" | "uncommon" | "flag_override",
  db: Db
): Promise<EventTemplate | null> {
  const rawEvents = await db.collection<EventTemplate>("event_templates")
    .find({ packId: char.packId, tier })
    .toArray();

  const eligible = filterEventsByConditions(rawEvents, char);
  if (eligible.length === 0) return null;

  return eligible[Math.floor(Math.random() * eligible.length)];
}

export async function getFlagOverrideEvent(char: Character, db: Db): Promise<EventTemplate | null> {
  const activeFlags = Object.entries(char.flags)
    .filter(([, v]) => v)
    .map(([k]) => k);

  if (activeFlags.length === 0) return null;

  const rawEvents = await db.collection<EventTemplate>("event_templates")
    .find({ packId: char.packId, tier: "flag_override" })
    .toArray();

  const eligible = filterEventsByConditions(rawEvents, char);
  if (eligible.length === 0) return null;

  return eligible[Math.floor(Math.random() * eligible.length)];
}
