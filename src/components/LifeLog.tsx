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
