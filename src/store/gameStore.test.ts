// src/store/gameStore.test.ts
import { describe, it, expect, beforeEach } from "vitest";
import { act, renderHook } from "@testing-library/react";
import { useGameStore } from "./gameStore";
import type { CharacterClient } from "@/lib/schemas/character";
import type { EventTemplate, AiEvent } from "@/lib/schemas/event";

describe("useGameStore", () => {
  beforeEach(() => {
    useGameStore.setState({ character: null, pendingEvent: null, isAgeing: false });
  });

  it("initial state has null character and event", () => {
    const { result } = renderHook(() => useGameStore());
    expect(result.current.character).toBeNull();
    expect(result.current.pendingEvent).toBeNull();
    expect(result.current.isAgeing).toBe(false);
  });

  it("setCharacter updates character", () => {
    const { result } = renderHook(() => useGameStore());
    const fakeChar = { _id: "c1", age: 25 } as unknown as CharacterClient;
    act(() => result.current.setCharacter(fakeChar));
    expect(result.current.character?._id).toBe("c1");
  });

  it("setIsAgeing toggles the loading state", () => {
    const { result } = renderHook(() => useGameStore());
    act(() => result.current.setIsAgeing(true));
    expect(result.current.isAgeing).toBe(true);
  });

  it("setPendingEvent stores and clears an event", () => {
    const { result } = renderHook(() => useGameStore());
    const fakeEvent = { eventText: "Something happened.", choices: [] } as unknown as EventTemplate | AiEvent;
    act(() => result.current.setPendingEvent(fakeEvent));
    expect(result.current.pendingEvent).not.toBeNull();
    act(() => result.current.setPendingEvent(null));
    expect(result.current.pendingEvent).toBeNull();
  });
});
