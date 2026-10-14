import { auth } from "@/lib/auth";
import { getDb } from "@/lib/mongodb";
import { redirect } from "next/navigation";
import { GameDashboard } from "@/components/GameDashboard";
import { toClient } from "@/lib/characterServer";
import type { Character } from "@/lib/schemas/character";

interface Props { params: Promise<{ characterId: string }> }

export default async function GamePage({ params }: Props) {
  const session = await auth();
  if (!session?.user?.id) redirect("/login");

  const { characterId } = await params;
  const db = await getDb();

  const character = await db.collection<Character>("characters")
    .findOne({ _id: characterId, userId: session.user.id }, { projection: { hiddenStats: 0 } });

  if (!character) redirect("/");

  return <GameDashboard initialCharacter={toClient(character as Character)} />;
}
