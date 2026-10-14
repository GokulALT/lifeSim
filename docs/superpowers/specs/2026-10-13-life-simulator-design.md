# Life Simulator — Design Spec

**Date:** 2026-10-13  
**Author:** chandra_vikram@yahoo.com  
**Status:** Approved

---

## 1. Project Overview

A text-based life simulator in the style of BitLife. Players control a single character from birth to death, making choices each year that affect stats, relationships, career, and finances. The game is turn-based: one tap of the "Age Up" button advances one year and triggers a life event.

**Launch scope:** Realistic setting only. Fantasy world is designed as a future DLC from day one but excluded from v1.

**Tech stack:**
- Frontend: Next.js (App Router), Tailwind CSS, Zustand
- Backend: Next.js API routes (Vercel deployment)
- Database: MongoDB Atlas
- AI: NVIDIA NIM API (`z-ai/glm-5.3-flash`) via OpenAI-compatible SDK — key stored in `NVIDIA_API_KEY` env var
- Auth: NextAuth (credentials provider, JWT session)
- Mobile (later): Capacitor wrapper around the existing Next.js PWA

---

## 2. Architecture Overview

Three runtime layers:

```
[Browser / PWA]
    │  Tailwind + React (Next.js App Router)
    │  Zustand for optimistic local state
    ▼
[Next.js Server — Vercel Edge/Node]
    │  App Router API routes (/api/*)
    │  Plugin router (DLC injection)
    │  Zod validation on all inputs/outputs
    ▼
[Data + AI Layer]
    ├── MongoDB Atlas (character state, event templates, users)
    └── LLM API (OpenAI / Groq) — called only for Rare tier events (~10% of turns)
```

**Request flow per Age press:**
1. Client sends `POST /api/age` with `{ characterId, activePackId }`
2. Server loads character from MongoDB
3. Stat engine applies time-based changes (age++, finances, health decay)
4. Plugin router injects the correct event pool based on `packId`
5. Tier selector resolves which event tier fires (Common / Uncommon / Rare)
6. Rare → LLM call with structured prompt; Common/Uncommon → static template lookup
7. Character state saved back to MongoDB, response returned to client
8. Client updates Zustand store, appends to life log

---

## 3. Folder Structure

```
/
├── src/
│   ├── app/
│   │   ├── (auth)/                  # Login / register pages
│   │   ├── game/
│   │   │   └── [characterId]/
│   │   │       └── page.tsx         # Main game dashboard
│   │   ├── new-life/
│   │   │   └── page.tsx             # Character creation
│   │   ├── store/
│   │   │   └── page.tsx             # DLC unlock page (checklist)
│   │   └── api/
│   │       ├── age/route.ts         # Core turn processor
│   │       ├── choice/route.ts      # Resolves player choice after event
│   │       ├── characters/route.ts  # Create / list characters
│   │       ├── user/dlc/route.ts    # Save DLC unlock selections
│   │       └── auth/[...]/route.ts  # NextAuth handlers
│   │
│   ├── engine/
│   │   ├── statEngine.ts            # Age/health/finance tick logic
│   │   ├── tierSelector.ts          # Picks Common/Uncommon/Rare per turn
│   │   ├── eventResolver.ts         # Resolves a chosen tier to an event
│   │   └── aiEventGenerator.ts      # LLM call + Zod parse for Rare events
│   │
│   ├── plugins/
│   │   ├── index.ts                 # Plugin registry
│   │   ├── core_realistic.ts        # Base event pool, job lists, life flags
│   │   └── fantasy_pack.ts          # Future DLC (stub at launch)
│   │
│   ├── lib/
│   │   ├── mongodb.ts               # Connection singleton
│   │   ├── auth.ts                  # NextAuth config
│   │   └── schemas/                 # Zod schemas for DB docs + AI output
│   │
│   └── components/
│       ├── GameDashboard.tsx
│       ├── StatBars.tsx
│       ├── LifeLog.tsx
│       ├── EventModal.tsx           # Choice popup (bottom sheet)
│       ├── AgeButton.tsx
│       ├── DynamicStatRenderer.tsx  # Renders extra DLC stat bars
│       └── tabs/
│           ├── CareerTab.tsx
│           ├── RelationsTab.tsx
│           └── AssetsTab.tsx
│
├── data/
│   └── events/
│       ├── common.json              # Static common event templates
│       ├── uncommon.json            # Static uncommon event templates
│       └── flags.json               # Flag-triggered override events
│
└── docs/
    └── superpowers/specs/           # This file
```

