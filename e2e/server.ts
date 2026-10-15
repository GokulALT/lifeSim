// Playwright webServer: an in-memory MongoDB, seeded with the real seed
// script, plus a Next.js dev server in the same process. Run via `tsx`.
import { spawnSync } from "child_process";
import { createServer } from "http";
import { MongoMemoryServer } from "mongodb-memory-server";
import next from "next";
import { E2E_BASE_URL, E2E_MONGO_PORT, E2E_MONGO_URI, E2E_PORT } from "./env";

async function main() {
  const mongo = await MongoMemoryServer.create({ instance: { port: E2E_MONGO_PORT } });

  process.env.MONGODB_URI = E2E_MONGO_URI;
  process.env.AUTH_SECRET = "e2e-secret-e2e-secret-e2e-secret-00";
  process.env.NEXTAUTH_SECRET = process.env.AUTH_SECRET;
  process.env.NEXTAUTH_URL = E2E_BASE_URL;
  process.env.AUTH_TRUST_HOST = "true";
  // No key: rare events skip the AI call and use the static fallback chain.
  delete process.env.NVIDIA_API_KEY;

  const seed = spawnSync("npx", ["tsx", "scripts/seed-events.ts"], {
    stdio: "inherit",
    shell: true,
    env: process.env,
  });
  if (seed.status !== 0) throw new Error("Seeding the e2e database failed");

  const app = next({ dev: true, hostname: "localhost", port: E2E_PORT });
  await app.prepare();
  const handle = app.getRequestHandler();
  const server = createServer((req, res) => handle(req, res));
  server.listen(E2E_PORT, () => console.log(`e2e server ready on ${E2E_BASE_URL}`));

  const shutdown = async () => {
    server.close();
    await mongo.stop();
    process.exit(0);
  };
  process.on("SIGINT", shutdown);
  process.on("SIGTERM", shutdown);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
