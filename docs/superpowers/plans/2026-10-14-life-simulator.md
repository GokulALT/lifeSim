# Life Simulator Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build a playable text-based life simulator (BitLife-style) as a Next.js web app with MongoDB, NextAuth, and NVIDIA NIM AI-powered events.

**Architecture:** Server-authoritative turn loop via Next.js API routes; MongoDB holds all game state in a single character document per playthrough; a tiered event engine (65% common static / 25% uncommon static / 10% AI-generated) resolves one event per Age press; a plugin system makes the codebase DLC-ready from day one.

**Tech Stack:** Next.js 15 (App Router), TypeScript, Tailwind CSS, Zustand, Zod, `mongodb` driver, NextAuth v5, OpenAI SDK (NVIDIA NIM endpoint), Vitest, @testing-library/react

**Spec:** `docs/superpowers/specs/2026-10-13-life-simulator-design.md`

## Global Constraints

- All stats are integers 0–100, clamped after every operation
- `hiddenStats` (karma, fertility, willpower) are NEVER sent to the client — stripped server-side via MongoDB projection before every response
- Auth required for all `/api/*` routes except `/api/auth/*`
- `core_realistic` always present in `user.unlockedDLCs` on account creation
- No payment gateway at launch — DLC unlock is a free checkbox + save
- Mobile-first: all tap targets ≥ 44px, layout fits 390px viewport, no horizontal scroll
- `NVIDIA_API_KEY` and `MONGODB_URI` in `.env.local`, never committed to git
- TypeScript strict mode enabled

## Review Focus

1. **hiddenStats in API response** — `POST /api/age` response must not contain a `hiddenStats` key even if MongoDB returns it. Add test to Task 9.
2. **Cross-user character access** — `POST /api/age` with a `characterId` owned by a different user must return 403. Add test to Task 9.
3. **Full fallback chain** — when NVIDIA API throws AND the event pool is empty, `/api/age` must still return a valid event object. Add test to Task 9.
4. **Stat overflow at boundary** — `applyEffects({ health: 100 }, { health: 20 })` must return `health: 100`, not 120. Add test to Task 6.
5. **Death at health boundary** — `tickStats` on a character with `health: 1` aged 76+ must return `isAlive: false`. Add test to Task 6.

---

### Task 1: Project Scaffold + Dev Environment

**Files:**
- Create: `package.json` (via create-next-app)
- Create: `vitest.config.ts`
- Create: `vitest.setup.ts`
- Create: `.env.local.example`
- Create: `.gitignore` (append entries)

**Interfaces:**
- Produces: runnable Next.js dev server, passing `vitest` run

- [ ] **Step 1: Scaffold the Next.js project**

```bash
cd D:/AI_FileSys/dev_engine
npx create-next-app@latest . --typescript --tailwind --app --src-dir --import-alias "@/*" --no-git
```

Answer the prompts: ESLint → Yes, `src/` directory → Yes (already flagged), App Router → Yes.

- [ ] **Step 2: Install runtime dependencies**

```bash
npm install mongodb next-auth@beta zod openai zustand bcryptjs
npm install @auth/mongodb-adapter
```

- [ ] **Step 3: Install dev/test dependencies**

```bash
npm install -D vitest @vitejs/plugin-react @testing-library/react @testing-library/jest-dom @testing-library/user-event jsdom @types/bcryptjs
```

- [ ] **Step 4: Create `vitest.config.ts`**

```typescript
// vitest.config.ts
import { defineConfig } from "vitest/config";
import react from "@vitejs/plugin-react";
import path from "path";

export default defineConfig({
  plugins: [react()],
  test: {
    environment: "jsdom",
    setupFiles: ["./vitest.setup.ts"],
    globals: true,
  },
  resolve: {
    alias: { "@": path.resolve(__dirname, "./src") },
  },
});
```

- [ ] **Step 5: Create `vitest.setup.ts`**

```typescript
// vitest.setup.ts
import "@testing-library/jest-dom";
```

- [ ] **Step 6: Add test script to `package.json`**

```json
"scripts": {
  "test": "vitest",
  "test:run": "vitest run"
}
```

- [ ] **Step 7: Create `.env.local.example`**

```
MONGODB_URI=mongodb+srv://<user>:<pass>@cluster.mongodb.net/life-simulator
NEXTAUTH_SECRET=change-me-32-chars-minimum
NEXTAUTH_URL=http://localhost:3000
NVIDIA_API_KEY=nvapi-your-key-here
AI_MODEL=z-ai/glm-5.3-flash
```

- [ ] **Step 8: Add to `.gitignore`**

```
.env.local
.env*.local
```

- [ ] **Step 9: Run vitest to confirm setup**

```bash
npx vitest run
```

Expected: "No test files found" (0 tests, no failures — setup is working).

- [ ] **Step 10: Commit**

```bash
git init
git add .
git commit -m "chore: scaffold Next.js 15 project with Vitest and dependencies"
```

---

### Task 2: TypeScript Types + Zod Schemas

**Files:**
- Create: `src/lib/schemas/character.ts`
- Create: `src/lib/schemas/event.ts`
- Create: `src/lib/schemas/user.ts`
- Create: `src/lib/schemas/plugin.ts`
- Create: `src/lib/schemas/api.ts`
- Create: `src/lib/schemas/index.ts`
- Create: `src/lib/schemas/__tests__/schemas.test.ts`

**Interfaces:**
- Produces: `Character`, `CharacterClient` (hiddenStats omitted), `EventTemplate`, `AiEvent`, `AiEventSchema`, `User`, `GamePlugin`, `StatDefinition`, `CareerTrack` — used by every subsequent task

- [ ] **Step 1: Write the failing schema tests**

```typescript
// src/lib/schemas/__tests__/schemas.test.ts
import { describe, it, expect } from "vitest";
import { CharacterSchema, EventTemplateSchema, AiEventSchema, UserSchema } from "../index";

describe("CharacterSchema", () => {
  it("accepts a valid character document", () => {
    const result = CharacterSchema.safeParse({
      _id: "char_001",
      userId: "user_001",
      packId: "core_realistic",
      metadata: { firstName: "Sam", lastName: "Lee", birthCountry: "Australia", birthCity: "Sydney", gender: "female", sexuality: "heterosexual" },
      age: 20,
      isAlive: true,
      stats: { happiness: 70, health: 80, smarts: 60, looks: 55 },
      hiddenStats: { karma: 50, fertility: 75, willpower: 60 },
      flags: { isEmployed: false, isMarried: false, hasChildren: false, inPrison: false, hasDrugHabit: false, isStudent: true, inDebt: false, isTerminallyIll: false },
      financials: { bankBalance: 500, salary: 0, annualExpenses: 8000, assets: [] },
      career: { education: "none", currentJob: null, employer: null, yearsInRole: 0, performance: 50, salaryGrade: "none" },
      relationships: [],
      log: [{ age: 0, text: "You were born." }],
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    });
    expect(result.success).toBe(true);
  });

  it("rejects stats outside 0-100", () => {
    const result = CharacterSchema.shape.stats.safeParse({ happiness: 150, health: 80, smarts: 60, looks: 55 });
    expect(result.success).toBe(false);
  });
});

describe("AiEventSchema", () => {
  it("accepts a valid AI event", () => {
    const result = AiEventSchema.safeParse({
      eventText: "A venture capitalist approaches you at a coffee shop.",
      choices: [
        { text: "Pitch your idea.", effects: { happiness: 10 }, outcomeText: "They seem interested." },
        { text: "Decline politely.", effects: { happiness: -5 }, outcomeText: "You keep your privacy." },
      ],
    });
    expect(result.success).toBe(true);
  });

  it("rejects events with fewer than 2 choices", () => {
    const result = AiEventSchema.safeParse({
      eventText: "Something happened.",
      choices: [{ text: "OK.", effects: {}, outcomeText: "Fine." }],
    });
    expect(result.success).toBe(false);
  });

  it("rejects stat effects outside allowed range", () => {
    const result = AiEventSchema.safeParse({
      eventText: "A very long event text that exceeds the minimum length.",
      choices: [
        { text: "Choice A.", effects: { happiness: 999 }, outcomeText: "Outcome text here." },
        { text: "Choice B.", effects: {}, outcomeText: "Another outcome." },
      ],
    });
    expect(result.success).toBe(false);
  });
});
```

- [ ] **Step 2: Run tests to confirm they fail**

```bash
npx vitest run src/lib/schemas/__tests__/schemas.test.ts
```

Expected: FAIL — "Cannot find module '../index'"

- [ ] **Step 3: Create `src/lib/schemas/character.ts`**

```typescript
import { z } from "zod";

export const StatBlockSchema = z.object({
  happiness: z.number().int().min(0).max(100),
  health:    z.number().int().min(0).max(100),
  smarts:    z.number().int().min(0).max(100),
  looks:     z.number().int().min(0).max(100),
});

export const HiddenStatBlockSchema = z.object({
  karma:     z.number().int().min(0).max(100),
  fertility: z.number().int().min(0).max(100),
  willpower: z.number().int().min(0).max(100),
});

export const FlagsSchema = z.object({
  isEmployed:      z.boolean(),
  isMarried:       z.boolean(),
  hasChildren:     z.boolean(),
  inPrison:        z.boolean(),
  hasDrugHabit:    z.boolean(),
  isStudent:       z.boolean(),
  inDebt:          z.boolean(),
  isTerminallyIll: z.boolean(),
});

export const AssetSchema = z.object({
  type:       z.enum(["car", "house", "investment"]),
  name:       z.string(),
  value:      z.number().int(),
  annualCost: z.number().int(),
});

export const FinancialsSchema = z.object({
  bankBalance:    z.number().int(),
  salary:         z.number().int(),
  annualExpenses: z.number().int(),
  assets:         z.array(AssetSchema),
});

export const CareerSchema = z.object({
  education:   z.enum(["none", "highschool", "bachelor", "master", "phd"]),
  currentJob:  z.string().nullable(),
  employer:    z.string().nullable(),
  yearsInRole: z.number().int().min(0),
  performance: z.number().int().min(0).max(100),
  salaryGrade: z.enum(["none", "junior", "mid", "senior", "executive"]),
});

export const RelationshipSchema = z.object({
  npcId:     z.string(),
  name:      z.string(),
  relation:  z.string(),
  closeness: z.number().int().min(0).max(100),
});

export const LogEntrySchema = z.object({
  age:  z.number().int().min(0),
  text: z.string(),
});

export const CharacterSchema = z.object({
  _id:          z.string(),
  userId:       z.string(),
  packId:       z.string(),
  metadata: z.object({
    firstName:   z.string(),
    lastName:    z.string(),
    birthCountry: z.string(),
    birthCity:   z.string(),
    gender:      z.string(),
    sexuality:   z.string(),
  }),
  age:         z.number().int().min(0),
  isAlive:     z.boolean(),
  stats:       StatBlockSchema,
  hiddenStats: HiddenStatBlockSchema,
  flags:       FlagsSchema,
  financials:  FinancialsSchema,
  career:      CareerSchema,
  relationships: z.array(RelationshipSchema),
  log:         z.array(LogEntrySchema),
  createdAt:   z.string(),
  updatedAt:   z.string(),
});

// Client-safe version: hiddenStats omitted
export const CharacterClientSchema = CharacterSchema.omit({ hiddenStats: true });

export type Character       = z.infer<typeof CharacterSchema>;
export type CharacterClient = z.infer<typeof CharacterClientSchema>;
export type StatBlock       = z.infer<typeof StatBlockSchema>;
export type Flags           = z.infer<typeof FlagsSchema>;
export type Asset           = z.infer<typeof AssetSchema>;
export type LogEntry        = z.infer<typeof LogEntrySchema>;
```

- [ ] **Step 4: Create `src/lib/schemas/event.ts`**

```typescript
import { z } from "zod";

const EffectsSchema = z.object({
  happiness:        z.number().int().min(-30).max(30).optional(),
  health:           z.number().int().min(-30).max(30).optional(),
  smarts:           z.number().int().min(-15).max(15).optional(),
  looks:            z.number().int().min(-15).max(15).optional(),
  bankBalance:      z.number().int().optional(),
  karma:            z.number().int().min(-20).max(20).optional(),
  careerPerformance: z.number().int().min(-20).max(20).optional(),
});

const ProbabilisticSchema = z.object({
  chance:  z.number().min(0).max(1),
  success: EffectsSchema.extend({ outcomeText: z.string() }),
  failure: EffectsSchema.extend({ outcomeText: z.string() }),
});

export const ChoiceSchema = z.object({
  text:          z.string().min(2).max(120),
  effects:       EffectsSchema.optional(),
  outcomeText:   z.string().optional(),
  probabilistic: ProbabilisticSchema.optional(),
});

export const ConditionsSchema = z.object({
  ageMin:         z.number().int().min(0).default(0),
  ageMax:         z.number().int().max(120).default(120),
  requiredFlags:  z.array(z.string()).default([]),
  blockedFlags:   z.array(z.string()).default([]),
  statThresholds: z.record(z.object({
    min: z.number().int().optional(),
    max: z.number().int().optional(),
  })).default({}),
});

export const EventTemplateSchema = z.object({
  _id:        z.string(),
  packId:     z.string(),
  tier:       z.enum(["common", "uncommon", "flag_override"]),
  conditions: ConditionsSchema,
  eventText:  z.string().min(10).max(500),
  choices:    z.array(ChoiceSchema).min(2).max(4),
});

// AI event output schema (Zod-validated from LLM)
export const AiEventSchema = z.object({
  eventText: z.string().min(20).max(300),
  choices: z.array(z.object({
    text:        z.string().min(5).max(100),
    effects:     EffectsSchema,
    outcomeText: z.string().min(10).max(200),
  })).min(2).max(4),
});

export type EventTemplate = z.infer<typeof EventTemplateSchema>;
export type AiEvent       = z.infer<typeof AiEventSchema>;
export type Choice        = z.infer<typeof ChoiceSchema>;
export type Effects       = z.infer<typeof EffectsSchema>;
```

- [ ] **Step 5: Create `src/lib/schemas/user.ts`**

```typescript
import { z } from "zod";

export const UserSchema = z.object({
  _id:               z.string(),
  email:             z.string().email(),
  passwordHash:      z.string(),
  createdAt:         z.string(),
  unlockedDLCs:      z.array(z.string()),
  activeCharacterId: z.string().nullable(),
});

export type User = z.infer<typeof UserSchema>;
```

- [ ] **Step 6: Create `src/lib/schemas/plugin.ts`**

```typescript
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
```

- [ ] **Step 7: Create `src/lib/schemas/api.ts`**

```typescript
import { z } from "zod";

export const AgeRequestSchema = z.object({
  characterId: z.string().min(1),
});

export const ChoiceRequestSchema = z.object({
  characterId:  z.string().min(1),
  eventId:      z.string().min(1),   // "_id" of static event, or "ai" for AI events
  choiceIndex:  z.number().int().min(0).max(3),
  eventPayload: z.any().optional(),  // full AI event object (ephemeral, not in DB)
});

export const CreateCharacterSchema = z.object({
  firstName:    z.string().min(1).max(50),
  lastName:     z.string().min(1).max(50),
  birthCountry: z.string().min(1),
  birthCity:    z.string().min(1),
  gender:       z.string().min(1),
  sexuality:    z.string().min(1),
  packId:       z.string().default("core_realistic"),
});

export const DlcUpdateSchema = z.object({
  unlockedDLCs: z.array(z.string()),
});
```

