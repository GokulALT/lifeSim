import { create } from "zustand";
import type { CharacterClient } from "@/lib/schemas/character";
import type { EventTemplate, AiEvent } from "@/lib/schemas/event";

interface GameStore {
  character:    CharacterClient | null;
  pendingEvent: EventTemplate | AiEvent | null;
  isAgeing:     boolean;

  setCharacter:    (c: CharacterClient | null) => void;
  setPendingEvent: (e: EventTemplate | AiEvent | null) => void;
  setIsAgeing:     (v: boolean) => void;
}

export const useGameStore = create<GameStore>((set) => ({
  character:    null,
  pendingEvent: null,
  isAgeing:     false,

  setCharacter:    (character)    => set({ character }),
  setPendingEvent: (pendingEvent) => set({ pendingEvent }),
  setIsAgeing:     (isAgeing)     => set({ isAgeing }),
}));
