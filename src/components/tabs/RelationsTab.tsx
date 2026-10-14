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