---

## 4. MongoDB Data Models

### Collection: `users`

```json
{
  "_id": "user_abc123",
  "email": "player@example.com",
  "passwordHash": "<bcrypt>",
  "createdAt": "2026-10-13T00:00:00Z",
  "unlockedDLCs": ["core_realistic"],
  "activeCharacterId": "char_xyz789"
}
```

`core_realistic` is always present in `unlockedDLCs` on account creation.

---

### Collection: `characters`

One document per playthrough. Fully self-contained.

```json
{
  "_id": "char_xyz789",
  "userId": "user_abc123",
  "packId": "core_realistic",
  "metadata": {
    "firstName": "Marcus",
    "lastName": "Chen",
    "birthCountry": "Australia",
    "birthCity": "Sydney",
    "gender": "male",
    "sexuality": "heterosexual"
  },
  "age": 24,
  "isAlive": true,
  "stats": {
    "happiness": 72,
    "health": 85,
    "smarts": 61,
    "looks": 55
  },
  "hiddenStats": {
    "karma": 40,
    "fertility": 80,
    "willpower": 65
  },
  "flags": {
    "isEmployed": true,
    "isMarried": false,
    "hasChildren": false,
    "inPrison": false,
    "hasDrugHabit": false,
    "isStudent": false,
    "inDebt": false,
    "isTerminallyIll": false
  },
  "financials": {
    "bankBalance": 18400,
    "salary": 52000,
    "annualExpenses": 28000,
    "assets": [
      { "type": "car", "name": "2019 Honda Civic", "value": 14000, "annualCost": 2400 }
    ]
  },
  "career": {
    "education": "bachelor",
    "currentJob": "Software Developer",
    "employer": "TechCorp Pty Ltd",
    "yearsInRole": 2,
    "performance": 68,
    "salaryGrade": "mid"
  },
  "relationships": [
    { "npcId": "npc_001", "name": "Helen Chen", "relation": "mother", "closeness": 74 },
    { "npcId": "npc_002", "name": "David Chen", "relation": "father", "closeness": 55 }
  ],
  "log": [
    { "age": 0,  "text": "You were born in Sydney, Australia." },
    { "age": 22, "text": "You graduated with a Bachelor of Computer Science." }
  ],
  "createdAt": "2026-10-13T00:00:00Z",
  "updatedAt": "2026-10-13T00:00:00Z"
}
```

**Notes:**
- `stats` are integers 0–100, clamped after every operation
- `hiddenStats` are never sent to the client
- `log` is capped at 500 entries; older entries archive to `character_logs` collection
- `hiddenStats` must be stripped from all API responses before sending to client (server-side projection)
- MongoDB index on `{ userId, isAlive }` for character list queries

---

### Collection: `event_templates`

Seeded from `data/events/*.json` at startup. AI events are ephemeral and never stored.

```json
{
  "_id": "evt_officeconf_01",
  "packId": "core_realistic",
  "tier": "common",
  "conditions": {
    "ageMin": 18,
    "ageMax": 65,
    "requiredFlags": ["isEmployed"],
    "blockedFlags": ["inPrison"],
    "statThresholds": {}
  },
  "eventText": "A coworker takes credit for your idea in a team meeting.",
  "choices": [
    {
      "text": "Confront them publicly.",
      "effects": { "happiness": -5, "karma": 5 },
      "probabilistic": {
        "chance": 0.35,
        "success": { "smarts": 3, "outcomeText": "Your manager noticed." },
        "failure": { "happiness": -10, "outcomeText": "It came across as petty." }
      }
    },
    {
      "text": "Let it go.",
      "effects": { "happiness": -8 },
      "outcomeText": "You kept the peace, but it stings."
    },
    {
      "text": "Talk to your manager privately.",
      "effects": { "happiness": 5, "careerPerformance": 3 },
      "outcomeText": "Your manager appreciated the professionalism."
    }
  ]
}
```

**Tiers:** `"common"` | `"uncommon"` | `"flag_override"`  
**Index:** `{ packId, tier, "conditions.ageMin": 1, "conditions.ageMax": 1 }`

---

## 5. Game Loop

### Turn Processor (`/api/age/route.ts`)