- [ ] **Step 8: Create `src/lib/schemas/index.ts`**

```typescript
export * from "./character";
export * from "./event";
export * from "./user";
export * from "./plugin";
export * from "./api";
```

- [ ] **Step 9: Run tests — expect pass**

```bash
npx vitest run src/lib/schemas/__tests__/schemas.test.ts
```

Expected: 5 tests, all PASS.

- [ ] **Step 10: Commit**

```bash
git add src/lib/schemas
git commit -m "feat: add Zod schemas and TypeScript types for all domain models"
```

---

### Task 3: MongoDB Connection + Event Seed Data

**Files:**
- Create: `src/lib/mongodb.ts`
- Create: `data/events/common.json`
- Create: `data/events/uncommon.json`
- Create: `data/events/flags.json`
- Create: `scripts/seed-events.ts`
- Create: `src/lib/mongodb.test.ts`

**Interfaces:**
- Produces: `getDb(): Promise<Db>` — used by all API routes and the seed script

- [ ] **Step 1: Write the failing test**

```typescript
// src/lib/mongodb.test.ts
import { describe, it, expect, vi } from "vitest";

// We test the module shape, not a real connection (no test DB required)
describe("mongodb module", () => {
  it("exports a getDb function", async () => {
    const mod = await import("./mongodb");
    expect(typeof mod.getDb).toBe("function");
  });
});
```

- [ ] **Step 2: Run test to confirm it fails**

```bash
npx vitest run src/lib/mongodb.test.ts
```

Expected: FAIL — "Cannot find module './mongodb'"

- [ ] **Step 3: Create `src/lib/mongodb.ts`**

```typescript
import { MongoClient, Db } from "mongodb";

let client: MongoClient;
let db: Db;

export async function getDb(): Promise<Db> {
  if (db) return db;

  const uri = process.env.MONGODB_URI;
  if (!uri) throw new Error("MONGODB_URI environment variable is not set");

  client = new MongoClient(uri);
  await client.connect();
  db = client.db();
  return db;
}
```

- [ ] **Step 4: Create `data/events/common.json`**

```json
[
  {
    "_id": "evt_coworker_credit",
    "packId": "core_realistic",
    "tier": "common",
    "conditions": { "ageMin": 18, "ageMax": 65, "requiredFlags": ["isEmployed"], "blockedFlags": ["inPrison"], "statThresholds": {} },
    "eventText": "A coworker takes credit for your idea in a team meeting.",
    "choices": [
      { "text": "Confront them publicly.", "effects": { "happiness": -5, "karma": 5 }, "probabilistic": { "chance": 0.35, "success": { "smarts": 3, "outcomeText": "You made your case. Your manager noticed." }, "failure": { "happiness": -10, "outcomeText": "It came across as petty. You looked worse." } } },
      { "text": "Let it go.", "effects": { "happiness": -8 }, "outcomeText": "You kept the peace, but it stings." },
      { "text": "Talk to your manager privately.", "effects": { "happiness": 5, "careerPerformance": 3 }, "outcomeText": "Your manager appreciated the professionalism." }
    ]
  },
  {
    "_id": "evt_family_call",
    "packId": "core_realistic",
    "tier": "common",
    "conditions": { "ageMin": 16, "ageMax": 80, "requiredFlags": [], "blockedFlags": [], "statThresholds": {} },
    "eventText": "Your mother calls and wants to talk for an hour. You're busy.",
    "choices": [
      { "text": "Take the call.", "effects": { "happiness": 5 }, "outcomeText": "It was nice to catch up." },
      { "text": "Send her to voicemail.", "effects": { "happiness": -3, "karma": -5 }, "outcomeText": "You feel a twinge of guilt." }
    ]
  },
  {
    "_id": "evt_car_repair",
    "packId": "core_realistic",
    "tier": "common",
    "conditions": { "ageMin": 17, "ageMax": 80, "requiredFlags": [], "blockedFlags": [], "statThresholds": {} },
    "eventText": "Your car makes an alarming grinding noise on the way to work.",
    "choices": [
      { "text": "Take it to the mechanic immediately.", "effects": { "bankBalance": -800, "happiness": -5 }, "outcomeText": "It was the brake pads. Cheaper than it could have been." },
      { "text": "Ignore it for now.", "effects": { "karma": -3 }, "probabilistic": { "chance": 0.4, "success": { "outcomeText": "It sorted itself out. Lucky." }, "failure": { "bankBalance": -2500, "happiness": -15, "outcomeText": "The engine seized. Expensive mistake." } } }
    ]
  },
  {
    "_id": "evt_overtime_request",
    "packId": "core_realistic",
    "tier": "common",
    "conditions": { "ageMin": 18, "ageMax": 65, "requiredFlags": ["isEmployed"], "blockedFlags": [], "statThresholds": {} },
    "eventText": "Your boss asks you to stay late three nights this week.",
    "choices": [
      { "text": "Agree willingly.", "effects": { "careerPerformance": 5, "happiness": -8, "bankBalance": 600 }, "outcomeText": "Your dedication was noticed. Your bank account appreciated it too." },
      { "text": "Decline — you have plans.", "effects": { "happiness": 5, "careerPerformance": -3 }, "outcomeText": "Your boss seemed annoyed, but your sanity is intact." }
    ]
  },
  {
    "_id": "evt_neighbour_noise",
    "packId": "core_realistic",
    "tier": "common",
    "conditions": { "ageMin": 18, "ageMax": 90, "requiredFlags": [], "blockedFlags": [], "statThresholds": {} },
    "eventText": "Your neighbour throws a loud party that goes until 3am.",
    "choices": [
      { "text": "Knock on their door and ask them to keep it down.", "effects": { "happiness": 3 }, "probabilistic": { "chance": 0.6, "success": { "outcomeText": "They apologised and turned it down." }, "failure": { "happiness": -5, "outcomeText": "They told you to lighten up." } } },
      { "text": "Call the council noise line.", "effects": { "happiness": 5, "karma": -2 }, "outcomeText": "The music stopped an hour later. Worth it." },
      { "text": "Put in earplugs and try to sleep.", "effects": { "happiness": -5 }, "outcomeText": "You survived, barely." }
    ]
  },
  {
    "_id": "evt_friend_hangout",
    "packId": "core_realistic",
    "tier": "common",
    "conditions": { "ageMin": 12, "ageMax": 70, "requiredFlags": [], "blockedFlags": [], "statThresholds": {} },
    "eventText": "A friend invites you to catch up over dinner.",
    "choices": [
      { "text": "Go along.", "effects": { "happiness": 10, "bankBalance": -60 }, "outcomeText": "It was exactly what you needed." },
      { "text": "Cancel at the last minute.", "effects": { "happiness": -3, "karma": -5 }, "outcomeText": "Your friend was disappointed. You stayed home anyway." }
    ]
  },
  {
    "_id": "evt_gym_temptation",
    "packId": "core_realistic",
    "tier": "common",
    "conditions": { "ageMin": 16, "ageMax": 60, "requiredFlags": [], "blockedFlags": [], "statThresholds": {} },
    "eventText": "You've been meaning to join a gym for months. There's a sign-up deal on.",
    "choices": [
      { "text": "Join the gym.", "effects": { "bankBalance": -600, "health": 5, "looks": 3 }, "outcomeText": "You actually went three times this week." },
      { "text": "Tell yourself you'll start next month.", "effects": { "happiness": -2 }, "outcomeText": "You won't." }
    ]
  },
  {
    "_id": "evt_work_presentation",
    "packId": "core_realistic",
    "tier": "common",
    "conditions": { "ageMin": 22, "ageMax": 65, "requiredFlags": ["isEmployed"], "blockedFlags": [], "statThresholds": {} },
    "eventText": "You have to present the quarterly report to the leadership team.",
    "choices": [
      { "text": "Prepare thoroughly.", "effects": { "careerPerformance": 8, "happiness": 5 }, "outcomeText": "You nailed it. The CEO complimented your clarity." },
      { "text": "Wing it.", "effects": {}, "probabilistic": { "chance": 0.3, "success": { "careerPerformance": 3, "outcomeText": "Surprisingly, you pulled it off." }, "failure": { "careerPerformance": -10, "happiness": -10, "outcomeText": "It was a disaster. You blanked on the third slide." } } }
    ]
  }
]
```

- [ ] **Step 5: Create `data/events/uncommon.json`**

```json
[
  {
    "_id": "evt_promotion_offer",
    "packId": "core_realistic",
    "tier": "uncommon",
    "conditions": { "ageMin": 25, "ageMax": 55, "requiredFlags": ["isEmployed"], "blockedFlags": [], "statThresholds": { "careerPerformance": { "min": 60 } } },
    "eventText": "Your manager pulls you aside. There's a senior role opening and your name has come up.",
    "choices": [
      { "text": "Express strong interest.", "effects": { "careerPerformance": 5, "happiness": 8 }, "probabilistic": { "chance": 0.65, "success": { "bankBalance": 12000, "outcomeText": "You got the promotion. $12,000 raise effective immediately." }, "failure": { "happiness": -10, "outcomeText": "They went with an external candidate. Disappointing." } } },
      { "text": "Say you need to think about it.", "effects": { "careerPerformance": -5 }, "outcomeText": "The window closed. They picked someone else." }
    ]
  },
  {
    "_id": "evt_inheritance",
    "packId": "core_realistic",
    "tier": "uncommon",
    "conditions": { "ageMin": 25, "ageMax": 80, "requiredFlags": [], "blockedFlags": [], "statThresholds": {} },
    "eventText": "A distant relative you barely knew has passed away and left you something in their will.",
    "choices": [
      { "text": "Accept the inheritance.", "effects": { "bankBalance": 35000, "happiness": 5, "karma": -3 }, "outcomeText": "You feel a little guilty but the money is real." },
      { "text": "Donate it to charity in their name.", "effects": { "karma": 20, "happiness": 10 }, "outcomeText": "It felt like the right thing to do." }
    ]
  },
  {
    "_id": "evt_serious_illness",
    "packId": "core_realistic",
    "tier": "uncommon",
    "conditions": { "ageMin": 30, "ageMax": 90, "requiredFlags": [], "blockedFlags": ["isTerminallyIll"], "statThresholds": { "health": { "max": 60 } } },
    "eventText": "Routine bloodwork comes back with results your doctor wants to discuss urgently.",
    "choices": [
      { "text": "See the specialist immediately.", "effects": { "bankBalance": -3000, "happiness": -10 }, "probabilistic": { "chance": 0.7, "success": { "health": 10, "outcomeText": "Caught early. Treatment is straightforward." }, "failure": { "health": -15, "outcomeText": "More serious than hoped. Long road ahead." } } },
      { "text": "Delay the appointment — you're busy.", "effects": { "health": -10, "karma": -5 }, "outcomeText": "Three months later, the situation was worse." }
    ]
  },
  {
    "_id": "evt_startup_pitch",
    "packId": "core_realistic",
    "tier": "uncommon",
    "conditions": { "ageMin": 22, "ageMax": 50, "requiredFlags": [], "blockedFlags": [], "statThresholds": { "smarts": { "min": 55 } } },
    "eventText": "A friend wants you to co-found a startup with them. They have the idea; you'd handle the technical side.",
    "choices": [
      { "text": "Quit your job and go all in.", "effects": { "happiness": 10 }, "probabilistic": { "chance": 0.25, "success": { "bankBalance": 150000, "outcomeText": "Three years later, you sold the company." }, "failure": { "bankBalance": -20000, "happiness": -20, "outcomeText": "It failed after 18 months. You burned through savings." } } },
      { "text": "Work on it as a side project.", "effects": { "happiness": 5, "health": -5 }, "outcomeText": "Balancing both is exhausting, but you're managing." },
      { "text": "Pass.", "effects": { "happiness": -5 }, "outcomeText": "You watched them build it without you." }
    ]
  },
  {
    "_id": "evt_romantic_proposal",
    "packId": "core_realistic",
    "tier": "uncommon",
    "conditions": { "ageMin": 20, "ageMax": 45, "requiredFlags": [], "blockedFlags": ["isMarried"], "statThresholds": {} },
    "eventText": "Your partner of two years surprises you with a ring at dinner.",
    "choices": [
      { "text": "Say yes.", "effects": { "happiness": 25, "bankBalance": -5000 }, "outcomeText": "You're engaged. The table next to you burst into applause." },
      { "text": "Ask for more time.", "effects": { "happiness": -10 }, "outcomeText": "They were hurt. The relationship is now strained." },
      { "text": "Say no.", "effects": { "happiness": -20, "karma": -5 }, "outcomeText": "It's over. You both knew it as soon as the word left your mouth." }
    ]
  },
  {
    "_id": "evt_redundancy",
    "packId": "core_realistic",
    "tier": "uncommon",
    "conditions": { "ageMin": 22, "ageMax": 60, "requiredFlags": ["isEmployed"], "blockedFlags": [], "statThresholds": { "careerPerformance": { "max": 40 } } },
    "eventText": "The company is restructuring. Your role has been flagged in the review.",
    "choices": [
      { "text": "Fight for your position — request a meeting with HR.", "effects": { "happiness": -5 }, "probabilistic": { "chance": 0.4, "success": { "careerPerformance": 10, "outcomeText": "You made a compelling case. You keep your job." }, "failure": { "bankBalance": 8000, "outcomeText": "You were let go anyway but negotiated a better payout." } } },
      { "text": "Accept the redundancy package.", "effects": { "bankBalance": 8000, "happiness": -15 }, "outcomeText": "The cheque cleared. Now what?" }
    ]
  }
]
```

- [ ] **Step 6: Create `data/events/flags.json`**

