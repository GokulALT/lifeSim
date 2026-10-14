import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { GameDashboard } from "./GameDashboard";
import { useGameStore } from "@/store/gameStore";
import type { CharacterClient } from "@/lib/schemas/character";
import type { AiEvent } from "@/lib/schemas/event";

const aiEvent = (text: string): AiEvent => ({
  eventText: text,
  choices: [
    { text: "Take the offer", effects: {}, outcomeText: "You took the offer happily." },
    { text: "Decline politely", effects: {}, outcomeText: "You declined the offer." },
  ],
});

function makeChar(over: Partial<CharacterClient> = {}): CharacterClient {
  return {
    _id: "c1",
    userId: "u1",
    packId: "core_realistic",
    metadata: { firstName: "Ada", lastName: "Lovelace", birthCountry: "India", birthCity: "Pune", gender: "female", sexuality: "straight" },
    age: 20,
    isAlive: true,
    stats: { happiness: 50, health: 60, smarts: 70, looks: 40 },
    flags: { isEmployed: false, isMarried: false, hasChildren: false, inPrison: false, hasDrugHabit: false, isStudent: false, inDebt: false, isTerminallyIll: false },
    financials: { bankBalance: 1000, salary: 0, annualExpenses: 0, assets: [] },
    career: { education: "highschool", currentJob: null, employer: null, yearsInRole: 0, performance: 50, salaryGrade: "none" },
    relationships: [],
    log: [],
    createdAt: "2026-01-01T00:00:00Z",
    updatedAt: "2026-01-01T00:00:00Z",
    ...over,
  };
}

function jsonRes(status: number, body: unknown) {
  return Promise.resolve({ ok: status >= 200 && status < 300, status, json: () => Promise.resolve(body) } as Response);
}

const fetchMock = vi.fn();

beforeEach(() => {
  Element.prototype.scrollIntoView = vi.fn(); // jsdom does not implement it (used by LifeLog)
  fetchMock.mockReset();
  global.fetch = fetchMock as unknown as typeof fetch;
  useGameStore.setState({ character: null, pendingEvent: null, isAgeing: false });
});

describe("GameDashboard", () => {
  it("restores a pending event on first render", () => {
    render(<GameDashboard initialCharacter={makeChar({ pendingEvent: aiEvent("A stranger offers you a job at once.") })} />);
    expect(screen.getByText("A stranger offers you a job at once.")).toBeInTheDocument();
  });

  it("shows the returned event after AGE UP", async () => {
    fetchMock.mockReturnValue(jsonRes(200, { character: makeChar({ age: 21 }), event: aiEvent("A brand new event appears today.") }));
    render(<GameDashboard initialCharacter={makeChar()} />);
    await userEvent.click(screen.getByRole("button", { name: "AGE UP" }));
    expect(await screen.findByText("A brand new event appears today.")).toBeInTheDocument();
  });

  it("shows the event from a 409 response", async () => {
    fetchMock.mockReturnValue(jsonRes(409, { error: "Resolve pending event first", event: aiEvent("An unresolved event is waiting.") }));
    render(<GameDashboard initialCharacter={makeChar()} />);
    await userEvent.click(screen.getByRole("button", { name: "AGE UP" }));
    expect(await screen.findByText("An unresolved event is waiting.")).toBeInTheDocument();
  });

  it("closes the modal after a successful choice without sending eventPayload", async () => {
    fetchMock.mockReturnValue(jsonRes(200, { character: makeChar(), outcomeText: "ok" }));
    render(<GameDashboard initialCharacter={makeChar({ pendingEvent: aiEvent("A stranger offers you a job at once.") })} />);
    await userEvent.click(screen.getByText("Take the offer"));
    await waitFor(() => expect(screen.queryByText("A stranger offers you a job at once.")).not.toBeInTheDocument());
    const [url, init] = fetchMock.mock.calls[0];
    expect(url).toBe("/api/choice");
    const body = JSON.parse((init as RequestInit).body as string);
    expect(body).toEqual({ characterId: "c1", eventId: "ai", choiceIndex: 0 });
    expect(body).not.toHaveProperty("eventPayload");
  });

  it("keeps the modal open and shows an error when the choice fails", async () => {
    fetchMock.mockReturnValue(jsonRes(500, { error: "Server exploded" }));
    render(<GameDashboard initialCharacter={makeChar({ pendingEvent: aiEvent("A stranger offers you a job at once.") })} />);
    await userEvent.click(screen.getByText("Decline politely"));
    expect(await screen.findByText("Server exploded")).toBeInTheDocument();
    expect(screen.getByText("A stranger offers you a job at once.")).toBeInTheDocument();
  });

  it("renders the tombstone for a dead character", () => {
    render(<GameDashboard initialCharacter={makeChar({ isAlive: false, age: 73 })} />);
    expect(screen.getByText("Lived to age 73")).toBeInTheDocument();
  });
});
