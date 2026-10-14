"use client";
import { useEffect, useState } from "react";
import { useGameStore } from "@/store/gameStore";
import { DynamicStatRenderer } from "./DynamicStatRenderer";
import { LifeLog }             from "./LifeLog";
import { AgeButton }           from "./AgeButton";
import { EventModal }          from "./EventModal";
import { CareerTab }           from "./tabs/CareerTab";
import { RelationsTab }        from "./tabs/RelationsTab";
import { AssetsTab }           from "./tabs/AssetsTab";
import type { CharacterClient } from "@/lib/schemas/character";

interface Props { initialCharacter: CharacterClient }

const COUNTRY_FLAGS: Record<string, string> = {
  Australia: "🇦🇺", "United States": "🇺🇸", "United Kingdom": "🇬🇧",
  Canada: "🇨🇦", India: "🇮🇳", Germany: "🇩🇪",
};

export function GameDashboard({ initialCharacter }: Props) {
  const { character, pendingEvent: storeEvent, isAgeing, setCharacter, setPendingEvent, setIsAgeing } = useGameStore();
  const [prevStats, setPrevStats] = useState<CharacterClient["stats"] | null>(null);
  const [isResolvingChoice, setIsResolvingChoice] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [activeTab, setActiveTab] = useState<"life" | "career" | "relations" | "assets">("life");

  const synced = character?._id === initialCharacter._id;
  const char = synced && character ? character : initialCharacter;
  const pendingEvent = synced ? storeEvent : null;
  const flag  = COUNTRY_FLAGS[char.metadata.birthCountry] ?? "🌍";

  useEffect(() => {
    if (character?._id !== initialCharacter._id) {
      setCharacter(initialCharacter);
      setPendingEvent(initialCharacter.pendingEvent ?? null);
      setPrevStats(null);
      setError(null);
    }
  }, [initialCharacter, character, setCharacter, setPendingEvent]);

  async function handleAge() {
    setError(null);
    setIsAgeing(true);
    setPrevStats(char.stats);
    try {
      const res = await fetch("/api/age", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ characterId: char._id }),
      });
      const data = await res.json().catch(() => ({}));
      if (res.ok) {
        setCharacter(data.character);
        setPendingEvent(data.event ?? null);
        setError(null);
      } else if (res.status === 409 && data.event) {
        setPendingEvent(data.event);
      } else {
        setError(data.error ?? "Something went wrong");
      }
    } catch (e) {
      console.error(e);
      setError("Something went wrong");
    } finally {
      setIsAgeing(false);
    }
  }

  async function handleChoice(choiceIndex: number) {
    if (!pendingEvent) return;
    setError(null);
    setIsResolvingChoice(true);
    try {
      const res = await fetch("/api/choice", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          characterId: char._id,
          eventId:     "_id" in pendingEvent ? pendingEvent._id : "ai",
          choiceIndex,
        }),
      });
      const data = await res.json().catch(() => ({}));
      if (res.ok) {
        setCharacter(data.character);
        setPendingEvent(null);
        setError(null);
      } else if (res.status === 409 && data.error === "No pending event") {
        setPendingEvent(null);
      } else {
        setError(data.error ?? "Something went wrong");
      }
    } catch (e) {
      console.error(e);
      setError("Something went wrong");
    } finally {
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
        {activeTab === "career"    && <CareerTab    character={char} />}
        {activeTab === "relations" && <RelationsTab character={char} />}
        {activeTab === "assets"    && <AssetsTab    character={char} />}
      </div>

      {error && !pendingEvent && <p className="px-4 text-red-400 text-sm">{error}</p>}
      <AgeButton onClick={handleAge} disabled={!!pendingEvent} isLoading={isAgeing} />

      <EventModal event={pendingEvent} error={error} onChoice={handleChoice} isLoading={isResolvingChoice} />

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