```json
[
  {
    "_id": "evt_flag_prison_fight",
    "packId": "core_realistic",
    "tier": "flag_override",
    "conditions": { "ageMin": 0, "ageMax": 120, "requiredFlags": ["inPrison"], "blockedFlags": [], "statThresholds": {} },
    "eventText": "An inmate corners you in the yard. You're going to have to deal with this.",
    "choices": [
      { "text": "Stand your ground.", "effects": { "karma": 5 }, "probabilistic": { "chance": 0.5, "success": { "looks": -2, "outcomeText": "You held your own. Word got around." }, "failure": { "health": -20, "outcomeText": "You took a bad beating." } } },
      { "text": "Back down.", "effects": { "happiness": -15 }, "outcomeText": "It won't be the last time they come for you." },
      { "text": "Report it to a guard.", "effects": { "karma": -5, "happiness": -5 }, "outcomeText": "Some inmates now see you as a snitch." }
    ]
  },
  {
    "_id": "evt_flag_debt_collector",
    "packId": "core_realistic",
    "tier": "flag_override",
    "conditions": { "ageMin": 0, "ageMax": 120, "requiredFlags": ["inDebt"], "blockedFlags": [], "statThresholds": {} },
    "eventText": "A debt collection agency has started calling your mobile. Three times yesterday.",
    "choices": [
      { "text": "Answer and negotiate a payment plan.", "effects": { "happiness": -5, "bankBalance": -2000 }, "outcomeText": "They agreed to monthly installments. The calls stop." },
      { "text": "Block the number.", "effects": { "happiness": -10, "karma": -5 }, "outcomeText": "They'll find another way to reach you." },
      { "text": "Consult a financial counsellor.", "effects": { "bankBalance": -300, "happiness": 5 }, "outcomeText": "You have a plan now. It's manageable." }
    ]
  },
  {
    "_id": "evt_flag_drug_withdrawal",
    "packId": "core_realistic",
    "tier": "flag_override",
    "conditions": { "ageMin": 0, "ageMax": 120, "requiredFlags": ["hasDrugHabit"], "blockedFlags": [], "statThresholds": {} },
    "eventText": "You wake up shaking. The craving is overwhelming. You know what you need to do — both options are clear.",
    "choices": [
      { "text": "Use again.", "effects": { "health": -10, "happiness": 5, "karma": -10 }, "outcomeText": "The relief is immediate and hollow." },
      { "text": "Call a support line and push through.", "effects": { "health": -5, "karma": 15, "happiness": -10 }, "outcomeText": "The hardest day in a long time. But you made it." }
    ]
  },
  {
    "_id": "evt_flag_terminal_will",
    "packId": "core_realistic",
    "tier": "flag_override",
    "conditions": { "ageMin": 0, "ageMax": 120, "requiredFlags": ["isTerminallyIll"], "blockedFlags": [], "statThresholds": {} },
    "eventText": "Your doctor asks if you've thought about end-of-life planning. You haven't, but you should.",
    "choices": [
      { "text": "Write a will and set up a health directive.", "effects": { "happiness": 5, "karma": 10 }, "outcomeText": "It was sobering, but you feel a strange peace." },
      { "text": "Tell them you're not ready to think about it.", "effects": { "happiness": -5 }, "outcomeText": "The topic hangs over you." }
    ]
  }
]
```

- [ ] **Step 7: Create `scripts/seed-events.ts`**

```typescript
// scripts/seed-events.ts
// Run with: npx tsx scripts/seed-events.ts
import { MongoClient } from "mongodb";
import * as fs from "fs";
import * as path from "path";

async function seed() {
  const uri = process.env.MONGODB_URI;
  if (!uri) throw new Error("MONGODB_URI not set");

  const client = new MongoClient(uri);
  await client.connect();
  const db = client.db();

  const files = ["common", "uncommon", "flags"];
  for (const name of files) {
    const filePath = path.join(process.cwd(), "data", "events", `${name}.json`);
    const events = JSON.parse(fs.readFileSync(filePath, "utf-8"));

    for (const event of events) {
      await db.collection("event_templates").replaceOne(
        { _id: event._id },
        event,
        { upsert: true }
      );
    }
    console.log(`Seeded ${events.length} ${name} events`);
  }

  await db.collection("event_templates").createIndex(
    { packId: 1, tier: 1, "conditions.ageMin": 1, "conditions.ageMax": 1 }
  );
  console.log("Index created");
  await client.close();
}

seed().catch(console.error);
```

- [ ] **Step 8: Add tsx as a dev dependency**

```bash
npm install -D tsx
```

- [ ] **Step 9: Run the mongodb module test**

```bash
npx vitest run src/lib/mongodb.test.ts
```

Expected: 1 test, PASS.

- [ ] **Step 10: Commit**

```bash
git add src/lib/mongodb.ts src/lib/mongodb.test.ts data/ scripts/
git commit -m "feat: add MongoDB connection singleton, event seed data, and seed script"
```

---

### Task 4: Auth — NextAuth + Register/Login Pages

**Files:**
- Create: `src/lib/auth.ts`
- Create: `src/app/api/auth/[...nextauth]/route.ts`
- Create: `src/middleware.ts`
- Create: `src/app/(auth)/login/page.tsx`
- Create: `src/app/(auth)/register/page.tsx`
- Create: `src/app/api/auth/register/route.ts`
- Create: `src/lib/auth.test.ts`

**Interfaces:**
- Produces: `auth()` — server-side session accessor used by all API routes; `/login` and `/register` pages; protected route middleware

- [ ] **Step 1: Write failing auth tests**

```typescript
// src/lib/auth.test.ts
import { describe, it, expect, vi } from "vitest";

describe("hashPassword / verifyPassword", () => {
  it("hashes a password and verifies it correctly", async () => {
    const { hashPassword, verifyPassword } = await import("./authUtils");
    const hash = await hashPassword("hunter2");
    expect(await verifyPassword("hunter2", hash)).toBe(true);
    expect(await verifyPassword("wrong", hash)).toBe(false);
  });
});
```

- [ ] **Step 2: Run test — expect FAIL**

```bash
npx vitest run src/lib/auth.test.ts
```

Expected: FAIL — "Cannot find module './authUtils'"

- [ ] **Step 3: Create `src/lib/authUtils.ts`**

```typescript
import bcrypt from "bcryptjs";

export async function hashPassword(plain: string): Promise<string> {
  return bcrypt.hash(plain, 12);
}

export async function verifyPassword(plain: string, hash: string): Promise<boolean> {
  return bcrypt.compare(plain, hash);
}
```

- [ ] **Step 4: Create `src/lib/auth.ts`**

```typescript
import NextAuth from "next-auth";
import Credentials from "next-auth/providers/credentials";
import { getDb } from "./mongodb";
import { verifyPassword } from "./authUtils";

export const { handlers, auth, signIn, signOut } = NextAuth({
  providers: [
    Credentials({
      credentials: {
        email:    { label: "Email",    type: "email" },
        password: { label: "Password", type: "password" },
      },
      async authorize(credentials) {
        if (!credentials?.email || !credentials?.password) return null;

        const db   = await getDb();
        const user = await db.collection("users").findOne({ email: credentials.email });
        if (!user) return null;

        const valid = await verifyPassword(credentials.password as string, user.passwordHash);
        if (!valid) return null;

        return { id: user._id, email: user.email };
      },
    }),
  ],
  session: { strategy: "jwt" },
  pages: { signIn: "/login" },
  callbacks: {
    jwt({ token, user }) {
      if (user) token.userId = user.id;
      return token;
    },
    session({ session, token }) {
      session.user.id = token.userId as string;
      return session;
    },
  },
});
```

- [ ] **Step 5: Create `src/app/api/auth/[...nextauth]/route.ts`**

```typescript
import { handlers } from "@/lib/auth";
export const { GET, POST } = handlers;
```

- [ ] **Step 6: Create `src/app/api/auth/register/route.ts`**

```typescript
import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { getDb } from "@/lib/mongodb";
import { hashPassword } from "@/lib/authUtils";
import { randomUUID } from "crypto";

const RegisterSchema = z.object({
  email:    z.string().email(),
  password: z.string().min(8),
});

export async function POST(req: NextRequest) {
  const body = await req.json();
  const parsed = RegisterSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: "Invalid input" }, { status: 400 });
  }

  const { email, password } = parsed.data;
  const db = await getDb();

  const existing = await db.collection("users").findOne({ email });
  if (existing) {
    return NextResponse.json({ error: "Email already registered" }, { status: 409 });
  }

  const now  = new Date().toISOString();
  const user = {
    _id:               randomUUID(),
    email,
    passwordHash:      await hashPassword(password),
    createdAt:         now,
    unlockedDLCs:      ["core_realistic"],
    activeCharacterId: null,
  };

  await db.collection("users").insertOne(user);
  return NextResponse.json({ ok: true }, { status: 201 });
}
```

- [ ] **Step 7: Create `src/middleware.ts`**

```typescript
import { auth } from "@/lib/auth";
import { NextResponse } from "next/server";

export default auth((req) => {
  const isAuth      = !!req.auth;
  const isAuthPage  = req.nextUrl.pathname.startsWith("/login") ||
                      req.nextUrl.pathname.startsWith("/register");
  const isApiAuth   = req.nextUrl.pathname.startsWith("/api/auth");

  if (isApiAuth) return NextResponse.next();
  if (isAuthPage && isAuth) return NextResponse.redirect(new URL("/", req.url));
  if (!isAuth && !isAuthPage) return NextResponse.redirect(new URL("/login", req.url));

  return NextResponse.next();
});

export const config = {
  matcher: ["/((?!_next/static|_next/image|favicon.ico).*)"],
};
```

- [ ] **Step 8: Create `src/app/(auth)/login/page.tsx`**

```tsx
"use client";
import { signIn } from "next-auth/react";
import { useState } from "react";
import { useRouter } from "next/navigation";

export default function LoginPage() {
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError("");
    const res = await signIn("credentials", { email, password, redirect: false });
    if (res?.error) { setError("Invalid email or password"); return; }
    router.push("/");
  }

  return (
    <main className="min-h-screen flex items-center justify-center bg-gray-950 px-4">
      <form onSubmit={handleSubmit} className="w-full max-w-sm space-y-4">
        <h1 className="text-2xl font-bold text-white text-center">Life Simulator</h1>
        {error && <p className="text-red-400 text-sm text-center">{error}</p>}
        <input
          type="email" value={email} onChange={e => setEmail(e.target.value)}
          placeholder="Email" required
          className="w-full p-3 rounded-lg bg-gray-800 text-white border border-gray-700 focus:outline-none focus:border-blue-500 min-h-[44px]"
        />
        <input
          type="password" value={password} onChange={e => setPassword(e.target.value)}
          placeholder="Password" required
          className="w-full p-3 rounded-lg bg-gray-800 text-white border border-gray-700 focus:outline-none focus:border-blue-500 min-h-[44px]"
        />
        <button type="submit" className="w-full py-3 bg-blue-600 text-white rounded-lg font-semibold hover:bg-blue-500 min-h-[44px]">
          Sign In
        </button>
        <p className="text-gray-400 text-center text-sm">
          No account? <a href="/register" className="text-blue-400 underline">Register</a>
        </p>
      </form>
    </main>
  );
}
```

- [ ] **Step 9: Create `src/app/(auth)/register/page.tsx`**

```tsx
"use client";
import { useState } from "react";
import { useRouter } from "next/navigation";

export default function RegisterPage() {
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError("");
    const res = await fetch("/api/auth/register", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email, password }),
    });
    if (!res.ok) { const d = await res.json(); setError(d.error ?? "Registration failed"); return; }
    router.push("/login");
  }

  return (
    <main className="min-h-screen flex items-center justify-center bg-gray-950 px-4">
      <form onSubmit={handleSubmit} className="w-full max-w-sm space-y-4">
        <h1 className="text-2xl font-bold text-white text-center">Create Account</h1>
        {error && <p className="text-red-400 text-sm text-center">{error}</p>}
        <input
          type="email" value={email} onChange={e => setEmail(e.target.value)}
          placeholder="Email" required
          className="w-full p-3 rounded-lg bg-gray-800 text-white border border-gray-700 focus:outline-none focus:border-blue-500 min-h-[44px]"
        />
        <input
          type="password" value={password} onChange={e => setPassword(e.target.value)}
          placeholder="Password (min 8 chars)" required minLength={8}
          className="w-full p-3 rounded-lg bg-gray-800 text-white border border-gray-700 focus:outline-none focus:border-blue-500 min-h-[44px]"
        />
        <button type="submit" className="w-full py-3 bg-green-600 text-white rounded-lg font-semibold hover:bg-green-500 min-h-[44px]">
          Register
        </button>
        <p className="text-gray-400 text-center text-sm">
          Already registered? <a href="/login" className="text-blue-400 underline">Sign In</a>
        </p>
      </form>
    </main>
  );
}
```

- [ ] **Step 10: Run auth tests**

```bash
npx vitest run src/lib/auth.test.ts
```

Expected: 1 test, PASS.

- [ ] **Step 11: Commit**

```bash
git add src/lib/auth.ts src/lib/authUtils.ts src/lib/auth.test.ts src/middleware.ts src/app/\(auth\)/ src/app/api/auth/
git commit -m "feat: add NextAuth credentials auth, register/login pages, and route protection"
```

---

### Task 5: Plugin System

**Files:**
- Create: `src/plugins/core_realistic.ts`
- Create: `src/plugins/fantasy_pack.ts`
- Create: `src/plugins/index.ts`
- Create: `src/plugins/plugins.test.ts`

**Interfaces:**
- Consumes: `GamePlugin`, `StatDefinition`, `CareerTrack` from `@/lib/schemas/plugin`
- Produces: `PLUGINS` registry — used by `/api/age`, `eventResolver`, `aiEventGenerator`

- [ ] **Step 1: Write failing plugin tests**

```typescript
// src/plugins/plugins.test.ts
import { describe, it, expect } from "vitest";
import { PLUGINS } from "./index";
import type { Character } from "@/lib/schemas/character";

const mockChar: Character = {
  _id: "c1", userId: "u1", packId: "core_realistic",
  metadata: { firstName: "Test", lastName: "User", birthCountry: "AU", birthCity: "Sydney", gender: "male", sexuality: "heterosexual" },
  age: 30, isAlive: true,
  stats: { happiness: 50, health: 70, smarts: 60, looks: 55 },
  hiddenStats: { karma: 50, fertility: 70, willpower: 60 },
  flags: { isEmployed: true, isMarried: false, hasChildren: false, inPrison: false, hasDrugHabit: false, isStudent: false, inDebt: false, isTerminallyIll: false },
  financials: { bankBalance: 20000, salary: 60000, annualExpenses: 30000, assets: [] },
  career: { education: "bachelor", currentJob: "Developer", employer: "Corp", yearsInRole: 3, performance: 70, salaryGrade: "mid" },
  relationships: [], log: [],
  createdAt: "", updatedAt: "",
};

describe("PLUGINS registry", () => {
  it("contains core_realistic", () => {
    expect(PLUGINS["core_realistic"]).toBeDefined();
  });

  it("core_realistic has no extraStats", () => {
    expect(PLUGINS["core_realistic"].extraStats).toHaveLength(0);
  });

  it("core_realistic buildAiBiasInstruction returns a non-empty string", () => {
    const bias = PLUGINS["core_realistic"].buildAiBiasInstruction(mockChar);
    expect(typeof bias).toBe("string");
    expect(bias.length).toBeGreaterThan(10);
  });

  it("fantasy_pack stub is registered", () => {
    expect(PLUGINS["fantasy_world_pack_v1"]).toBeDefined();
  });

  it("unknown packId falls back to core_realistic", () => {
    const plugin = PLUGINS["unknown_pack"] ?? PLUGINS["core_realistic"];
    expect(plugin.id).toBe("core_realistic");
  });
});
```

- [ ] **Step 2: Run test — expect FAIL**

```bash
npx vitest run src/plugins/plugins.test.ts
```

Expected: FAIL — "Cannot find module './index'"

- [ ] **Step 3: Create `src/plugins/core_realistic.ts`**

```typescript
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
```

- [ ] **Step 4: Create `src/plugins/fantasy_pack.ts` (stub)**

```typescript
import type { GamePlugin } from "@/lib/schemas/plugin";

export const fantasyPack: GamePlugin = {
  id:    "fantasy_world_pack_v1",
  label: "Fantasy World (Coming Soon)",
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
```

