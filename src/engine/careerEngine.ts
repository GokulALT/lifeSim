import type { Character } from "@/lib/schemas/character";
import type { GamePlugin } from "@/lib/schemas/plugin";

/** Chance per year that an eligible unemployed adult is hired (ruling R29). */
export const HIRE_CHANCE = 0.5;
export const WORKING_AGE_MIN = 18;
export const RETIREMENT_AGE = 65;

/**
 * Minimal yearly career tick (ruling R29). Pure: works on a clone. Uses Math.random.
 * - Unemployed, free, working-age adults may be hired into a track their smarts qualify for.
 * - Employed characters under retirement age accrue a year in role.
 * - Employed characters at retirement age retire.
 */
export function careerTick(char: Character, plugin: GamePlugin): Character {
  const c = structuredClone(char);
  if (!c.isAlive) return c;

  if (c.flags.isEmployed) {
    if (c.age >= RETIREMENT_AGE) {
      c.flags.isEmployed = false;
      c.financials.salary = 0;
      c.career.currentJob = null;
      c.career.employer = null;
      c.career.salaryGrade = "none";
      c.log.push({ age: c.age, text: "You retired." });
    } else {
      c.career.yearsInRole += 1;
    }
    return c;
  }

  if (c.flags.inPrison || c.age < WORKING_AGE_MIN || c.age >= RETIREMENT_AGE) return c;
  if (Math.random() >= HIRE_CHANCE) return c;

  const eligible = plugin.careerTracks.filter(t => t.minSmarts <= c.stats.smarts);
  if (eligible.length === 0) return c;

  const track = eligible[Math.floor(Math.random() * eligible.length)];
  c.flags.isEmployed = true;
  c.career.currentJob = track.title;
  c.career.employer = "a local employer";
  c.financials.salary = track.minSalary + Math.floor(Math.random() * (track.maxSalary - track.minSalary + 1));
  c.career.salaryGrade = track.salaryGrade;
  c.career.yearsInRole = 0;
  c.career.performance = 50;
  c.log.push({ age: c.age, text: `You got a job as a ${track.title}.` });
  return c;
}