```
POST /api/age  { characterId }
  │
  ├─ 1. Auth check (session owns this character)
  ├─ 2. Load character from MongoDB
  ├─ 3. DLC ownership check (user.unlockedDLCs includes character.packId)
  ├─ 4. Stat engine tick
  ├─ 5. Flag-override check (early exit if triggered)
  ├─ 6. Tier selector
  ├─ 7. Event resolver (static or AI)
  ├─ 8. Death check (health ≤ 0 or longevity exceeded)
  ├─ 9. Save updated character
  └─ 10. Return { character, event }
```

### Stat Engine (`engine/statEngine.ts`)

Applied every turn before event selection:

- `age++`
- **Health decay:** −1/yr after 40, −2/yr after 60, −3/yr after 75. Drug habit flag: −5/yr. Gym habit flag: +2/yr.
- **Finances:** `bankBalance += salary − annualExpenses`. Each asset: `value *= depreciationRate; bankBalance -= annualCost`. Default `depreciationRate` = 0.92 (8%/yr for vehicles; 1.03 for property). `inDebt` flag set if `bankBalance < 0` for 2+ consecutive years.
- **Career performance:** ±3 random drift per year. If `< 20` for 2+ years → job loss flag triggered.
- **Relationships:** Each NPC `closeness −= 2/yr` unless interacted with this turn. `closeness < 10` → NPC becomes estranged.
- **Death:** `health ≤ 0` triggers death. Base longevity = 85, modified by lifetime health average and karma.

All stats clamped to 0–100 after every operation.

### Flag-Override Check

Before tier selection, active flags are scanned. `flag_override` events fire immediately if conditions match, bypassing the tier selector. Multiple active flags are priority-weighted; only one fires per turn.

### Tier Selector (`engine/tierSelector.ts`)

Base weights: `{ common: 65, uncommon: 25, rare: 10 }`

Modifiers:
- Age < 18: common +10, uncommon −10
- Age > 50: rare +5, common −5
- `bankBalance > 500,000`: rare +5, uncommon +5, common −10
- `happiness < 30`: uncommon +10, common −10

### Choice Resolution (`/api/choice/route.ts`)

Separate endpoint called after the player selects a choice from the event modal:
1. Apply deterministic `effects` to character
2. If `probabilistic`: roll RNG, apply success or failure branch
3. Append outcome text to `character.log`
4. Save + return updated character

---

## 6. AI Integration

### When AI Fires

Only on `tier === "rare"` (~10% of turns). Entirely server-side.

### Stat-Weighted Event Bias

| Character State | AI Event Bias |
|---|---|
| Age 15–25, smarts > 70 | Academic breakthroughs, scholarships |
| Age 25–45, high wealth | Business opportunities, fraud |
| Age 25–45, low happiness | Affairs, career crisis, family breakdown |
| Age 50+, low health | Medical emergencies, legacy decisions |
| Karma < 30 | Crime exposure, scams, betrayal |
| Karma > 70 | Lucky windfalls, recognition |

### Zod Output Schema

```typescript
const AiEventSchema = z.object({
  eventText: z.string().min(20).max(300),
  choices: z.array(z.object({
    text: z.string().min(5).max(100),
    effects: z.object({
      happiness:   z.number().int().min(-30).max(30).optional(),
      health:      z.number().int().min(-30).max(30).optional(),
      smarts:      z.number().int().min(-15).max(15).optional(),
      looks:       z.number().int().min(-15).max(15).optional(),
      bankBalance: z.number().int().optional(),
      karma:       z.number().int().min(-20).max(20).optional(),
    }),
    outcomeText: z.string().min(10).max(200),
  })).min(2).max(4),
});
```

### Fallback Chain

```
Rare tier selected
  ├─ AI call + Zod validates → serve AI event
  ├─ AI fails / Zod rejects  → serve random Uncommon static event
  └─ No uncommon matches     → serve random Common static event
```

No turn is ever blocked.

### Provider

```typescript
import OpenAI from "openai";

const ai = new OpenAI({
  apiKey: process.env.NVIDIA_API_KEY,
  baseURL: "https://integrate.api.nvidia.com/v1",
});

// Inside generateRareEvent:
const completion = await ai.chat.completions.create({
  model: "z-ai/glm-5.3-flash",
  messages: [{ role: "system", content: systemPrompt }, { role: "user", content: userPrompt }],
  temperature: 0.85,
  max_tokens: 600,
  stream: false,
});
```

- Uses the standard OpenAI SDK pointed at NVIDIA NIM's OpenAI-compatible endpoint
- API key stored in `.env.local` as `NVIDIA_API_KEY` — never committed to git
- Model is `z-ai/glm-5.3-flash`; swappable via `AI_MODEL` env var without code changes
- One AI call per turn per user enforced server-side via `character.updatedAt` timestamp check

