import type { GamePlugin } from "@/lib/schemas/plugin";

export const fantasyPack: GamePlugin = {
  id:    "fantasy_world_pack_v1",
  label: "Fantasy World (Coming Soon)",
  comingSoon: true,
  extraStats: [
    { key: "mana",   label: "Mana",   icon: "🔮" },
    { key: "honor",  label: "Honor",  icon: "⚔️" },
  ],
  careerTracks: [
    { title: "Apprentice Mage", minSmarts: 60, salaryGrade: "junior", minSalary: 0, maxSalary: 0 },
  ],
  seedEvents: {
    common:   "data/events/fantasy_common.json",
    uncommon: "data/events/fantasy_uncommon.json",
    flags:    "data/events/fantasy_flags.json",
  },
  buildAiBiasInstruction: () => "fantasy setting — magical encounters, mythical creatures, arcane choices",
};