- [ ] **Step 5: Create `src/plugins/index.ts`**

```typescript
import { coreRealistic } from "./core_realistic";
import { fantasyPack }   from "./fantasy_pack";
import type { GamePlugin } from "@/lib/schemas/plugin";

export const PLUGINS: Record<string, GamePlugin> = {
  [coreRealistic.id]: coreRealistic,
  [fantasyPack.id]:   fantasyPack,
};
```

- [ ] **Step 6: Run tests — expect PASS**

```bash
npx vitest run src/plugins/plugins.test.ts
```

Expected: 5 tests, all PASS.

- [ ] **Step 7: Commit**

```bash
git add src/plugins/
git commit -m "feat: add plugin system with core_realistic and fantasy_pack stub"
```

---

### Task 6: Stat Engine

**Files:**
- Create: `src/engine/statEngine.ts`
- Create: `src/engine/statEngine.test.ts`

**Interfaces:**
- Consumes: `Character` from `@/lib/schemas/character`
- Produces: `tickStats(char: Character): Character` — mutates and returns an updated character with age incremented, stats ticked, flags updated; used by `/api/age`

- [ ] **Step 1: Write failing stat engine tests (includes Review Focus items 4 and 5)**

```typescript
// src/engine/statEngine.test.ts
import { describe, it, expect } from "vitest";
import { tickStats, applyEffects, clamp } from "./statEngine";
import type { Character } from "@/lib/schemas/character";

function makeChar(overrides: Partial<Character> = {}): Character {
  return {
    _id: "c1", userId: "u1", packId: "core_realistic",
    metadata: { firstName: "A", lastName: "B", birthCountry: "AU", birthCity: "Sydney", gender: "male", sexuality: "heterosexual" },
    age: 30, isAlive: true,
    stats: { happiness: 50, health: 70, smarts: 60, looks: 55 },
    hiddenStats: { karma: 50, fertility: 70, willpower: 60 },
    flags: { isEmployed: false, isMarried: false, hasChildren: false, inPrison: false, hasDrugHabit: false, isStudent: false, inDebt: false, isTerminallyIll: false },
    financials: { bankBalance: 10000, salary: 50000, annualExpenses: 30000, assets: [] },
    career: { education: "bachelor", currentJob: null, employer: null, yearsInRole: 0, performance: 50, salaryGrade: "none" },
    relationships: [
      { npcId: "npc_1", name: "Mum", relation: "mother", closeness: 80 },
    ],
    log: [],
    createdAt: "", updatedAt: "",
    ...overrides,
  };
}

describe("clamp", () => {
  it("clamps values within 0-100", () => {
    expect(clamp(150)).toBe(100);
    expect(clamp(-10)).toBe(0);
    expect(clamp(50)).toBe(50);
  });
});

describe("applyEffects", () => {
  // Review Focus #4: stat overflow at boundary
  it("does not let health exceed 100", () => {
    const char = makeChar({ stats: { happiness: 50, health: 100, smarts: 60, looks: 55 } });
    const result = applyEffects(char, { health: 20 });
    expect(result.stats.health).toBe(100);
  });

  it("does not let stats drop below 0", () => {
    const char = makeChar({ stats: { happiness: 5, health: 70, smarts: 60, looks: 55 } });
    const result = applyEffects(char, { happiness: -50 });
    expect(result.stats.happiness).toBe(0);
  });

  it("applies bank balance change", () => {
    const char = makeChar({ financials: { bankBalance: 1000, salary: 0, annualExpenses: 0, assets: [] } });
    const result = applyEffects(char, { bankBalance: -500 });
    expect(result.financials.bankBalance).toBe(500);
  });

  it("applies career performance change", () => {
    const char = makeChar();
    const result = applyEffects(char, { careerPerformance: 10 });
    expect(result.career.performance).toBe(60);
  });
});

describe("tickStats", () => {
  it("increments age by 1", () => {
    const char = makeChar({ age: 25 });
    const result = tickStats(char);
    expect(result.age).toBe(26);
  });

  it("applies health decay after age 40", () => {
    const char = makeChar({ age: 41, stats: { happiness: 50, health: 80, smarts: 60, looks: 55 } });
    const result = tickStats(char);
    expect(result.stats.health).toBe(79); // -1/yr after 40
  });

  it("applies increased health decay after age 60", () => {
    const char = makeChar({ age: 61, stats: { happiness: 50, health: 80, smarts: 60, looks: 55 } });
    const result = tickStats(char);
    expect(result.stats.health).toBe(78); // -2/yr after 60
  });

  it("applies drug habit health penalty", () => {
    const char = makeChar({
      age: 30,
      stats: { happiness: 50, health: 80, smarts: 60, looks: 55 },
      flags: { isEmployed: false, isMarried: false, hasChildren: false, inPrison: false, hasDrugHabit: true, isStudent: false, inDebt: false, isTerminallyIll: false },
    });
    const result = tickStats(char);
    expect(result.stats.health).toBe(75); // -5/yr for drug habit
  });

  it("adds salary - expenses to bank balance", () => {
    const char = makeChar({ financials: { bankBalance: 0, salary: 50000, annualExpenses: 30000, assets: [] } });
    const result = tickStats(char);
    expect(result.financials.bankBalance).toBe(20000);
  });

  it("depreciates vehicle assets at 8%/yr", () => {
    const char = makeChar({ financials: { bankBalance: 10000, salary: 0, annualExpenses: 0, assets: [{ type: "car", name: "Honda", value: 10000, annualCost: 1000 }] } });
    const result = tickStats(char);
    expect(result.financials.assets[0].value).toBe(9200); // 10000 * 0.92
    expect(result.financials.bankBalance).toBe(9000);     // 10000 - 1000 annualCost
  });

  it("sets inDebt flag when bankBalance < 0", () => {
    const char = makeChar({ financials: { bankBalance: -100, salary: 0, annualExpenses: 50000, assets: [] } });
    const result = tickStats(char);
    expect(result.flags.inDebt).toBe(true);
  });

  it("decays relationship closeness by 2/yr", () => {
    const char = makeChar({ relationships: [{ npcId: "n1", name: "Mum", relation: "mother", closeness: 80 }] });
    const result = tickStats(char);
    expect(result.relationships[0].closeness).toBe(78);
  });

  it("removes estranged NPCs (closeness < 10)", () => {
    const char = makeChar({ relationships: [{ npcId: "n1", name: "Ex", relation: "friend", closeness: 9 }] });
    const result = tickStats(char);
    expect(result.relationships).toHaveLength(0);
  });

  // Review Focus #5: death at health boundary
  it("sets isAlive to false when health reaches 0", () => {
    const char = makeChar({ age: 76, stats: { happiness: 50, health: 1, smarts: 60, looks: 55 } });
    const result = tickStats(char);
    // age 76 → -3/yr health decay: 1 - 3 = -2, clamped to 0 → death
    expect(result.stats.health).toBe(0);
    expect(result.isAlive).toBe(false);
  });
});
```

- [ ] **Step 2: Run tests — expect FAIL**

```bash
npx vitest run src/engine/statEngine.test.ts
```

Expected: FAIL — "Cannot find module './statEngine'"

- [ ] **Step 3: Create `src/engine/statEngine.ts`**

```typescript
import type { Character, Effects } from "@/lib/schemas";

export function clamp(value: number, min = 0, max = 100): number {
  return Math.min(max, Math.max(min, Math.round(value)));
}

export function applyEffects(char: Character, effects: Effects): Character {
  const c = structuredClone(char);

  if (effects.happiness  !== undefined) c.stats.happiness  = clamp(c.stats.happiness  + effects.happiness);
  if (effects.health     !== undefined) c.stats.health     = clamp(c.stats.health     + effects.health);
  if (effects.smarts     !== undefined) c.stats.smarts     = clamp(c.stats.smarts     + effects.smarts);
  if (effects.looks      !== undefined) c.stats.looks      = clamp(c.stats.looks      + effects.looks);
  if (effects.karma      !== undefined) c.hiddenStats.karma = clamp(c.hiddenStats.karma + effects.karma);
  if (effects.bankBalance !== undefined) c.financials.bankBalance += effects.bankBalance;
  if (effects.careerPerformance !== undefined) c.career.performance = clamp(c.career.performance + effects.careerPerformance);

  return c;
}

export function tickStats(char: Character): Character {
  const c = structuredClone(char);

  // Age
  c.age += 1;

  // Health decay by age
  let healthDelta = 0;
  if (c.age > 75) healthDelta -= 3;
  else if (c.age > 60) healthDelta -= 2;
  else if (c.age > 40) healthDelta -= 1;

  if (c.flags.hasDrugHabit)    healthDelta -= 5;
  if (c.flags.isTerminallyIll) healthDelta -= 5;
  // Gym habit flag (set by events, e.g. "joined the gym") gives +2/yr
  if ((c.flags as Record<string, boolean>)["hasGymHabit"]) healthDelta += 2;

  c.stats.health = clamp(c.stats.health + healthDelta);

  // Happiness natural drift toward 50
  const happinessDrift = c.stats.happiness > 50 ? -1 : c.stats.happiness < 50 ? 1 : 0;
  c.stats.happiness = clamp(c.stats.happiness + happinessDrift);

  // Finances
  const netIncome = c.financials.salary - c.financials.annualExpenses;
  c.financials.bankBalance += netIncome;

  for (const asset of c.financials.assets) {
    const rate = asset.type === "house" ? 1.03 : 0.92;
    asset.value = Math.round(asset.value * rate);
    c.financials.bankBalance -= asset.annualCost;
  }

  if (c.financials.bankBalance < 0) c.flags.inDebt = true;

  // Career performance drift
  const drift = Math.floor(Math.random() * 7) - 3; // -3 to +3
  c.career.performance = clamp(c.career.performance + drift);

  // Job loss: track consecutive years below 20 performance
  if (c.career.performance < 20 && c.flags.isEmployed) {
    const lowPerfYears = ((c as unknown as Record<string, number>)["_lowPerfYears"] ?? 0) + 1;
    (c as unknown as Record<string, number>)["_lowPerfYears"] = lowPerfYears;
    if (lowPerfYears >= 2) {
      c.flags.isEmployed = false;
      c.career.currentJob = null;
      c.career.employer = null;
      c.financials.salary = 0;
      (c as unknown as Record<string, number>)["_lowPerfYears"] = 0;
      c.log.push({ age: c.age, text: "You were let go due to consistently poor performance." });
    }
  } else {
    (c as unknown as Record<string, number>)["_lowPerfYears"] = 0;
  }

  // Relationship closeness decay
  c.relationships = c.relationships
    .map(r => ({ ...r, closeness: clamp(r.closeness - 2) }))
    .filter(r => r.closeness >= 10);

  // Death check
  if (c.stats.health <= 0) {
    c.stats.health = 0;
    c.isAlive = false;
  }

  // Longevity check: base 85 modified by karma
  const longevity = 85 + Math.floor((c.hiddenStats.karma - 50) / 10);
  if (c.age >= longevity && c.isAlive) {
    c.isAlive = false;
  }

  c.updatedAt = new Date().toISOString();
  return c;
}
```

- [ ] **Step 4: Run tests — expect PASS**

```bash
npx vitest run src/engine/statEngine.test.ts
```

Expected: 14 tests, all PASS.

- [ ] **Step 5: Commit**

```bash
git add src/engine/statEngine.ts src/engine/statEngine.test.ts
git commit -m "feat: add stat engine with health decay, finance tick, and death check"
```

---

### Task 7: Tier Selector + Event Resolver

**Files:**
- Create: `src/engine/tierSelector.ts`
- Create: `src/engine/eventResolver.ts`
- Create: `src/engine/tierSelector.test.ts`
- Create: `src/engine/eventResolver.test.ts`

**Interfaces:**
- Consumes: `Character`, `EventTemplate` from `@/lib/schemas`; `getDb` from `@/lib/mongodb`
- Produces: `selectTier(char): "common"|"uncommon"|"rare"` and `resolveEvent(char, tier, db): Promise<EventTemplate | null>` — both used by `/api/age`

- [ ] **Step 1: Write failing tier selector tests**

```typescript
// src/engine/tierSelector.test.ts
import { describe, it, expect } from "vitest";
import { selectTier, weightedRandom } from "./tierSelector";
import type { Character } from "@/lib/schemas/character";

function makeChar(overrides: Partial<Character> = {}): Character {
  return {
    _id: "c1", userId: "u1", packId: "core_realistic",
    metadata: { firstName: "A", lastName: "B", birthCountry: "AU", birthCity: "Sydney", gender: "male", sexuality: "heterosexual" },
    age: 30, isAlive: true,
    stats: { happiness: 50, health: 70, smarts: 60, looks: 55 },
    hiddenStats: { karma: 50, fertility: 70, willpower: 60 },
    flags: { isEmployed: false, isMarried: false, hasChildren: false, inPrison: false, hasDrugHabit: false, isStudent: false, inDebt: false, isTerminallyIll: false },
    financials: { bankBalance: 10000, salary: 50000, annualExpenses: 30000, assets: [] },
    career: { education: "bachelor", currentJob: null, employer: null, yearsInRole: 0, performance: 50, salaryGrade: "none" },
    relationships: [], log: [], createdAt: "", updatedAt: "",
    ...overrides,
  };
}

describe("weightedRandom", () => {
  it("always returns a key from the weights map", () => {
    const weights = { common: 65, uncommon: 25, rare: 10 };
    for (let i = 0; i < 50; i++) {
      const result = weightedRandom(weights);
      expect(["common", "uncommon", "rare"]).toContain(result);
    }
  });
});

describe("selectTier", () => {
  it("returns a valid tier string", () => {
    const char = makeChar();
    const tier = selectTier(char);
    expect(["common", "uncommon", "rare"]).toContain(tier);
  });

  it("never returns rare for children under 12", () => {
    const char = makeChar({ age: 8 });
    // Run 100 times — with heavy common weight for young chars, rare should be near impossible
    let rareCount = 0;
    for (let i = 0; i < 100; i++) {
      if (selectTier(char) === "rare") rareCount++;
    }
    // Rare weight should be 0 for age < 12, so rareCount must be 0
    expect(rareCount).toBe(0);
  });
});
```

- [ ] **Step 2: Run — expect FAIL**

```bash
npx vitest run src/engine/tierSelector.test.ts
```

- [ ] **Step 3: Create `src/engine/tierSelector.ts`**

```typescript
import type { Character } from "@/lib/schemas/character";

type Tier = "common" | "uncommon" | "rare";

export function weightedRandom(weights: Record<string, number>): string {
  const total = Object.values(weights).reduce((a, b) => a + b, 0);
  let roll = Math.random() * total;
  for (const [key, weight] of Object.entries(weights)) {
    roll -= weight;
    if (roll <= 0) return key;
  }
  return Object.keys(weights)[0];
}

export function selectTier(char: Character): Tier {
  const w = { common: 65, uncommon: 25, rare: 10 };

  // Children under 12: very quiet lives
  if (char.age < 12) { w.rare = 0; w.uncommon -= 10; w.common += 10; }
  // Teens
  else if (char.age < 18) { w.uncommon -= 5; w.common += 5; }
  // Over 50: more extraordinary events
  else if (char.age > 50) { w.rare += 5; w.common -= 5; }

  // High wealth
  if (char.financials.bankBalance > 500_000) { w.rare += 5; w.uncommon += 5; w.common -= 10; }

  // Low happiness → more drama
  if (char.stats.happiness < 30) { w.uncommon += 10; w.common -= 10; }

  // Ensure weights don't go negative
  w.common   = Math.max(0, w.common);
  w.uncommon = Math.max(0, w.uncommon);
  w.rare     = Math.max(0, w.rare);

  return weightedRandom(w) as Tier;
}
```

