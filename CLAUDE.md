# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project status

This repo is currently **docs-only**. It contains an approved design spec and a task-by-task implementation plan for a BitLife-style text life simulator; no application code exists yet. Read these before doing anything:

- Spec: `docs/superpowers/specs/2026-10-13-life-simulator-design.md`
- Plan: `docs/superpowers/plans/2026-10-14-life-simulator.md` (15 tasks, checkbox steps, TDD; it says to execute with `superpowers:subagent-driven-development` or `superpowers:executing-plans`)

The parent directory's `AGENTS.md` describes unrelated TensorFlow diffusion/GAN projects and does not apply here.

**Plan caveats when executing Task 1:** the plan says `cd D:/AI_FileSys/dev_engine` and `git init`. This repo (`D:\AIML projects\lifeSim`, branch `lifeSimDEV`) is already a git repo, so scaffold in place and skip `git init`. `create-next-app` into a non-empty directory may refuse because `docs/` and this file exist; scaffold into a temp dir and move the files in if that happens.

## Stack (planned)

Next.js 15 (App Router, `src/` dir, `@/*` alias), TypeScript strict, Tailwind, Zustand, Zod, native `mongodb` driver (MongoDB Atlas), NextAuth v5 (credentials + bcrypt, JWT session), OpenAI SDK pointed at NVIDIA NIM (`https://integrate.api.nvidia.com/v1`, model from `AI_MODEL`, default `z-ai/glm-5.3-flash`). Tests use Vitest + Testing Library on jsdom. Deploy target is Vercel; a Capacitor mobile wrapper comes later.

Env vars live in `.env.local` (never committed): `MONGODB_URI`, `NEXTAUTH_SECRET`, `NEXTAUTH_URL`, `NVIDIA_API_KEY`, `AI_MODEL`. `.env.local.example` is the template.

## Commands (once scaffolded)

```bash
npm run dev                          # Next.js dev server
npx vitest run                       # all tests once (npm run test:run)
npx vitest run src/engine/statEngine.test.ts   # single test file
npx vitest run -t "name of test"     # single test by name
npx tsx scripts/seed-events.ts       # load data/events/*.json into event_templates
```

Test files sit next to their source (`*.test.ts`/`*.test.tsx`), except schemas, which use `src/lib/schemas/__tests__/`.

## Architecture

**Server-authoritative turn loop.** The client never predicts stats. One "Age Up" press runs `POST /api/age`, which goes through these steps in order: auth (session owns the character) → load character → DLC ownership check (`user.unlockedDLCs` includes `character.packId`, else 403) → `statEngine` tick → flag-override check (can exit early) → `tierSelector` → `eventResolver` (static template or AI) → death check → save → return `{ character, event }`. The player's choice then goes to a separate `POST /api/choice`, which applies deterministic `effects` plus an optional `probabilistic` success or failure roll and appends to the log.

**Event tiers.** The base weights are common 65, uncommon 25, rare 10, adjusted by age, wealth and happiness (see spec §5). Common and uncommon events are static templates in the `event_templates` collection, seeded from `data/events/*.json`. `flag_override` events are checked first and bypass tier selection. Rare events call the LLM (`engine/aiEventGenerator.ts`), and the output is validated with the Zod `AiEventSchema`. AI events are never stored. **The fallback chain must never block a turn:** if AI fails or Zod rejects the output, serve a random uncommon event; if none match, serve a random common one.

**Character document.** Each playthrough is one self-contained document in the `characters` collection. `stats` (happiness/health/smarts/looks) are integers clamped to 0–100 after every operation. `hiddenStats` (karma/fertility/willpower) must **never** reach the client; strip them with a server-side projection on every response. `log` is capped at 500 entries, and older entries move to `character_logs`.

**Plugin/DLC system.** `src/plugins/index.ts` maps `packId` to a `GamePlugin` (contract in `src/lib/schemas/plugin.ts`: `extraStats`, `careerTracks`, `seedEvents`, optional `applyStatTick`, `buildAiBiasInstruction`). The engine looks the plugin up with `PLUGINS[character.packId] ?? PLUGINS["core_realistic"]` and filters `event_templates` by `packId`. Adding a DLC should need no engine changes: add the plugin file, seed JSON under `data/events/<pack_id>_*.json`, register it, and list it on `/store`. `core_realistic` is always in a new user's `unlockedDLCs`. `fantasy_pack` is a registered but inactive stub in v1. DLC unlock is a free checkbox with no payment.

**Frontend.** `GameDashboard` owns a Zustand store (`src/store/gameStore.ts`) with `character`, `pendingEvent` and `isAgeing`. `EventModal` (bottom sheet) blocks `AgeButton` until a choice is resolved. `DynamicStatRenderer` adds extra stat bars for non-core packs. The design is mobile-first: 390px baseline, tap targets ≥ 44px, no horizontal scroll, and animations use Tailwind transitions only.

## Invariants the plan requires tests for

- The `/api/age` response has no `hiddenStats` key, even if Mongo returns one.
- `/api/age` on another user's character returns 403.
- When the NVIDIA call throws **and** the event pool is empty, `/api/age` still returns a valid event.
- `applyEffects({ health: 100 }, { health: 20 })` gives `health: 100`.
- `tickStats` on `health: 1` at age 76+ gives `isAlive: false`.
- Auth is required on every `/api/*` route except `/api/auth/*`.