---

## 7. Frontend UI Architecture

### Layout (mobile-first, 390×844px baseline)

```
┌─────────────────────────────┐
│  Marcus Chen  · Age 24  🇦🇺  │
├─────────────────────────────┤
│  😊 Happiness  ████████░░ 72│
│  ❤️  Health    █████████░ 85│
│  🧠 Smarts     ██████░░░░ 61│
│  ✨ Looks      █████░░░░░ 55│
├─────────────────────────────┤
│  💼 Software Dev  📚 Bachelor│
│  💰 $18,400       📍 Sydney  │
├─────────────────────────────┤
│  [scrollable life log]      │
├─────────────────────────────┤
│        [ AGE UP ]           │
└─────────────────────────────┘
  [ 🎂 Life ][ 💼 Career ][ 👥 Relations ][ 🏠 Assets ]
```

### Key Components

- **`GameDashboard.tsx`** — page shell, owns Zustand store, triggers `/api/age`
- **`StatBars.tsx`** — renders 4 visible stat bars with colour-coded change animations
- **`DynamicStatRenderer.tsx`** — wraps StatBars, injects extra DLC stats when `packId !== "core_realistic"`
- **`LifeLog.tsx`** — append-only scrolling log, emoji-prefixed by event category, auto-scrolls on update
- **`EventModal.tsx`** — bottom sheet modal, shows event text + choice buttons, blocks Age button until resolved
- **`AgeButton.tsx`** — primary CTA, loading spinner during API call, disabled while modal is open

### State Management

Zustand store with three fields: `character`, `pendingEvent`, `isAgeing`. Server is authoritative — no client-side stat prediction.

### Animations

Stat bar changes animate over 600ms (CSS transition). Green flash for gains, red for losses. All via Tailwind `transition-all duration-300` — no external animation library.

### Auth

NextAuth credentials provider (email + bcrypt password). JWT cookie session. `/game/[characterId]` is protected.

---

## 8. DLC / Plugin Architecture

### Plugin Contract

```typescript
// StatDefinition and CareerTrack TypeScript interfaces defined in src/lib/schemas/plugin.ts
interface GamePlugin {
  id: string;
  label: string;
  extraStats: StatDefinition[];      // { key: string; label: string; icon: string }[]
  careerTracks: CareerTrack[];       // { title: string; minSmarts: number; salaryGrade: string }[]
  seedEvents: { common: string; uncommon: string; flags: string; };
  applyStatTick?: (character: Character) => Partial<Character["stats"]>;
  buildAiBiasInstruction: (character: Character) => string;
}
```

Event seed files are loaded into `event_templates` at app startup via a `scripts/seed-events.ts` script (run once per deploy or when seed files change).

### Plugin Router

Called inside `/api/age` after loading character:

```typescript
const plugin = PLUGINS[character.packId] ?? PLUGINS["core_realistic"];
if (plugin.applyStatTick) { /* apply extra stat changes */ }
const eventPool = await db.collection("event_templates").find({ packId: character.packId, tier }).toArray();
const biasInstruction = plugin.buildAiBiasInstruction(character);
```

### DLC Ownership Gate

```typescript
if (!user.unlockedDLCs.includes(character.packId)) {
  return NextResponse.json({ error: "DLC not unlocked" }, { status: 403 });
}
```

### DLC Unlock Page (`/app/store/page.tsx`)

Lists all registered plugins as a checklist. Checkboxes reflect `user.unlockedDLCs`. Save button posts to `POST /api/user/dlc` which writes the updated array to MongoDB. No payment gateway at launch — free to unlock.

### Adding a New DLC (Zero Engine Changes)

1. Create `plugins/<pack_id>.ts` implementing `GamePlugin`
2. Seed event JSON files under `data/events/<pack_id>_*.json`
3. Register in `plugins/index.ts`
4. Add to DLC unlock page label list
5. Deploy — done.

---

## 9. Success Criteria for v1

- Player can create a character, age from birth to death, and receive a varied life story
- No turn ever fails to produce an event (fallback chain always resolves)
- AI fires on ~10% of turns; average turn response time < 800ms (static) / < 3s (AI)
- DLC unlock page works; fantasy pack stub is registered but inactive
- Auth works; multiple playthroughs per account are supported
- UI is usable on a 390px viewport with no horizontal scroll