- [ ] **Step 4: Write failing event resolver tests**

```typescript
// src/engine/eventResolver.test.ts
import { describe, it, expect, vi } from "vitest";
import { filterEventsByConditions } from "./eventResolver";
import type { EventTemplate } from "@/lib/schemas/event";
import type { Character } from "@/lib/schemas/character";

const employed30: Character = {
  _id: "c1", userId: "u1", packId: "core_realistic",
  metadata: { firstName: "A", lastName: "B", birthCountry: "AU", birthCity: "Sydney", gender: "male", sexuality: "heterosexual" },
  age: 30, isAlive: true,
  stats: { happiness: 50, health: 70, smarts: 60, looks: 55 },
  hiddenStats: { karma: 50, fertility: 70, willpower: 60 },
  flags: { isEmployed: true, isMarried: false, hasChildren: false, inPrison: false, hasDrugHabit: false, isStudent: false, inDebt: false, isTerminallyIll: false },
  financials: { bankBalance: 10000, salary: 50000, annualExpenses: 30000, assets: [] },
  career: { education: "bachelor", currentJob: "Dev", employer: "Corp", yearsInRole: 2, performance: 70, salaryGrade: "mid" },
  relationships: [], log: [], createdAt: "", updatedAt: "",
};

const baseEvent: EventTemplate = {
  _id: "evt_test", packId: "core_realistic", tier: "common",
  conditions: { ageMin: 18, ageMax: 65, requiredFlags: ["isEmployed"], blockedFlags: ["inPrison"], statThresholds: {} },
  eventText: "Test event.", choices: [
    { text: "Option A", effects: { happiness: 5 }, outcomeText: "Good." },
    { text: "Option B", effects: { happiness: -5 }, outcomeText: "Bad." },
  ],
};

describe("filterEventsByConditions", () => {
  it("includes events matching all conditions", () => {
    const result = filterEventsByConditions([baseEvent], employed30);
    expect(result).toHaveLength(1);
  });

  it("excludes events where age is out of range", () => {
    const youngChar = { ...employed30, age: 10 };
    const result = filterEventsByConditions([baseEvent], youngChar);
    expect(result).toHaveLength(0);
  });

  it("excludes events where required flag is not set", () => {
    const unemployed = { ...employed30, flags: { ...employed30.flags, isEmployed: false } };
    const result = filterEventsByConditions([baseEvent], unemployed);
    expect(result).toHaveLength(0);
  });

  it("excludes events where a blocked flag is set", () => {
    const inPrison = { ...employed30, flags: { ...employed30.flags, inPrison: true } };
    const result = filterEventsByConditions([baseEvent], inPrison);
    expect(result).toHaveLength(0);
  });

  it("respects statThresholds min", () => {
    const lowSmarts = { ...employed30, stats: { ...employed30.stats, smarts: 30 } };
    const smartsGatedEvent: EventTemplate = {
      ...baseEvent, _id: "evt_smarts",
      conditions: { ...baseEvent.conditions, statThresholds: { smarts: { min: 50 } } },
    };
    expect(filterEventsByConditions([smartsGatedEvent], lowSmarts)).toHaveLength(0);
    expect(filterEventsByConditions([smartsGatedEvent], employed30)).toHaveLength(1);
  });
});
```

- [ ] **Step 5: Run — expect FAIL**

```bash
npx vitest run src/engine/eventResolver.test.ts
```

- [ ] **Step 6: Create `src/engine/eventResolver.ts`**

```typescript
import type { Db } from "mongodb";
import type { Character } from "@/lib/schemas/character";
import type { EventTemplate } from "@/lib/schemas/event";

export function filterEventsByConditions(events: EventTemplate[], char: Character): EventTemplate[] {
  return events.filter(evt => {
    const c = evt.conditions;

    if (char.age < c.ageMin || char.age > c.ageMax) return false;

    for (const flag of c.requiredFlags) {
      if (!(char.flags as Record<string, boolean>)[flag]) return false;
    }
    for (const flag of c.blockedFlags) {
      if ((char.flags as Record<string, boolean>)[flag]) return false;
    }

    for (const [statKey, threshold] of Object.entries(c.statThresholds)) {
      const value = (char.stats as Record<string, number>)[statKey] ??
                    (char.career as Record<string, unknown>)[statKey] as number ?? 0;
      if (threshold.min !== undefined && value < threshold.min) return false;
      if (threshold.max !== undefined && value > threshold.max) return false;
    }

    return true;
  });
}

export async function resolveEvent(
  char: Character,
  tier: "common" | "uncommon" | "flag_override",
  db: Db
): Promise<EventTemplate | null> {
  const rawEvents = await db.collection<EventTemplate>("event_templates")
    .find({ packId: char.packId, tier })
    .toArray();

  const eligible = filterEventsByConditions(rawEvents, char);
  if (eligible.length === 0) return null;

  return eligible[Math.floor(Math.random() * eligible.length)];
}

export async function getFlagOverrideEvent(char: Character, db: Db): Promise<EventTemplate | null> {
  const activeFlags = Object.entries(char.flags)
    .filter(([, v]) => v)
    .map(([k]) => k);

  if (activeFlags.length === 0) return null;

  const rawEvents = await db.collection<EventTemplate>("event_templates")
    .find({ packId: char.packId, tier: "flag_override" })
    .toArray();

  const eligible = filterEventsByConditions(rawEvents, char);
  if (eligible.length === 0) return null;

  // Priority: pick one at random from eligible flag overrides
  return eligible[Math.floor(Math.random() * eligible.length)];
}
```

- [ ] **Step 7: Run both test files — expect PASS**

```bash
npx vitest run src/engine/tierSelector.test.ts src/engine/eventResolver.test.ts
```

Expected: all tests PASS.

- [ ] **Step 8: Commit**

```bash
git add src/engine/tierSelector.ts src/engine/tierSelector.test.ts src/engine/eventResolver.ts src/engine/eventResolver.test.ts
git commit -m "feat: add tier selector and event resolver with condition filtering"
```

---

### Task 8: AI Event Generator

**Files:**
- Create: `src/engine/aiEventGenerator.ts`
- Create: `src/engine/aiEventGenerator.test.ts`

**Interfaces:**
- Consumes: `Character`, `AiEventSchema`, `AiEvent` from `@/lib/schemas`; `GamePlugin` from `@/lib/schemas/plugin`
- Produces: `generateRareEvent(char, plugin): Promise<AiEvent | null>` — returns null on any failure; used by `/api/age`

- [ ] **Step 1: Write failing AI generator tests**

```typescript
// src/engine/aiEventGenerator.test.ts
import { describe, it, expect, vi, beforeEach } from "vitest";

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
  beforeEach(() => {
    vi.clearAllMocks();
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
  });

  it("returns null when response fails Zod validation", async () => {
    const badResponse = { eventText: "bad", choices: [] }; // fails min(2) choices
    (OpenAI as unknown as ReturnType<typeof vi.fn>).mockImplementation(() => ({
      chat: { completions: { create: vi.fn().mockResolvedValue({ choices: [{ message: { content: JSON.stringify(badResponse) } }] }) } },
    }));

    const result = await generateRareEvent(mockChar, coreRealistic);
    expect(result).toBeNull();
  });
});
```

- [ ] **Step 2: Run — expect FAIL**

```bash
npx vitest run src/engine/aiEventGenerator.test.ts
```

- [ ] **Step 3: Create `src/engine/aiEventGenerator.ts`**

```typescript
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

export async function generateRareEvent(char: Character, plugin: GamePlugin): Promise<AiEvent | null> {
  try {
    const ai = new OpenAI({
      apiKey:  process.env.NVIDIA_API_KEY,
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

    const raw = JSON.parse(completion.choices[0]?.message?.content ?? "{}");
    return AiEventSchema.parse(raw);
  } catch {
    return null;
  }
}
```

- [ ] **Step 4: Run tests — expect PASS**

```bash
npx vitest run src/engine/aiEventGenerator.test.ts
```

Expected: 3 tests, all PASS.

- [ ] **Step 5: Commit**

```bash
git add src/engine/aiEventGenerator.ts src/engine/aiEventGenerator.test.ts
git commit -m "feat: add NVIDIA NIM AI event generator with Zod validation and null fallback"
```

---

### Task 9: Core API Routes — `/api/age` + `/api/choice`

**Files:**
- Create: `src/app/api/age/route.ts`
- Create: `src/app/api/choice/route.ts`
- Create: `src/app/api/age/route.test.ts`

**Interfaces:**
- Consumes: `auth` from `@/lib/auth`; `getDb` from `@/lib/mongodb`; `tickStats`, `applyEffects` from `@/engine/statEngine`; `selectTier` from `@/engine/tierSelector`; `resolveEvent`, `getFlagOverrideEvent` from `@/engine/eventResolver`; `generateRareEvent` from `@/engine/aiEventGenerator`; `PLUGINS` from `@/plugins`
- Produces: `POST /api/age → { character: CharacterClient, event: EventTemplate | AiEvent }` and `POST /api/choice → { character: CharacterClient, outcomeText: string }`

- [ ] **Step 1: Write failing API route tests (includes Review Focus items 1, 2, 3)**

```typescript
// src/app/api/age/route.test.ts
import { describe, it, expect, vi, beforeEach } from "vitest";

// Mock auth — return a session for user_001 by default
vi.mock("@/lib/auth", () => ({
  auth: vi.fn().mockResolvedValue({ user: { id: "user_001" } }),
}));

// Mock mongodb
const mockFindOne    = vi.fn();
const mockUpdateOne  = vi.fn();
const mockFind       = vi.fn().mockReturnValue({ toArray: vi.fn().mockResolvedValue([]) });
vi.mock("@/lib/mongodb", () => ({
  getDb: vi.fn().mockResolvedValue({
    collection: vi.fn().mockReturnValue({
      findOne:   mockFindOne,
      updateOne: mockUpdateOne,
      find:      mockFind,
    }),
  }),
}));

// Mock engine functions to be deterministic
vi.mock("@/engine/statEngine",     () => ({ tickStats: (c: unknown) => c, applyEffects: (c: unknown) => c }));
vi.mock("@/engine/tierSelector",   () => ({ selectTier: () => "common" }));
vi.mock("@/engine/eventResolver",  () => ({ getFlagOverrideEvent: vi.fn().mockResolvedValue(null), resolveEvent: vi.fn().mockResolvedValue({ _id: "evt_1", eventText: "Something happened.", choices: [{ text: "OK", effects: {}, outcomeText: "Fine." }] }) }));
vi.mock("@/engine/aiEventGenerator", () => ({ generateRareEvent: vi.fn().mockResolvedValue(null) }));

import { POST } from "./route";
import { NextRequest } from "next/server";

function makeRequest(body: object) {
  return new NextRequest("http://localhost/api/age", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
}

const baseCharacter = {
  _id: "char_001", userId: "user_001", packId: "core_realistic",
  metadata: { firstName: "Sam", lastName: "Lee", birthCountry: "AU", birthCity: "Sydney", gender: "male", sexuality: "heterosexual" },
  age: 25, isAlive: true,
  stats: { happiness: 50, health: 80, smarts: 60, looks: 55 },
  hiddenStats: { karma: 50, fertility: 70, willpower: 60 },
  flags: { isEmployed: true, isMarried: false, hasChildren: false, inPrison: false, hasDrugHabit: false, isStudent: false, inDebt: false, isTerminallyIll: false },
  financials: { bankBalance: 10000, salary: 50000, annualExpenses: 30000, assets: [] },
  career: { education: "bachelor", currentJob: "Dev", employer: "Corp", yearsInRole: 2, performance: 65, salaryGrade: "mid" },
  relationships: [], log: [],
  createdAt: "2026-01-01", updatedAt: "2026-01-01",
};

const baseUser = { _id: "user_001", email: "x@x.com", unlockedDLCs: ["core_realistic"] };

describe("POST /api/age", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockFindOne.mockImplementation((query: Record<string, unknown>) => {
      if (query._id && query._id === "char_001") return Promise.resolve(baseCharacter);
      if (query._id && query._id === "user_001") return Promise.resolve(baseUser);
      if (query.email) return Promise.resolve(baseUser);
      return Promise.resolve(null);
    });
    mockUpdateOne.mockResolvedValue({ matchedCount: 1 });
  });

  it("returns 400 for missing characterId", async () => {
    const res = await POST(makeRequest({}));
    expect(res.status).toBe(400);
  });

  // Review Focus #2: cross-user character access
  it("returns 403 when character belongs to a different user", async () => {
    mockFindOne.mockImplementation((query: Record<string, unknown>) => {
      if (query._id === "char_001") return Promise.resolve({ ...baseCharacter, userId: "user_999" });
      if (query._id === "user_001") return Promise.resolve(baseUser);
      return Promise.resolve(null);
    });
    const res = await POST(makeRequest({ characterId: "char_001" }));
    expect(res.status).toBe(403);
  });

  it("returns 200 with character and event on success", async () => {
    const res = await POST(makeRequest({ characterId: "char_001" }));
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.event).toBeDefined();
    expect(body.character).toBeDefined();
  });

  // Review Focus #1: hiddenStats not in response
  it("does not include hiddenStats in the response", async () => {
    const res = await POST(makeRequest({ characterId: "char_001" }));
    const body = await res.json();
    expect(body.character.hiddenStats).toBeUndefined();
  });

  // Review Focus #3: full fallback chain
  it("still returns an event when AI fails and event pool is empty on first try", async () => {
    const { resolveEvent } = await import("@/engine/eventResolver");
    const { generateRareEvent } = await import("@/engine/aiEventGenerator");
    const { selectTier } = await import("@/engine/tierSelector");

    vi.mocked(selectTier).mockReturnValue("rare");
    vi.mocked(generateRareEvent).mockResolvedValue(null);
    // First call (rare pool) returns null, second call (uncommon) returns null, third call (common) returns an event
    vi.mocked(resolveEvent)
      .mockResolvedValueOnce(null)
      .mockResolvedValueOnce(null)
      .mockResolvedValue({ _id: "evt_fallback", eventText: "Fallback event.", choices: [{ text: "OK", effects: {}, outcomeText: "Fine." }, { text: "No", effects: {}, outcomeText: "Also fine." }], packId: "core_realistic", tier: "common", conditions: { ageMin: 0, ageMax: 120, requiredFlags: [], blockedFlags: [], statThresholds: {} } });

    const res = await POST(makeRequest({ characterId: "char_001" }));
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.event).toBeDefined();
  });
});
```

- [ ] **Step 2: Run — expect FAIL**

```bash
npx vitest run src/app/api/age/route.test.ts
```

- [ ] **Step 3: Create `src/app/api/age/route.ts`**

