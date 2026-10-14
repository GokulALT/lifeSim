import OpenAI from "openai";
import { AiEventSchema } from "@/lib/schemas/event";
import type { AiEvent } from "@/lib/schemas/event";
import type { Character } from "@/lib/schemas/character";
import type { GamePlugin } from "@/lib/schemas/plugin";

function buildPrompts(char: Character, plugin: GamePlugin): { system: string; user: string } {
  const bias = plugin.buildAiBiasInstruction(char);
  const karmaInstruction =
    char.hiddenStats.karma > 60 ? "lean toward fortunate outcomes" :
    char.hiddenStats.karma < 30 ? "lean toward unfortunate outcomes" : "neutral outcomes";

  const system = `You are the event engine for a realistic text-based life simulator.
Generate ONE extraordinary real-world life event for the character described.
No fantasy, sci-fi, or supernatural elements.
Event bias: ${bias}.
Karma modifier: ${karmaInstruction}.
The character must face a genuine dilemma. Choices must have meaningfully different consequences.
Output ONLY valid JSON. No markdown. No explanation. Match this schema exactly:
{"eventText":"string 20-300 chars","choices":[{"text":"string 5-100 chars","effects":{"happiness"?:int -30 to 30,"health"?:int -30 to 30,"smarts"?:int -15 to 15,"looks"?:int -15 to 15,"bankBalance"?:int,"karma"?:int -20 to 20},"outcomeText":"string 10-200 chars"}]}
Provide 2-4 choices.`;

  const activeFlags = Object.entries(char.flags)
    .filter(([, v]) => v).map(([k]) => k).join(", ") || "none";

  const user = `Name: ${char.metadata.firstName}, Age: ${char.age}, Country: ${char.metadata.birthCountry}
Stats: Happiness ${char.stats.happiness}, Health ${char.stats.health}, Smarts ${char.stats.smarts}, Looks ${char.stats.looks}
Career: ${char.career.currentJob ?? "unemployed"}, Education: ${char.career.education}
Bank: $${char.financials.bankBalance.toLocaleString()}, Salary: $${char.financials.salary.toLocaleString()}/yr
Active flags: ${activeFlags}
Recent events: ${char.log.slice(-3).map(e => e.text).join(" | ") || "none"}`;

  return { system, user };
}

// Strips one optional surrounding markdown code fence (```json ... ``` or ``` ... ```).
function stripCodeFence(raw: string): string {
  const trimmed = raw.trim();
  const match = trimmed.match(/^```(?:json)?\s*\n?([\s\S]*?)\n?```$/i);
  return match ? match[1].trim() : trimmed;
}

export async function generateRareEvent(char: Character, plugin: GamePlugin): Promise<AiEvent | null> {
  const apiKey = process.env.NVIDIA_API_KEY;
  if (!apiKey) return null;

  try {
    const ai = new OpenAI({
      apiKey,
      baseURL: "https://integrate.api.nvidia.com/v1",
    });

    const { system, user } = buildPrompts(char, plugin);

    const completion = await ai.chat.completions.create({
      model:       process.env.AI_MODEL ?? "z-ai/glm-5.3-flash",
      messages:    [{ role: "system", content: system }, { role: "user", content: user }],
      temperature: 0.85,
      max_tokens:  600,
      stream:      false,
    });

    const raw = JSON.parse(stripCodeFence(completion.choices[0]?.message?.content ?? "{}"));
    return AiEventSchema.parse(raw);
  } catch {
    return null;
  }
}
