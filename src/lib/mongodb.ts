import { MongoClient, Db } from "mongodb";

let client: MongoClient;
let db: Db;

export async function getDb(): Promise<Db> {
  if (db) return db;

  const uri = process.env.MONGODB_URI;
  if (!uri) throw new Error("MONGODB_URI environment variable is not set");

  client = new MongoClient(uri);
  await client.connect();
  db = client.db();
  return db;
}
