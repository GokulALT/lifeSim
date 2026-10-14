// scripts/seed-events.ts
// Run with: npm run seed
import { MongoClient } from "mongodb";
import * as fs from "fs";
import * as path from "path";

async function seed() {
  const uri = process.env.MONGODB_URI;
  if (!uri) throw new Error("MONGODB_URI not set");

  const client = new MongoClient(uri);
  await client.connect();
  const db = client.db();

  const files = ["common", "uncommon", "flags"];
  for (const name of files) {
    const filePath = path.join(process.cwd(), "data", "events", `${name}.json`);
    const events = JSON.parse(fs.readFileSync(filePath, "utf-8"));

    for (const event of events) {
      await db.collection("event_templates").replaceOne(
        { _id: event._id },
        event,
        { upsert: true }
      );
    }
    console.log(`Seeded ${events.length} ${name} events`);
  }

  await db.collection("event_templates").createIndex(
    { packId: 1, tier: 1, "conditions.ageMin": 1, "conditions.ageMax": 1 }
  );
  console.log("Index created");
  await client.close();
}

seed().catch((err) => { console.error(err); process.exit(1); });