```typescript
import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { getDb } from "@/lib/mongodb";
import { tickStats } from "@/engine/statEngine";
import { selectTier } from "@/engine/tierSelector";
import { resolveEvent, getFlagOverrideEvent } from "@/engine/eventResolver";
import { generateRareEvent } from "@/engine/aiEventGenerator";
import { PLUGINS } from "@/plugins";
import { AgeRequestSchema } from "@/lib/schemas/api";
import type { Character, CharacterClient } from "@/lib/schemas/character";
import type { EventTemplate } from "@/lib/schemas/event";

function stripHiddenStats(char: Character): CharacterClient {
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  const { hiddenStats, ...client } = char;
  return client;
}

export async function POST(req: NextRequest) {
  const session = await auth();
  if (!session?.user?.id) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const body = await req.json();
  const parsed = AgeRequestSchema.safeParse(body);
  if (!parsed.success) return NextResponse.json({ error: "Invalid request" }, { status: 400 });

  const { characterId } = parsed.data;
  const db = await getDb();

  const [character, user] = await Promise.all([
    db.collection<Character>("characters").findOne({ _id: characterId }),
    db.collection("users").findOne({ _id: session.user.id }),
  ]);

  if (!character) return NextResponse.json({ error: "Character not found" }, { status: 404 });
  if (character.userId !== session.user.id) return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  if (!character.isAlive) return NextResponse.json({ error: "Character is dead" }, { status: 400 });
  if (!user?.unlockedDLCs?.includes(character.packId)) return NextResponse.json({ error: "DLC not unlocked" }, { status: 403 });

  const plugin = PLUGINS[character.packId] ?? PLUGINS["core_realistic"];

  // 1. Tick stats
  let updated = tickStats(character);
  if (plugin.applyStatTick) {
    const extra = plugin.applyStatTick(updated);
    Object.assign(updated.stats, extra);
  }

  // 2. Check for flag override event first
  const flagEvent = await getFlagOverrideEvent(updated, db);
  let event: EventTemplate | { eventText: string; choices: unknown[] } | null = flagEvent;

  // 3. If no flag override, run tier selector
  if (!event) {
    const tier = selectTier(updated);

    if (tier === "rare") {
      event = await generateRareEvent(updated, plugin);
      // Fallback: try uncommon, then common
      if (!event) event = await resolveEvent(updated, "uncommon", db);
      if (!event) event = await resolveEvent(updated, "common", db);
    } else {
      event = await resolveEvent(updated, tier, db);
      if (!event) event = await resolveEvent(updated, "common", db);
    }
  }

  // 4. Save updated character
  await db.collection("characters").updateOne(
    { _id: characterId },
    { $set: { ...updated, updatedAt: new Date().toISOString() } }
  );

  return NextResponse.json({ character: stripHiddenStats(updated), event });
}
```

- [ ] **Step 4: Create `src/app/api/choice/route.ts`**

```typescript
import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { getDb } from "@/lib/mongodb";
import { applyEffects } from "@/engine/statEngine";
import { AiEventSchema } from "@/lib/schemas/event";
import { ChoiceRequestSchema } from "@/lib/schemas/api";
import type { Character } from "@/lib/schemas/character";
import type { EventTemplate, AiEvent, Effects } from "@/lib/schemas/event";

function stripHiddenStats(char: Character) {
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  const { hiddenStats, ...client } = char;
  return client;
}

export async function POST(req: NextRequest) {
  const session = await auth();
  if (!session?.user?.id) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const body = await req.json();
  const parsed = ChoiceRequestSchema.safeParse(body);
  if (!parsed.success) return NextResponse.json({ error: "Invalid request" }, { status: 400 });

  const { characterId, eventId, choiceIndex, eventPayload } = parsed.data;
  const db = await getDb();

  const character = await db.collection<Character>("characters").findOne({ _id: characterId });
  if (!character) return NextResponse.json({ error: "Character not found" }, { status: 404 });
  if (character.userId !== session.user.id) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  // Get the event (static from DB or AI from payload)
  let event: EventTemplate | AiEvent | null = null;
  if (eventId === "ai" && eventPayload) {
    const aiParsed = AiEventSchema.safeParse(eventPayload);
    if (aiParsed.success) event = aiParsed.data;
  } else {
    event = await db.collection<EventTemplate>("event_templates").findOne({ _id: eventId });
  }

  if (!event) return NextResponse.json({ error: "Event not found" }, { status: 404 });

  const choice = event.choices[choiceIndex];
  if (!choice) return NextResponse.json({ error: "Invalid choice index" }, { status: 400 });

  // Apply effects
  let updated = applyEffects(character, (choice.effects ?? {}) as Effects);

  // Handle probabilistic outcomes
  let outcomeText = (choice as { outcomeText?: string }).outcomeText ?? "";
  const prob = (choice as { probabilistic?: { chance: number; success: Effects & { outcomeText: string }; failure: Effects & { outcomeText: string } } }).probabilistic;
  if (prob) {
    if (Math.random() < prob.chance) {
      updated = applyEffects(updated, prob.success);
      outcomeText = prob.success.outcomeText;
    } else {
      updated = applyEffects(updated, prob.failure);
      outcomeText = prob.failure.outcomeText;
    }
  }

  // Append to log
  updated.log.push({ age: updated.age, text: outcomeText });
  if (updated.log.length > 500) {
    // Archive overflow — in production, move to character_logs collection
    updated.log = updated.log.slice(-500);
  }

  await db.collection("characters").updateOne(
    { _id: characterId },
    { $set: { ...updated, updatedAt: new Date().toISOString() } }
  );

  return NextResponse.json({ character: stripHiddenStats(updated), outcomeText });
}
```

- [ ] **Step 5: Run tests — expect PASS**

```bash
npx vitest run src/app/api/age/route.test.ts
```

Expected: 5 tests, all PASS.

- [ ] **Step 6: Commit**

```bash
git add src/app/api/age/ src/app/api/choice/
git commit -m "feat: add /api/age turn processor and /api/choice resolver with auth and DLC gates"
```

---

### Task 10: Supporting API Routes — Characters + DLC

**Files:**
- Create: `src/app/api/characters/route.ts`
- Create: `src/app/api/user/dlc/route.ts`

**Interfaces:**
- Consumes: `auth`, `getDb`, `CreateCharacterSchema`, `DlcUpdateSchema`
- Produces: `POST /api/characters` (create character, returns `CharacterClient`); `GET /api/characters` (list user's characters); `POST /api/user/dlc` (update unlockedDLCs)

- [ ] **Step 1: Create `src/app/api/characters/route.ts`**

```typescript
import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { getDb } from "@/lib/mongodb";
import { CreateCharacterSchema } from "@/lib/schemas/api";
import type { Character } from "@/lib/schemas/character";
import { randomUUID } from "crypto";

function makeDefaultCharacter(userId: string, data: ReturnType<typeof CreateCharacterSchema.parse>): Character {
  const now = new Date().toISOString();
  return {
    _id:      randomUUID(),
    userId,
    packId:   data.packId,
    metadata: {
      firstName:    data.firstName,
      lastName:     data.lastName,
      birthCountry: data.birthCountry,
      birthCity:    data.birthCity,
      gender:       data.gender,
      sexuality:    data.sexuality,
    },
    age:      0,
    isAlive:  true,
    stats: {
      happiness: Math.floor(Math.random() * 31) + 50,  // 50-80
      health:    Math.floor(Math.random() * 31) + 60,  // 60-90
      smarts:    Math.floor(Math.random() * 71) + 10,  // 10-80
      looks:     Math.floor(Math.random() * 71) + 10,  // 10-80
    },
    hiddenStats: {
      karma:     Math.floor(Math.random() * 101),
      fertility: Math.floor(Math.random() * 41) + 50,
      willpower: Math.floor(Math.random() * 101),
    },
    flags: {
      isEmployed: false, isMarried: false, hasChildren: false,
      inPrison: false, hasDrugHabit: false, isStudent: true,
      inDebt: false, isTerminallyIll: false,
    },
    financials: { bankBalance: 0, salary: 0, annualExpenses: 0, assets: [] },
    career:     { education: "none", currentJob: null, employer: null, yearsInRole: 0, performance: 50, salaryGrade: "none" },
    relationships: [
      { npcId: randomUUID(), name: `${data.firstName}'s Mother`, relation: "mother", closeness: Math.floor(Math.random() * 41) + 50 },
      { npcId: randomUUID(), name: `${data.firstName}'s Father`, relation: "father", closeness: Math.floor(Math.random() * 41) + 40 },
    ],
    log: [{ age: 0, text: `You were born in ${data.birthCity}, ${data.birthCountry}.` }],
    createdAt: now,
    updatedAt: now,
  };
}

export async function POST(req: NextRequest) {
  const session = await auth();
  if (!session?.user?.id) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const body = await req.json();
  const parsed = CreateCharacterSchema.safeParse(body);
  if (!parsed.success) return NextResponse.json({ error: "Invalid input" }, { status: 400 });

  const db   = await getDb();
  const user = await db.collection("users").findOne({ _id: session.user.id });
  if (!user?.unlockedDLCs?.includes(parsed.data.packId)) {
    return NextResponse.json({ error: "DLC not unlocked" }, { status: 403 });
  }

  const character = makeDefaultCharacter(session.user.id, parsed.data);
  await db.collection("characters").insertOne(character);

  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  const { hiddenStats, ...client } = character;
  return NextResponse.json({ character: client }, { status: 201 });
}

export async function GET() {
  const session = await auth();
  if (!session?.user?.id) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const db         = await getDb();
  const characters = await db.collection<Character>("characters")
    .find({ userId: session.user.id }, { projection: { hiddenStats: 0 } })
    .toArray();

  return NextResponse.json({ characters });
}
```

- [ ] **Step 2: Create `src/app/api/user/dlc/route.ts`**

```typescript
import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { getDb } from "@/lib/mongodb";
import { DlcUpdateSchema } from "@/lib/schemas/api";
import { PLUGINS } from "@/plugins";

export async function POST(req: NextRequest) {
  const session = await auth();
  if (!session?.user?.id) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const body = await req.json();
  const parsed = DlcUpdateSchema.safeParse(body);
  if (!parsed.success) return NextResponse.json({ error: "Invalid input" }, { status: 400 });

  // Validate all requested DLC IDs are registered plugins
  const knownIds = Object.keys(PLUGINS);
  const invalid  = parsed.data.unlockedDLCs.filter(id => !knownIds.includes(id));
  if (invalid.length > 0) {
    return NextResponse.json({ error: `Unknown DLC IDs: ${invalid.join(", ")}` }, { status: 400 });
  }

  // core_realistic is always included
  const toSave = Array.from(new Set(["core_realistic", ...parsed.data.unlockedDLCs]));

  const db = await getDb();
  await db.collection("users").updateOne(
    { _id: session.user.id },
    { $set: { unlockedDLCs: toSave } }
  );

  return NextResponse.json({ unlockedDLCs: toSave });
}
```

- [ ] **Step 3: Add MongoDB indexes for characters collection**

Add this to `scripts/seed-events.ts` after the event index:

```typescript
// In seed-events.ts, add after the event_templates index:
await db.collection("characters").createIndex({ userId: 1, isAlive: 1 });
await db.collection("users").createIndex({ email: 1 }, { unique: true });
console.log("Character and user indexes created");
```

- [ ] **Step 4: Commit**

```bash
git add src/app/api/characters/ src/app/api/user/ scripts/seed-events.ts
git commit -m "feat: add character creation/list API and DLC unlock API"
```

---

### Task 11: Zustand Game Store

**Files:**
- Create: `src/store/gameStore.ts`
- Create: `src/store/gameStore.test.ts`

**Interfaces:**
- Produces: `useGameStore` hook — consumed by `GameDashboard`, `AgeButton`, `EventModal`, all tab components

- [ ] **Step 1: Write failing store tests**

```typescript
// src/store/gameStore.test.ts
import { describe, it, expect, beforeEach } from "vitest";
import { act, renderHook } from "@testing-library/react";
import { useGameStore } from "./gameStore";

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
    const fakeChar = { _id: "c1", age: 25 } as unknown as ReturnType<typeof useGameStore>["character"];
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
    const fakeEvent = { eventText: "Something happened.", choices: [] } as unknown as ReturnType<typeof useGameStore>["pendingEvent"];
    act(() => result.current.setPendingEvent(fakeEvent));
    expect(result.current.pendingEvent).not.toBeNull();
    act(() => result.current.setPendingEvent(null));
    expect(result.current.pendingEvent).toBeNull();
  });
});
```

- [ ] **Step 2: Run — expect FAIL**

```bash
npx vitest run src/store/gameStore.test.ts
```

- [ ] **Step 3: Create `src/store/gameStore.ts`**

```typescript
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
```

- [ ] **Step 4: Run tests — expect PASS**

```bash
npx vitest run src/store/gameStore.test.ts
```

Expected: 4 tests, all PASS.

- [ ] **Step 5: Commit**

```bash
git add src/store/
git commit -m "feat: add Zustand game store for character state and pending events"
```

---

### Task 12: Core UI Components

**Files:**
- Create: `src/components/StatBars.tsx`
- Create: `src/components/DynamicStatRenderer.tsx`
- Create: `src/components/LifeLog.tsx`
- Create: `src/components/AgeButton.tsx`
- Create: `src/components/EventModal.tsx`
- Create: `src/components/StatBars.test.tsx`

**Interfaces:**
- Consumes: `CharacterClient` from `@/lib/schemas/character`; `EventTemplate | AiEvent` from `@/lib/schemas/event`; `useGameStore`
- Produces: React components consumed by `GameDashboard`

- [ ] **Step 1: Write failing component tests**

```typescript
// src/components/StatBars.test.tsx
import { describe, it, expect } from "vitest";
import { render, screen } from "@testing-library/react";
import { StatBars } from "./StatBars";

const stats = { happiness: 72, health: 85, smarts: 61, looks: 55 };

describe("StatBars", () => {
  it("renders all four stat labels", () => {
    render(<StatBars stats={stats} prevStats={null} />);
    expect(screen.getByText(/Happiness/i)).toBeInTheDocument();
    expect(screen.getByText(/Health/i)).toBeInTheDocument();
    expect(screen.getByText(/Smarts/i)).toBeInTheDocument();
    expect(screen.getByText(/Looks/i)).toBeInTheDocument();
  });

  it("renders stat values", () => {
    render(<StatBars stats={stats} prevStats={null} />);
    expect(screen.getByText("72")).toBeInTheDocument();
    expect(screen.getByText("85")).toBeInTheDocument();
  });

  it("shows green delta indicator for stat gains", () => {
    const prev = { happiness: 60, health: 85, smarts: 61, looks: 55 };
    render(<StatBars stats={stats} prevStats={prev} />);
    expect(screen.getByText("+12")).toBeInTheDocument();
  });

  it("shows red delta indicator for stat losses", () => {
    const prev = { happiness: 80, health: 85, smarts: 61, looks: 55 };
    render(<StatBars stats={stats} prevStats={prev} />);
    expect(screen.getByText("-8")).toBeInTheDocument();
  });
});
```

- [ ] **Step 2: Run — expect FAIL**

```bash
npx vitest run src/components/StatBars.test.tsx
```

- [ ] **Step 3: Create `src/components/StatBars.tsx`**

```tsx
"use client";

