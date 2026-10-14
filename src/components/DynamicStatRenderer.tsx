"use client";
import { StatBars } from "./StatBars";
import { PLUGINS } from "@/plugins";
import type { CharacterClient } from "@/lib/schemas/character";

interface Props {
  character:  CharacterClient;
  prevStats:  CharacterClient["stats"] | null;
}

export function DynamicStatRenderer({ character, prevStats }: Props) {
  const plugin = PLUGINS[character.packId] ?? PLUGINS["core_realistic"];
  const extra  = plugin.extraStats.map(s => ({
    key:   s.key,
    label: s.label,
    icon:  s.icon,
    value: (character.stats as Record<string, number>)[s.key] ?? 0,
  }));

  return <StatBars stats={character.stats} prevStats={prevStats} extra={extra} />;
}
