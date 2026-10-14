import type { Character, Effects } from "@/lib/schemas";

export function clamp(value: number, min = 0, max = 100): number {
  return Math.min(max, Math.max(min, Math.round(value)));
}

export function applyEffects(char: Character, effects: Effects): Character {
  const c = structuredClone(char);

  if (effects.happiness  !== undefined) c.stats.happiness  = clamp(c.stats.happiness  + effects.happiness);
  if (effects.health     !== undefined) c.stats.health     = clamp(c.stats.health     + effects.health);
  if (effects.smarts     !== undefined) c.stats.smarts     = clamp(c.stats.smarts     + effects.smarts);
  if (effects.looks      !== undefined) c.stats.looks      = clamp(c.stats.looks      + effects.looks);
  if (effects.karma      !== undefined) c.hiddenStats.karma = clamp(c.hiddenStats.karma + effects.karma);
  if (effects.bankBalance !== undefined) c.financials.bankBalance += effects.bankBalance;
  if (effects.careerPerformance !== undefined) c.career.performance = clamp(c.career.performance + effects.careerPerformance);

  return c;
}

export function tickStats(char: Character): Character {
  const c = structuredClone(char);

  // Age
  c.age += 1;

  // Health decay by age
  let healthDelta = 0;
  if (c.age > 75) healthDelta -= 3;
  else if (c.age > 60) healthDelta -= 2;
  else if (c.age > 40) healthDelta -= 1;

  if (c.flags.hasDrugHabit)    healthDelta -= 5;
  if (c.flags.isTerminallyIll) healthDelta -= 5;
  // Gym habit flag (set by events, e.g. "joined the gym") gives +2/yr
  if ((c.flags as Record<string, boolean>)["hasGymHabit"]) healthDelta += 2;

  c.stats.health = clamp(c.stats.health + healthDelta);

  // Happiness natural drift toward 50
  const happinessDrift = c.stats.happiness > 50 ? -1 : c.stats.happiness < 50 ? 1 : 0;
  c.stats.happiness = clamp(c.stats.happiness + happinessDrift);

  // Finances
  const prevBalance = c.financials.bankBalance;
  const netIncome = c.financials.salary - c.financials.annualExpenses;
  c.financials.bankBalance += netIncome;

  for (const asset of c.financials.assets) {
    const rate = asset.type === "house" ? 1.03 : 0.92;
    asset.value = Math.round(asset.value * rate);
    c.financials.bankBalance -= asset.annualCost;
  }

  // inDebt: set only after 2+ consecutive negative years, cleared once back to >= 0 (ruling R5)
  if (prevBalance < 0 && c.financials.bankBalance < 0) c.flags.inDebt = true;
  else if (c.financials.bankBalance >= 0) c.flags.inDebt = false;

  // Career performance drift
  const drift = Math.floor(Math.random() * 7) - 3; // -3 to +3
  c.career.performance = clamp(c.career.performance + drift);

  // Job loss: track consecutive years below 20 performance
  if (c.career.performance < 20 && c.flags.isEmployed) {
    const lowPerfYears = ((c as unknown as Record<string, number>)["_lowPerfYears"] ?? 0) + 1;
    (c as unknown as Record<string, number>)["_lowPerfYears"] = lowPerfYears;
    if (lowPerfYears >= 2) {
      c.flags.isEmployed = false;
      c.career.currentJob = null;
      c.career.employer = null;
      c.financials.salary = 0;
      (c as unknown as Record<string, number>)["_lowPerfYears"] = 0;
      c.log.push({ age: c.age, text: "You were let go due to consistently poor performance." });
    }
  } else {
    (c as unknown as Record<string, number>)["_lowPerfYears"] = 0;
  }

  // Relationship closeness decay
  c.relationships = c.relationships
    .map(r => ({ ...r, closeness: clamp(r.closeness - 2) }))
    .filter(r => r.closeness >= 10);

  // Death check
  if (c.stats.health <= 0) {
    c.stats.health = 0;
    c.isAlive = false;
  }

  // Longevity check: base 85 modified by karma
  const longevity = 85 + Math.floor((c.hiddenStats.karma - 50) / 10);
  if (c.age >= longevity && c.isAlive) {
    c.isAlive = false;
  }

  c.updatedAt = new Date().toISOString();
  return c;
}