interface StatBlock { happiness: number; health: number; smarts: number; looks: number; }

const STAT_CONFIG = [
  { key: "happiness" as const, label: "Happiness", icon: "😊", color: "bg-yellow-400" },
  { key: "health"    as const, label: "Health",    icon: "❤️",  color: "bg-red-400"    },
  { key: "smarts"    as const, label: "Smarts",    icon: "🧠", color: "bg-blue-400"   },
  { key: "looks"     as const, label: "Looks",     icon: "✨", color: "bg-pink-400"   },
];

interface Props {
  stats:     StatBlock;
  prevStats: StatBlock | null;
  extra?: { key: string; label: string; icon: string; value: number }[];
}

export function StatBars({ stats, prevStats, extra = [] }: Props) {
  const allStats = [
    ...STAT_CONFIG.map(s => ({
      ...s,
      value: stats[s.key],
      delta: prevStats ? stats[s.key] - prevStats[s.key] : 0,
    })),
    ...extra.map(e => ({ key: e.key, label: e.label, icon: e.icon, color: "bg-purple-400", value: e.value, delta: 0 })),
  ];

  return (
    <div className="space-y-2 px-4 py-3">
      {allStats.map(stat => (
        <div key={stat.key} className="flex items-center gap-2">
          <span className="text-base w-6 text-center">{stat.icon}</span>
          <span className="text-xs text-gray-400 w-20">{stat.label}</span>
          <div className="flex-1 bg-gray-700 rounded-full h-3 overflow-hidden">
            <div
              className={`${stat.color} h-3 rounded-full transition-all duration-[600ms]`}
              style={{ width: `${stat.value}%` }}
            />
          </div>
          <span className="text-white text-xs w-6 text-right">{stat.value}</span>
          {stat.delta !== 0 && (
            <span className={`text-xs w-8 text-right font-medium ${stat.delta > 0 ? "text-green-400" : "text-red-400"}`}>
              {stat.delta > 0 ? `+${stat.delta}` : `${stat.delta}`}
            </span>
          )}
        </div>
      ))}
    </div>
  );
}
```

- [ ] **Step 4: Create `src/components/DynamicStatRenderer.tsx`**

```tsx
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
```

- [ ] **Step 5: Create `src/components/LifeLog.tsx`**

```tsx
"use client";
import { useEffect, useRef } from "react";
import type { LogEntry } from "@/lib/schemas/character";

const CATEGORY_EMOJI: Record<string, string> = {
  work: "💼", health: "🏥", relationship: "❤️", money: "💰", crime: "⚠️", default: "📖",
};

function categorise(text: string): string {
  if (/job|work|boss|salary|promot|fired|career/i.test(text)) return "work";
  if (/hospital|sick|doctor|health|injury|died/i.test(text))  return "health";
  if (/married|partner|friend|family|mother|father/i.test(text)) return "relationship";
  if (/money|\$|bank|debt|inherit|salary/i.test(text))           return "money";
  if (/prison|arrested|crime|stole|assault/i.test(text))         return "crime";
  return "default";
}

interface Props { log: LogEntry[] }

export function LifeLog({ log }: Props) {
  const bottomRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [log.length]);

  const grouped: Record<number, LogEntry[]> = {};
  for (const entry of log) {
    if (!grouped[entry.age]) grouped[entry.age] = [];
    grouped[entry.age].push(entry);
  }

  return (
    <div className="flex-1 overflow-y-auto px-4 py-2 space-y-3">
      {Object.entries(grouped).map(([age, entries]) => (
        <div key={age} className="space-y-1">
          <p className="text-xs text-gray-500 font-semibold">─── Age {age} ───</p>
          {entries.map((entry, i) => (
            <p key={i} className="text-sm text-gray-200 animate-fade-in">
              {CATEGORY_EMOJI[categorise(entry.text)]} {entry.text}
            </p>
          ))}
        </div>
      ))}
      <div ref={bottomRef} />
    </div>
  );
}
```

- [ ] **Step 6: Create `src/components/AgeButton.tsx`**

```tsx
"use client";

interface Props {
  onClick:   () => void;
  disabled:  boolean;
  isLoading: boolean;
}

export function AgeButton({ onClick, disabled, isLoading }: Props) {
  return (
    <div className="px-4 pb-4 pt-2">
      <button
        onClick={onClick}
        disabled={disabled || isLoading}
        className="w-full py-4 bg-blue-600 hover:bg-blue-500 disabled:bg-gray-700 disabled:cursor-not-allowed text-white font-bold text-lg rounded-2xl transition-colors min-h-[56px] active:scale-95"
      >
        {isLoading ? (
          <span className="flex items-center justify-center gap-2">
            <svg className="animate-spin h-5 w-5" viewBox="0 0 24 24" fill="none">
              <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"/>
              <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8H4z"/>
            </svg>
            Ageing...
          </span>
        ) : "AGE UP"}
      </button>
    </div>
  );
}
```

- [ ] **Step 7: Create `src/components/EventModal.tsx`**

```tsx
"use client";
import type { EventTemplate, AiEvent } from "@/lib/schemas/event";

interface Props {
  event:     EventTemplate | AiEvent | null;
  onChoice:  (index: number) => void;
  isLoading: boolean;
}

export function EventModal({ event, onChoice, isLoading }: Props) {
  if (!event) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-end bg-black/60">
      <div className="w-full max-w-lg mx-auto bg-gray-900 rounded-t-2xl px-4 pt-4 pb-8 space-y-4 animate-slide-up">
        <div className="w-10 h-1 bg-gray-600 rounded-full mx-auto" />
        <p className="text-white text-base leading-relaxed">{event.eventText}</p>
        <div className="space-y-2">
          {event.choices.map((choice, i) => (
            <button
              key={i}
              onClick={() => onChoice(i)}
              disabled={isLoading}
              className="w-full py-3 px-4 bg-gray-800 hover:bg-gray-700 disabled:opacity-50 text-white text-sm rounded-xl text-left transition-colors min-h-[44px] active:scale-95"
            >
              {choice.text}
            </button>
          ))}
        </div>
      </div>
    </div>
  );
}
```

- [ ] **Step 8: Run component tests — expect PASS**

```bash
npx vitest run src/components/StatBars.test.tsx
```

Expected: 4 tests, all PASS.

- [ ] **Step 9: Commit**

```bash
git add src/components/
git commit -m "feat: add StatBars, LifeLog, AgeButton, EventModal, and DynamicStatRenderer components"
```

---

### Task 13: Game Dashboard Page

**Files:**
- Create: `src/components/GameDashboard.tsx`
- Create: `src/app/game/[characterId]/page.tsx`

**Interfaces:**
- Consumes: all components from Task 12; `useGameStore`; `/api/age` and `/api/choice` endpoints
- Produces: the main game screen at `/game/[characterId]`

- [ ] **Step 1: Create `src/components/GameDashboard.tsx`**

```tsx
"use client";
import { useEffect, useRef, useState } from "react";
import { useGameStore } from "@/store/gameStore";
import { DynamicStatRenderer } from "./DynamicStatRenderer";
import { LifeLog }             from "./LifeLog";
import { AgeButton }           from "./AgeButton";
import { EventModal }          from "./EventModal";
import type { CharacterClient } from "@/lib/schemas/character";
import type { EventTemplate, AiEvent } from "@/lib/schemas/event";

interface Props { initialCharacter: CharacterClient }

const COUNTRY_FLAGS: Record<string, string> = {
  Australia: "🇦🇺", "United States": "🇺🇸", "United Kingdom": "🇬🇧",
  Canada: "🇨🇦", India: "🇮🇳", Germany: "🇩🇪",
};

export function GameDashboard({ initialCharacter }: Props) {
  const { character, pendingEvent, isAgeing, setCharacter, setPendingEvent, setIsAgeing } = useGameStore();
  const [prevStats, setPrevStats] = useState<CharacterClient["stats"] | null>(null);
  const [isResolvingChoice, setIsResolvingChoice] = useState(false);
  const [activeTab, setActiveTab] = useState<"life" | "career" | "relations" | "assets">("life");

  const char = character ?? initialCharacter;
  const flag  = COUNTRY_FLAGS[char.metadata.birthCountry] ?? "🌍";

  useEffect(() => {
    if (!character) setCharacter(initialCharacter);
  }, [initialCharacter, character, setCharacter]);

  async function handleAge() {
    setIsAgeing(true);
    setPrevStats(char.stats);
    try {
      const res = await fetch("/api/age", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ characterId: char._id }),
      });
      if (!res.ok) throw new Error("Age failed");
      const data = await res.json();
      setCharacter(data.character);
      setPendingEvent(data.event);
    } catch (e) {
      console.error(e);
    } finally {
      setIsAgeing(false);
    }
  }

  async function handleChoice(choiceIndex: number) {
    if (!pendingEvent) return;
    setIsResolvingChoice(true);
    const isAi = !("_id" in pendingEvent);
    try {
      const res = await fetch("/api/choice", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          characterId:  char._id,
          eventId:      isAi ? "ai" : (pendingEvent as EventTemplate)._id,
          choiceIndex,
          ...(isAi ? { eventPayload: pendingEvent } : {}),
        }),
      });
      if (!res.ok) throw new Error("Choice failed");
      const data = await res.json();
      setCharacter(data.character);
    } finally {
      setPendingEvent(null);
      setIsResolvingChoice(false);
    }
  }

  if (!char.isAlive) {
    return (
      <div className="min-h-screen bg-gray-950 flex items-center justify-center p-6">
        <div className="text-center space-y-4">
          <p className="text-4xl">🪦</p>
          <h1 className="text-2xl font-bold text-white">{char.metadata.firstName} {char.metadata.lastName}</h1>
          <p className="text-gray-400">Lived to age {char.age}</p>
          <a href="/new-life" className="inline-block mt-4 px-6 py-3 bg-blue-600 text-white rounded-xl font-semibold">Start a New Life</a>
        </div>
      </div>
    );
  }

  const TABS = [
    { id: "life",      label: "Life",      icon: "🎂" },
    { id: "career",    label: "Career",    icon: "💼" },
    { id: "relations", label: "Relations", icon: "👥" },
    { id: "assets",    label: "Assets",    icon: "🏠" },
  ] as const;

  return (
    <div className="min-h-screen bg-gray-950 flex flex-col max-w-lg mx-auto">
      {/* Header */}
      <div className="px-4 pt-4 pb-2 flex items-center justify-between">
        <div>
          <h1 className="text-lg font-bold text-white">{char.metadata.firstName} {char.metadata.lastName}</h1>
          <p className="text-sm text-gray-400">Age {char.age} · {char.metadata.birthCity} {flag}</p>
        </div>
        <p className="text-sm text-gray-400">💰 ${char.financials.bankBalance.toLocaleString()}</p>
      </div>

      {/* Stats */}
      <DynamicStatRenderer character={char} prevStats={prevStats} />

      {/* Career strip */}
      <div className="px-4 py-2 flex gap-3 text-xs text-gray-400">
        <span>💼 {char.career.currentJob ?? "Unemployed"}</span>
        <span>📚 {char.career.education}</span>
      </div>

      {/* Tab bar */}
      <div className="flex border-b border-gray-800">
        {TABS.map(tab => (
          <button
            key={tab.id}
            onClick={() => setActiveTab(tab.id)}
            className={`flex-1 py-2 text-xs font-medium transition-colors min-h-[44px] ${activeTab === tab.id ? "text-blue-400 border-b-2 border-blue-400" : "text-gray-500"}`}
          >
            {tab.icon} {tab.label}
          </button>
        ))}
      </div>

      {/* Tab content */}
      <div className="flex-1 overflow-hidden flex flex-col">
        {activeTab === "life" && <LifeLog log={char.log} />}
        {activeTab === "career" && (
          <div className="p-4 text-sm text-gray-300 space-y-2">
            <p>Job: {char.career.currentJob ?? "None"}</p>
            <p>Employer: {char.career.employer ?? "—"}</p>
            <p>Education: {char.career.education}</p>
            <p>Performance: {char.career.performance}/100</p>
            <p>Salary: ${char.financials.salary.toLocaleString()}/yr</p>
          </div>
        )}
        {activeTab === "relations" && (
          <div className="p-4 space-y-2">
            {char.relationships.length === 0 && <p className="text-gray-500 text-sm">No close relationships.</p>}
            {char.relationships.map(r => (
              <div key={r.npcId} className="flex justify-between text-sm">
                <span className="text-gray-300">{r.name} <span className="text-gray-500">({r.relation})</span></span>
                <span className="text-gray-400">{r.closeness}/100</span>
              </div>
            ))}
          </div>
        )}
        {activeTab === "assets" && (
          <div className="p-4 space-y-2">
            {char.financials.assets.length === 0 && <p className="text-gray-500 text-sm">No assets.</p>}
            {char.financials.assets.map((a, i) => (
              <div key={i} className="flex justify-between text-sm">
                <span className="text-gray-300">{a.name}</span>
                <span className="text-gray-400">${a.value.toLocaleString()}</span>
              </div>
            ))}
          </div>
        )}
      </div>

      <AgeButton onClick={handleAge} disabled={!!pendingEvent} isLoading={isAgeing} />

      <EventModal event={pendingEvent} onChoice={handleChoice} isLoading={isResolvingChoice} />

      {/* Bottom nav */}
      <nav className="border-t border-gray-800 safe-bottom">
        <div className="flex">
          {TABS.map(tab => (
            <button
              key={tab.id}
              onClick={() => setActiveTab(tab.id)}
              className={`flex-1 py-3 text-xs min-h-[44px] ${activeTab === tab.id ? "text-blue-400" : "text-gray-600"}`}
            >
              {tab.icon}
            </button>
          ))}
        </div>
      </nav>
    </div>
  );
}
```

- [ ] **Step 2: Create `src/app/game/[characterId]/page.tsx`**

```tsx
import { auth } from "@/lib/auth";
import { getDb } from "@/lib/mongodb";
import { redirect } from "next/navigation";
import { GameDashboard } from "@/components/GameDashboard";
import type { Character } from "@/lib/schemas/character";

interface Props { params: Promise<{ characterId: string }> }

export default async function GamePage({ params }: Props) {
  const session = await auth();
  if (!session?.user?.id) redirect("/login");

  const { characterId } = await params;
  const db = await getDb();

  const character = await db.collection<Character>("characters")
    .findOne({ _id: characterId, userId: session.user.id }, { projection: { hiddenStats: 0 } });

  if (!character) redirect("/");

  return <GameDashboard initialCharacter={character} />;
}
```

- [ ] **Step 3: Commit**

```bash
git add src/components/GameDashboard.tsx src/app/game/
git commit -m "feat: add game dashboard page with stat display, life log, and age button"
```

---

### Task 14: Character Creation Page

**Files:**
- Create: `src/app/new-life/page.tsx`
- Create: `src/app/page.tsx` (home — character list)

**Interfaces:**
- Consumes: `/api/characters` (POST to create, GET to list); `auth` for session redirect
- Produces: `/new-life` creation form; `/` home page with character list

- [ ] **Step 1: Create `src/app/page.tsx`**

```tsx
import { auth } from "@/lib/auth";
import { getDb } from "@/lib/mongodb";
import { redirect } from "next/navigation";
import Link from "next/link";
import type { Character } from "@/lib/schemas/character";

