import type { Character } from "./character";

export interface StatDefinition {
  key:   string;
  label: string;
  icon:  string;
}

export interface CareerTrack {
  title:       string;
  minSmarts:   number;
  salaryGrade: "junior" | "mid" | "senior" | "executive";
  minSalary:   number;
  maxSalary:   number;
}

export interface GamePlugin {
  id:          string;
  label:       string;
  extraStats:  StatDefinition[];
  careerTracks: CareerTrack[];
  seedEvents: {
    common:   string;
    uncommon: string;
    flags:    string;
  };
  applyStatTick?: (character: Character) => Partial<Character["stats"]>;
  buildAiBiasInstruction: (character: Character) => string;
}
