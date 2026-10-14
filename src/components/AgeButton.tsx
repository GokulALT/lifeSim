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
