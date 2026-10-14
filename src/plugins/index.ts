import { coreRealistic } from "./core_realistic";
import { fantasyPack }   from "./fantasy_pack";
import type { GamePlugin } from "@/lib/schemas/plugin";

export const PLUGINS: Record<string, GamePlugin> = {
  [coreRealistic.id]: coreRealistic,
  [fantasyPack.id]:   fantasyPack,
};
