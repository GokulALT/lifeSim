"use client";
import { useState } from "react";
import { useRouter } from "next/navigation";
import { PLUGINS } from "@/plugins";

const COUNTRIES = ["Australia", "United States", "United Kingdom", "Canada", "India", "Germany", "Japan", "Brazil", "South Africa", "New Zealand"];

export default function NewLifePage() {
  const router = useRouter();
  const [form, setForm] = useState({
    firstName: "", lastName: "", birthCountry: "Australia", birthCity: "",
    gender: "male", sexuality: "heterosexual", packId: "core_realistic",
  });
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  function update(field: string, value: string) {
    setForm(f => ({ ...f, [field]: value }));
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    setError("");
    try {
      const res = await fetch("/api/characters", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(form),
      });
      if (!res.ok) { const d = await res.json().catch(() => ({})); setError(d.error ?? "Failed"); return; }
      const data = await res.json();
      router.push(`/game/${data.character._id}`);
    } finally {
      setLoading(false);
    }
  }

  const inputCls = "w-full p-3 rounded-lg bg-gray-800 text-white border border-gray-700 focus:outline-none focus:border-blue-500 min-h-[44px] text-sm";

  return (
    <main className="min-h-screen bg-gray-950 p-6 max-w-lg mx-auto">
      <h1 className="text-2xl font-bold text-white mb-6">New Life</h1>
      <form onSubmit={handleSubmit} className="space-y-4">
        {error && <p className="text-red-400 text-sm">{error}</p>}

        <div className="grid grid-cols-2 gap-3">
          <input className={inputCls} placeholder="First Name" value={form.firstName} onChange={e => update("firstName", e.target.value)} required />
          <input className={inputCls} placeholder="Last Name"  value={form.lastName}  onChange={e => update("lastName",  e.target.value)} required />
        </div>

        <select className={inputCls} value={form.birthCountry} onChange={e => update("birthCountry", e.target.value)}>
          {COUNTRIES.map(c => <option key={c}>{c}</option>)}
        </select>

        <input className={inputCls} placeholder="Birth City" value={form.birthCity} onChange={e => update("birthCity", e.target.value)} required />

        <select className={inputCls} value={form.gender} onChange={e => update("gender", e.target.value)}>
          <option value="male">Male</option>
          <option value="female">Female</option>
          <option value="non-binary">Non-binary</option>
        </select>

        <select className={inputCls} value={form.sexuality} onChange={e => update("sexuality", e.target.value)}>
          <option value="heterosexual">Heterosexual</option>
          <option value="homosexual">Homosexual</option>
          <option value="bisexual">Bisexual</option>
        </select>

        <div>
          <p className="text-gray-400 text-sm mb-2">World Setting</p>
          {Object.values(PLUGINS).filter(p => !p.comingSoon).map(p => (
            <label key={p.id} className="flex items-center gap-3 p-3 bg-gray-800 rounded-lg mb-2 cursor-pointer">
              <input type="radio" name="packId" value={p.id} checked={form.packId === p.id} onChange={() => update("packId", p.id)} className="min-w-[20px] min-h-[20px]" />
              <span className="text-white text-sm">{p.label}</span>
            </label>
          ))}
        </div>

        <button type="submit" disabled={loading} className="w-full py-4 bg-green-600 hover:bg-green-500 disabled:bg-gray-700 text-white font-bold rounded-2xl min-h-[56px]">
          {loading ? "Creating..." : "Begin Life"}
        </button>
      </form>
    </main>
  );
}
