import { describe, it, expect, vi, beforeEach, afterEach, type MockInstance } from "vitest";

vi.mock("openai", () => {
  return {
    default: vi.fn().mockImplementation(() => ({
      chat: {
        completions: {
          create: vi.fn(),
        },
      },
    })),
  };
});

import OpenAI from "openai";
import { generateRareEvent } from "./aiEventGenerator";
import type { Character } from "@/lib/schemas/character";
import { coreRealistic } from "@/plugins/core_realistic";

const mockChar: Character = {
  _id: "c1", userId: "u1", packId: "core_realistic",
  metadata: { firstName: "Sam", lastName: "Lee", birthCountry: "AU", birthCity: "Sydney", gender: "female", sexuality: "heterosexual" },
  age: 35, isAlive: true,
  stats: { happiness: 45, health: 70, smarts: 65, looks: 60 },
  hiddenStats: { karma: 55, fertility: 70, willpower: 60 },
  flags: { isEmployed: true, isMarried: false, hasChildren: false, inPrison: false, hasDrugHabit: false, isStudent: false, inDebt: false, isTerminallyIll: false },
  financials: { bankBalance: 25000, salary: 80000, annualExpenses: 35000, assets: [] },
  career: { education: "bachelor", currentJob: "Analyst", employer: "BankCo", yearsInRole: 4, performance: 72, salaryGrade: "mid" },
  relationships: [], log: [], createdAt: "", updatedAt: "",
};

const validAiResponse = {
  eventText: "A headhunter contacts you about a role at a rival firm paying 40% more.",
  choices: [
    { text: "Go to the interview.", effects: { happiness: 5 }, outcomeText: "They offer you the job on the spot." },
    { text: "Ignore it.", effects: { happiness: -3 }, outcomeText: "You wonder about it for months." },
  ],
};

describe("generateRareEvent", () => {
  const originalApiKey = process.env.NVIDIA_API_KEY;
  const originalModel = process.env.AI_MODEL;

  let warnSpy: MockInstance<typeof console.warn>;

  beforeEach(() => {
    vi.clearAllMocks();
    warnSpy = vi.spyOn(console, "warn").mockImplementation(() => {});
    process.env.NVIDIA_API_KEY = "test-key";
    delete process.env.AI_MODEL;
  });

  afterEach(() => {
    warnSpy.mockRestore();
    if (originalApiKey === undefined) {
      delete process.env.NVIDIA_API_KEY;
    } else {
      process.env.NVIDIA_API_KEY = originalApiKey;
    }
    if (originalModel === undefined) {
      delete process.env.AI_MODEL;
    } else {
      process.env.AI_MODEL = originalModel;
    }
  });

  it("returns a valid AiEvent on successful API call", async () => {
    const mockCreate = vi.fn().mockResolvedValue({
      choices: [{ message: { content: JSON.stringify(validAiResponse) } }],
    });
    (OpenAI as unknown as ReturnType<typeof vi.fn>).mockImplementation(() => ({
      chat: { completions: { create: mockCreate } },
    }));

    const result = await generateRareEvent(mockChar, coreRealistic);
    expect(result).not.toBeNull();
    expect(result?.eventText).toBe(validAiResponse.eventText);
    expect(result?.choices).toHaveLength(2);
  });

  it("returns null when API throws", async () => {
    (OpenAI as unknown as ReturnType<typeof vi.fn>).mockImplementation(() => ({
      chat: { completions: { create: vi.fn().mockRejectedValue(new Error("network error")) } },
    }));

    const result = await generateRareEvent(mockChar, coreRealistic);
    expect(result).toBeNull();
    expect(warnSpy).toHaveBeenCalledWith("[ai] rare event generation failed:", "network error");
    expect(JSON.stringify(warnSpy.mock.calls)).not.toContain("test-key");
  });

  it("returns null when response fails Zod validation", async () => {
    const badResponse = { eventText: "bad", choices: [] }; // fails min(2) choices
    (OpenAI as unknown as ReturnType<typeof vi.fn>).mockImplementation(() => ({
      chat: { completions: { create: vi.fn().mockResolvedValue({ choices: [{ message: { content: JSON.stringify(badResponse) } }] }) } },
    }));

    const result = await generateRareEvent(mockChar, coreRealistic);
    expect(result).toBeNull();
  });

  it("returns null without constructing the client when NVIDIA_API_KEY is missing", async () => {
    delete process.env.NVIDIA_API_KEY;

    const result = await generateRareEvent(mockChar, coreRealistic);
    expect(result).toBeNull();
    expect(OpenAI).not.toHaveBeenCalled();
    expect(warnSpy).not.toHaveBeenCalled();
  });

  it("parses valid JSON wrapped in a ```json code fence", async () => {
    const fenced = "```json\n" + JSON.stringify(validAiResponse) + "\n```";
    (OpenAI as unknown as ReturnType<typeof vi.fn>).mockImplementation(() => ({
      chat: { completions: { create: vi.fn().mockResolvedValue({ choices: [{ message: { content: fenced } }] }) } },
    }));

    const result = await generateRareEvent(mockChar, coreRealistic);
    expect(result).toEqual(validAiResponse);
  });

  it("constructs the client with timeout and no retries, and calls create with the expected params", async () => {
    const mockCreate = vi.fn().mockResolvedValue({
      choices: [{ message: { content: JSON.stringify(validAiResponse) } }],
    });
    (OpenAI as unknown as ReturnType<typeof vi.fn>).mockImplementation(() => ({
      chat: { completions: { create: mockCreate } },
    }));

    await generateRareEvent(mockChar, coreRealistic);

    expect(OpenAI).toHaveBeenCalledWith({
      apiKey: "test-key",
      baseURL: "https://integrate.api.nvidia.com/v1",
      timeout: 8000,
      maxRetries: 0,
    });
    expect(mockCreate).toHaveBeenCalledWith(expect.objectContaining({
      model: "z-ai/glm-5.3-flash",
      temperature: 0.85,
      max_tokens: 600,
      stream: false,
    }));
  });

  it("uses AI_MODEL when it is set", async () => {
    process.env.AI_MODEL = "custom/model";
    const mockCreate = vi.fn().mockResolvedValue({
      choices: [{ message: { content: JSON.stringify(validAiResponse) } }],
    });
    (OpenAI as unknown as ReturnType<typeof vi.fn>).mockImplementation(() => ({
      chat: { completions: { create: mockCreate } },
    }));

    await generateRareEvent(mockChar, coreRealistic);

    expect(mockCreate).toHaveBeenCalledWith(expect.objectContaining({ model: "custom/model" }));
  });

  it("strips newlines from player-controlled text in the user prompt", async () => {
    const mockCreate = vi.fn().mockResolvedValue({
      choices: [{ message: { content: JSON.stringify(validAiResponse) } }],
    });
    (OpenAI as unknown as ReturnType<typeof vi.fn>).mockImplementation(() => ({
      chat: { completions: { create: mockCreate } },
    }));

    await generateRareEvent({ ...mockChar, metadata: { ...mockChar.metadata, firstName: "Sa\nm" } }, coreRealistic);

    const userMessage = mockCreate.mock.calls[0][0].messages[1].content as string;
    expect(userMessage).toContain("Name: Sa m, Age:");
    expect(userMessage).not.toContain("Sa\nm");
  });
});
