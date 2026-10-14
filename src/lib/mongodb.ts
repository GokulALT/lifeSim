import { MongoClient, Db } from "mongodb";

// Cache the connection promise on globalThis so it survives Next.js dev hot reloads.
const globalForMongo = globalThis as unknown as { _mongoDbPromise?: Promise<Db> };

export async function getDb(): Promise<Db> {
  let promise = globalForMongo._mongoDbPromise;

  if (!promise) {
    const uri = process.env.MONGODB_URI;
    if (!uri) throw new Error("MONGODB_URI environment variable is not set");

    const client = new MongoClient(uri);
    promise = client.connect().then((connected) => connected.db());
    globalForMongo._mongoDbPromise = promise;

    // Clear the cache on failure so the next call can retry.
    promise.catch(() => {
      if (globalForMongo._mongoDbPromise === promise) {
        delete globalForMongo._mongoDbPromise;
      }
    });
  }

  return promise;
}