export default async function HomePage() {
  const session = await auth();
  if (!session?.user?.id) redirect("/login");

  const db         = await getDb();
  const characters = await db.collection<Character>("characters")
    .find({ userId: session.user.id }, { projection: { hiddenStats: 0 } })
    .toArray();

  return (
    <main className="min-h-screen bg-gray-950 p-6 max-w-lg mx-auto">
      <h1 className="text-2xl font-bold text-white mb-6">Your Lives</h1>

      <div className="space-y-3">
        {characters.map(c => (
          <Link
            key={c._id}
            href={`/game/${c._id}`}
            className="block bg-gray-900 rounded-xl p-4 border border-gray-800 hover:border-gray-600 transition-colors"
          >
            <div className="flex justify-between items-start">
              <div>
                <p className="text-white font-semibold">{c.metadata.firstName} {c.metadata.lastName}</p>
                <p className="text-gray-400 text-sm">Age {c.age} · {c.metadata.birthCity}</p>
              </div>
              <span className={`text-xs px-2 py-1 rounded-full ${c.isAlive ? "bg-green-900 text-green-300" : "bg-gray-800 text-gray-500"}`}>
                {c.isAlive ? "Alive" : "Deceased"}
              </span>
            </div>
          </Link>
        ))}
      </div>

      <div className="mt-6 space-y-3">
        <Link href="/new-life" className="block w-full py-3 bg-blue-600 hover:bg-blue-500 text-white text-center rounded-xl font-semibold min-h-[44px]">
          + Start a New Life
        </Link>
        <Link href="/store" className="block w-full py-3 bg-gray-800 hover:bg-gray-700 text-gray-300 text-center rounded-xl text-sm min-h-[44px]">
          DLC Packs
        </Link>
      </div>
    </main>
  );
}
```

- [ ] **Step 2: Create `src/app/new-life/page.tsx`**

```tsx
"use client";
import { useState } from "react";
import { useRouter } from "next/navigation";
import { PLUGINS } from "@/plugins";

const COUNTRIES = ["Australia", "United States", "United Kingdom", "Canada", "India", "Germany", "Japan", "Brazil", "South Africa", "New Zealand"];

export default function NewLifePage() {
  const router = useRouter();
  const [form, setForm] = useState({
    firstName: "", lastName: "", birthCountry: "Australia", birthCity: "",
    gender: "male", sexuality: "heterosexual", packId: "core_realistic",
  });
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  function update(field: string, value: string) {
    setForm(f => ({ ...f, [field]: value }));
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    setError("");
    try {
      const res = await fetch("/api/characters", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(form),
      });
      if (!res.ok) { const d = await res.json(); setError(d.error ?? "Failed"); return; }
      const data = await res.json();
      router.push(`/game/${data.character._id}`);
    } finally {
      setLoading(false);
    }
  }

  const inputCls = "w-full p-3 rounded-lg bg-gray-800 text-white border border-gray-700 focus:outline-none focus:border-blue-500 min-h-[44px] text-sm";

  return (
    <main className="min-h-screen bg-gray-950 p-6 max-w-lg mx-auto">
      <h1 className="text-2xl font-bold text-white mb-6">New Life</h1>
      <form onSubmit={handleSubmit} className="space-y-4">
        {error && <p className="text-red-400 text-sm">{error}</p>}

        <div className="grid grid-cols-2 gap-3">
          <input className={inputCls} placeholder="First Name" value={form.firstName} onChange={e => update("firstName", e.target.value)} required />
          <input className={inputCls} placeholder="Last Name"  value={form.lastName}  onChange={e => update("lastName",  e.target.value)} required />
        </div>

        <select className={inputCls} value={form.birthCountry} onChange={e => update("birthCountry", e.target.value)}>
          {COUNTRIES.map(c => <option key={c}>{c}</option>)}
        </select>

        <input className={inputCls} placeholder="Birth City" value={form.birthCity} onChange={e => update("birthCity", e.target.value)} required />

        <select className={inputCls} value={form.gender} onChange={e => update("gender", e.target.value)}>
          <option value="male">Male</option>
          <option value="female">Female</option>
          <option value="non-binary">Non-binary</option>
        </select>

        <select className={inputCls} value={form.sexuality} onChange={e => update("sexuality", e.target.value)}>
          <option value="heterosexual">Heterosexual</option>
          <option value="homosexual">Homosexual</option>
          <option value="bisexual">Bisexual</option>
        </select>

        <div>
          <p className="text-gray-400 text-sm mb-2">World Setting</p>
          {Object.values(PLUGINS).map(p => (
            <label key={p.id} className="flex items-center gap-3 p-3 bg-gray-800 rounded-lg mb-2 cursor-pointer">
              <input type="radio" name="packId" value={p.id} checked={form.packId === p.id} onChange={() => update("packId", p.id)} className="min-w-[20px] min-h-[20px]" />
              <span className="text-white text-sm">{p.label}</span>
            </label>
          ))}
        </div>

        <button type="submit" disabled={loading} className="w-full py-4 bg-green-600 hover:bg-green-500 disabled:bg-gray-700 text-white font-bold rounded-2xl min-h-[56px]">
          {loading ? "Creating..." : "Begin Life"}
        </button>
      </form>
    </main>
  );
}
```

- [ ] **Step 3: Commit**

```bash
git add src/app/page.tsx src/app/new-life/
git commit -m "feat: add character creation and home/character list pages"
```

---

### Task 15: DLC Store Page + Final Polish

**Files:**
- Create: `src/components/tabs/CareerTab.tsx`
- Create: `src/components/tabs/RelationsTab.tsx`
- Create: `src/components/tabs/AssetsTab.tsx`
- Create: `src/app/store/page.tsx`
- Modify: `src/app/layout.tsx` (add global dark background)
- Create: `src/app/globals.css` (add slide-up and fade-in animations)

**Interfaces:**
- Consumes: `/api/user/dlc` (POST); `PLUGINS` registry; `auth`
- Produces: `/store` DLC checklist page; polished global layout

- [ ] **Step 1: Create `src/components/tabs/CareerTab.tsx`**

```tsx
import type { CharacterClient } from "@/lib/schemas/character";

export function CareerTab({ character }: { character: CharacterClient }) {
  const { career, financials } = character;
  return (
    <div className="p-4 text-sm text-gray-300 space-y-3">
      <div className="flex justify-between"><span className="text-gray-500">Job</span><span>{career.currentJob ?? "Unemployed"}</span></div>
      <div className="flex justify-between"><span className="text-gray-500">Employer</span><span>{career.employer ?? "—"}</span></div>
      <div className="flex justify-between"><span className="text-gray-500">Education</span><span>{career.education}</span></div>
      <div className="flex justify-between"><span className="text-gray-500">Performance</span><span>{career.performance}/100</span></div>
      <div className="flex justify-between"><span className="text-gray-500">Salary</span><span>${financials.salary.toLocaleString()}/yr</span></div>
      <div className="flex justify-between"><span className="text-gray-500">Years in role</span><span>{career.yearsInRole}</span></div>
    </div>
  );
}
```

- [ ] **Step 2: Create `src/components/tabs/RelationsTab.tsx`**

```tsx
import type { CharacterClient } from "@/lib/schemas/character";

export function RelationsTab({ character }: { character: CharacterClient }) {
  if (character.relationships.length === 0) {
    return <p className="p-4 text-gray-500 text-sm">No close relationships.</p>;
  }
  return (
    <div className="p-4 space-y-3">
      {character.relationships.map(r => (
        <div key={r.npcId} className="flex justify-between items-center">
          <div>
            <p className="text-white text-sm">{r.name}</p>
            <p className="text-gray-500 text-xs capitalize">{r.relation}</p>
          </div>
          <div className="flex items-center gap-2">
            <div className="w-20 bg-gray-700 rounded-full h-2">
              <div className="bg-pink-400 h-2 rounded-full" style={{ width: `${r.closeness}%` }} />
            </div>
            <span className="text-gray-400 text-xs w-6 text-right">{r.closeness}</span>
          </div>
        </div>
      ))}
    </div>
  );
}
```

- [ ] **Step 3: Create `src/components/tabs/AssetsTab.tsx`**

```tsx
import type { CharacterClient } from "@/lib/schemas/character";

const ASSET_ICONS: Record<string, string> = { car: "🚗", house: "🏠", investment: "📈" };

export function AssetsTab({ character }: { character: CharacterClient }) {
  const { financials } = character;
  if (financials.assets.length === 0) {
    return <p className="p-4 text-gray-500 text-sm">No assets owned.</p>;
  }
  return (
    <div className="p-4 space-y-3">
      <div className="flex justify-between text-sm mb-4">
        <span className="text-gray-500">Bank balance</span>
        <span className="text-white font-semibold">${financials.bankBalance.toLocaleString()}</span>
      </div>
      {financials.assets.map((a, i) => (
        <div key={i} className="flex justify-between items-center">
          <div className="flex items-center gap-2">
            <span>{ASSET_ICONS[a.type] ?? "📦"}</span>
            <div>
              <p className="text-white text-sm">{a.name}</p>
              <p className="text-gray-500 text-xs">Cost: ${a.annualCost.toLocaleString()}/yr</p>
            </div>
          </div>
          <span className="text-gray-300 text-sm">${a.value.toLocaleString()}</span>
        </div>
      ))}
    </div>
  );
}
```

- [ ] **Step 4: Update `src/components/GameDashboard.tsx` — replace inlined tab content with imported components**

In `GameDashboard.tsx`, replace the imports section and the tab content section:

```tsx
// Add to imports at top of GameDashboard.tsx:
import { CareerTab }    from "./tabs/CareerTab";
import { RelationsTab } from "./tabs/RelationsTab";
import { AssetsTab }    from "./tabs/AssetsTab";
```

Replace the tab content block:

```tsx
        {/* Tab content */}
        <div className="flex-1 overflow-hidden flex flex-col">
          {activeTab === "life"      && <LifeLog log={char.log} />}
          {activeTab === "career"    && <CareerTab    character={char} />}
          {activeTab === "relations" && <RelationsTab character={char} />}
          {activeTab === "assets"    && <AssetsTab    character={char} />}
        </div>
```

- [ ] **Step 5: Create `src/app/store/page.tsx`**

```tsx
"use client";
import { useEffect, useState } from "react";
import { PLUGINS } from "@/plugins";
import Link from "next/link";

export default function StorePage() {
  const [owned,   setOwned]   = useState<string[]>([]);
  const [checked, setChecked] = useState<string[]>([]);
  const [saving,  setSaving]  = useState(false);
  const [saved,   setSaved]   = useState(false);

  useEffect(() => {
    fetch("/api/user/dlc-status")
      .then(r => r.json())
      .then(d => { setOwned(d.unlockedDLCs ?? []); setChecked(d.unlockedDLCs ?? []); })
      .catch(() => {});
  }, []);

  function toggle(id: string) {
    if (id === "core_realistic") return; // always locked on
    setChecked(prev => prev.includes(id) ? prev.filter(x => x !== id) : [...prev, id]);
    setSaved(false);
  }

  async function handleSave() {
    setSaving(true);
    try {
      await fetch("/api/user/dlc", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ unlockedDLCs: checked }),
      });
      setOwned(checked);
      setSaved(true);
    } finally {
      setSaving(false);
    }
  }

  return (
    <main className="min-h-screen bg-gray-950 p-6 max-w-lg mx-auto">
      <div className="flex items-center gap-3 mb-6">
        <Link href="/" className="text-gray-400 text-sm">← Back</Link>
        <h1 className="text-2xl font-bold text-white">DLC Packs</h1>
      </div>

      <div className="space-y-3">
        {Object.values(PLUGINS).map(plugin => {
          const isChecked = checked.includes(plugin.id);
          const isCore    = plugin.id === "core_realistic";
          return (
            <label key={plugin.id} className={`flex items-center gap-4 p-4 rounded-xl border cursor-pointer transition-colors ${isChecked ? "bg-blue-950 border-blue-700" : "bg-gray-900 border-gray-800"}`}>
              <input
                type="checkbox"
                checked={isChecked}
                onChange={() => toggle(plugin.id)}
                disabled={isCore}
                className="w-5 h-5 accent-blue-500"
              />
              <div>
                <p className="text-white font-medium">{plugin.label}</p>
                {isCore && <p className="text-xs text-gray-500">Always included</p>}
              </div>
            </label>
          );
        })}
      </div>

      <button
        onClick={handleSave}
        disabled={saving}
        className="mt-6 w-full py-3 bg-blue-600 hover:bg-blue-500 disabled:bg-gray-700 text-white font-semibold rounded-xl min-h-[44px]"
      >
        {saving ? "Saving..." : saved ? "Saved ✓" : "Save"}
      </button>
    </main>
  );
}
```

- [ ] **Step 6: Add DLC status GET endpoint**

Add to `src/app/api/user/dlc/route.ts`:

```typescript
export async function GET() {
  const session = await auth();
  if (!session?.user?.id) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const db   = await getDb();
  const user = await db.collection("users").findOne({ _id: session.user.id });
  return NextResponse.json({ unlockedDLCs: user?.unlockedDLCs ?? ["core_realistic"] });
}
```

- [ ] **Step 7: Update `src/app/globals.css` — add animations**

Add to the end of the existing globals.css:

```css
@keyframes slide-up {
  from { transform: translateY(100%); }
  to   { transform: translateY(0); }
}
@keyframes fade-in {
  from { opacity: 0; transform: translateY(4px); }
  to   { opacity: 1; transform: translateY(0); }
}
.animate-slide-up { animation: slide-up 0.25s ease-out; }
.animate-fade-in  { animation: fade-in  0.3s ease-out; }
.safe-bottom      { padding-bottom: env(safe-area-inset-bottom, 0px); }
```

- [ ] **Step 8: Update `src/app/layout.tsx` — dark global background**

```tsx
import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title:       "Life Simulator",
  description: "A text-based life simulator",
  viewport:    "width=device-width, initial-scale=1, viewport-fit=cover",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" className="bg-gray-950">
      <body className="bg-gray-950 text-white antialiased">
        {children}
      </body>
    </html>
  );
}
```

- [ ] **Step 9: Run full test suite**

```bash
npx vitest run
```

Expected: all tests PASS. Fix any failures before proceeding.

- [ ] **Step 10: Run the dev server and smoke-test the golden path**

```bash
npm run dev
```

Manually verify:
1. Visit `http://localhost:3000` → redirects to `/login`
2. Register a new account
3. Create a new character (realistic setting)
4. Press Age Up → event appears in modal
5. Choose an option → log updates, stats animate
6. Press Age Up again → repeats
7. Visit `/store` → DLC checklist shows, save works

- [ ] **Step 11: Final commit**

```bash
git add src/components/tabs/ src/app/store/ src/app/globals.css src/app/layout.tsx src/app/api/user/dlc/route.ts
git commit -m "feat: add tab components, DLC store page, and final layout polish"
```
