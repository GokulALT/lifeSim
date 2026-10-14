import type { Character } from "@/lib/schemas/character";

export type Tier = "common" | "uncommon" | "rare";

export function weightedRandom(weights: Record<string, number>): string {
  const total = Object.values(weights).reduce((a, b) => a + b, 0);
  let roll = Math.random() * total;
  for (const [key, weight] of Object.entries(weights)) {
    roll -= weight;
    if (roll <= 0) return key;
  }
  return Object.keys(weights)[0];
}

export function tierWeights(char: Character): { common: number; uncommon: number; rare: number } {
  const w = { common: 65, uncommon: 25, rare: 10 };

  // Young characters: quieter lives
  if (char.age < 18) { w.common += 10; w.uncommon -= 10; }
  // Young children: no rare events, weight moves to common
  if (char.age < 12) { w.common += w.rare; w.rare = 0; }
  // Over 50: more extraordinary events
  if (char.age > 50) { w.rare += 5; w.common -= 5; }

  // High wealth
  if (char.financials.bankBalance > 500_000) { w.rare += 5; w.uncommon += 5; w.common -= 10; }

  // Low happiness -> more drama
  if (char.stats.happiness < 30) { w.uncommon += 10; w.common -= 10; }

  w.common = Math.max(0, w.common);
  w.uncommon = Math.max(0, w.uncommon);
  w.rare = Math.max(0, w.rare);

  return w;
}

export function selectTier(char: Character): Tier {
  return weightedRandom(tierWeights(char)) as Tier;
}
