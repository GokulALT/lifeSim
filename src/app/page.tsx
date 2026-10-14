import { auth } from "@/lib/auth";
import { getDb } from "@/lib/mongodb";
import { redirect } from "next/navigation";
import Link from "next/link";
import type { Character } from "@/lib/schemas/character";
import { toClient } from "@/lib/characterServer";

export default async function HomePage() {
  const session = await auth();
  if (!session?.user?.id) redirect("/login");

  const db   = await getDb();
  const docs = await db.collection<Character>("characters")
    .find({ userId: session.user.id }, { projection: { hiddenStats: 0 } })
    .toArray();
  const characters = docs.map(d => toClient(d as Character));

  return (
    <main className="min-h-screen bg-gray-950 p-6 max-w-lg mx-auto">
      <h1 className="text-2xl font-bold text-white mb-6">Your Lives</h1>

      <div className="space-y-3">
        {characters.map(c => (
          <Link
            key={c._id}
            href={`/game/${c._id}`}
            className="block bg-gray-900 rounded-xl p-4 border border-gray-800 hover:border-gray-600 transition-colors"
          >
            <div className="flex justify-between items-start">
              <div>
                <p className="text-white font-semibold">{c.metadata.firstName} {c.metadata.lastName}</p>
                <p className="text-gray-400 text-sm">Age {c.age} · {c.metadata.birthCity}</p>
              </div>
              <span className={`text-xs px-2 py-1 rounded-full ${c.isAlive ? "bg-green-900 text-green-300" : "bg-gray-800 text-gray-500"}`}>
                {c.isAlive ? "Alive" : "Deceased"}
              </span>
            </div>
          </Link>
        ))}
      </div>

      <div className="mt-6 space-y-3">
        <Link href="/new-life" className="block w-full py-3 bg-blue-600 hover:bg-blue-500 text-white text-center rounded-xl font-semibold min-h-[44px]">
          + Start a New Life
        </Link>
        <Link href="/store" className="block w-full py-3 bg-gray-800 hover:bg-gray-700 text-gray-300 text-center rounded-xl text-sm min-h-[44px]">
          DLC Packs
        </Link>
      </div>
    </main>
  );
}
