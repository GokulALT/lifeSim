import type { GamePlugin } from "@/lib/schemas/plugin";
import type { Character } from "@/lib/schemas/character";

export const coreRealistic: GamePlugin = {
  id:    "core_realistic",
  label: "Real Life",
  extraStats:   [],
  careerTracks: [
    { title: "Retail Assistant",      minSmarts: 0,  salaryGrade: "junior",    minSalary: 28000,  maxSalary: 40000 },
    { title: "Office Administrator",  minSmarts: 30, salaryGrade: "junior",    minSalary: 38000,  maxSalary: 55000 },
    { title: "Software Developer",    minSmarts: 55, salaryGrade: "mid",       minSalary: 70000,  maxSalary: 130000 },
    { title: "Doctor",                minSmarts: 75, salaryGrade: "senior",    minSalary: 120000, maxSalary: 250000 },
    { title: "CEO",                   minSmarts: 70, salaryGrade: "executive", minSalary: 200000, maxSalary: 800000 },
    { title: "Nurse",                 minSmarts: 50, salaryGrade: "mid",       minSalary: 55000,  maxSalary: 90000 },
    { title: "Teacher",               minSmarts: 45, salaryGrade: "mid",       minSalary: 50000,  maxSalary: 80000 },
    { title: "Lawyer",                minSmarts: 65, salaryGrade: "senior",    minSalary: 100000, maxSalary: 300000 },
    { title: "Tradesperson",          minSmarts: 20, salaryGrade: "mid",       minSalary: 55000,  maxSalary: 100000 },
    { title: "Artist / Musician",     minSmarts: 0,  salaryGrade: "junior",    minSalary: 15000,  maxSalary: 500000 },
  ],
  seedEvents: {
    common:   "data/events/common.json",
    uncommon: "data/events/uncommon.json",
    flags:    "data/events/flags.json",
  },
  buildAiBiasInstruction(char: Character): string {
    const biases: string[] = [];

    if (char.age >= 15 && char.age <= 25 && char.stats.smarts > 70)
      biases.push("academic achievements, scholarship opportunities, intellectual recognition");
    if (char.age >= 25 && char.age <= 45 && char.financials.bankBalance > 100000)
      biases.push("business ventures, investment opportunities, financial windfalls or scams");
    if (char.age >= 25 && char.age <= 45 && char.stats.happiness < 40)
      biases.push("relationship crises, career burnout, family conflict, identity struggles");
    if (char.age >= 50 && char.stats.health < 50)
      biases.push("serious health events, medical decisions, legacy and mortality");
    if (char.hiddenStats.karma < 30)
      biases.push("criminal exposure, betrayal by trusted people, fraud and scams targeting you");
    if (char.hiddenStats.karma > 70)
      biases.push("fortunate encounters, unexpected generosity from strangers, community recognition");

    if (biases.length === 0)
      biases.push("everyday dramatic moments: workplace tension, family dynamics, unexpected social encounters");

    return biases.join("; ");
  },
};
