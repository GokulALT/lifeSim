// Shared settings for the e2e server (e2e/server.ts) and the specs.
export const E2E_PORT = Number(process.env.E2E_PORT ?? 3100);
export const E2E_MONGO_PORT = Number(process.env.E2E_MONGO_PORT ?? 27999);
export const E2E_BASE_URL = `http://localhost:${E2E_PORT}`;
export const E2E_MONGO_URI = `mongodb://127.0.0.1:${E2E_MONGO_PORT}/lifesim_e2e`;
