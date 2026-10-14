"use client";
import { useEffect, useState } from "react";
import { PLUGINS } from "@/plugins";
import Link from "next/link";

export default function StorePage() {
  const [checked, setChecked] = useState<string[]>([]);
  const [saving,  setSaving]  = useState(false);
  const [saved,   setSaved]   = useState(false);
  const [error,   setError]   = useState<string | null>(null);

  useEffect(() => {
    fetch("/api/user/dlc")
      .then(r => r.json())
      .then(d => { setChecked(d.unlockedDLCs ?? []); })
      .catch(() => {});
  }, []);

  function toggle(id: string) {
    if (id === "core_realistic") return; // always locked on
    if (PLUGINS[id]?.comingSoon) return;
    setChecked(prev => prev.includes(id) ? prev.filter(x => x !== id) : [...prev, id]);
    setSaved(false);
  }

  async function handleSave() {
    setSaving(true);
    setError(null);
    try {
      const res = await fetch("/api/user/dlc", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ unlockedDLCs: checked }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        setError(data.error ?? "Failed to save");
        return;
      }
      setChecked(data.unlockedDLCs ?? checked);
      setSaved(true);
    } catch {
      setError("Failed to save");
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
          const isCore       = plugin.id === "core_realistic";
          const isComingSoon = !!plugin.comingSoon;
          const isChecked    = !isComingSoon && checked.includes(plugin.id);
          return (
            <label key={plugin.id} className={`flex items-center gap-4 p-4 rounded-xl border transition-colors ${isComingSoon ? "cursor-not-allowed opacity-60" : "cursor-pointer"} ${isChecked ? "bg-blue-950 border-blue-700" : "bg-gray-900 border-gray-800"}`}>
              <input
                type="checkbox"
                checked={isChecked}
                onChange={() => toggle(plugin.id)}
                disabled={isCore || isComingSoon}
                className="w-5 h-5 accent-blue-500"
              />
              <div>
                <p className="text-white font-medium">{plugin.label}</p>
                {isCore && <p className="text-xs text-gray-500">Always included</p>}
                {isComingSoon && <p className="text-xs text-gray-500">Coming soon</p>}
              </div>
            </label>
          );
        })}
      </div>

      {error && <p className="mt-4 text-red-400 text-sm">{error}</p>}

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
