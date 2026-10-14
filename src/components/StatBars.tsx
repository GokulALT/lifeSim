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
