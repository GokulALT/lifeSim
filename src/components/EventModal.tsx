"use client";
import type { EventTemplate, AiEvent } from "@/lib/schemas/event";

interface Props {
  event:     EventTemplate | AiEvent | null;
  onChoice:  (index: number) => void;
  isLoading: boolean;
  error?:    string | null;
}

export function EventModal({ event, onChoice, isLoading, error }: Props) {
  if (!event) return null;

  return (
    <div data-testid="event-modal" className="fixed inset-0 z-50 flex items-end bg-black/60">
      <div className="w-full max-w-lg mx-auto bg-gray-900 rounded-t-2xl px-4 pt-4 pb-8 space-y-4 animate-slide-up">
        <div className="w-10 h-1 bg-gray-600 rounded-full mx-auto" />
        <p className="text-white text-base leading-relaxed">{event.eventText}</p>
        {error && <p className="text-red-400 text-sm">{error}</p>}
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
