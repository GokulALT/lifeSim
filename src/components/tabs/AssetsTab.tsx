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
