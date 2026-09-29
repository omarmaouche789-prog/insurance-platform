import { createApp } from "./app";
import { assertProductionIntegrations, env } from "./lib/env";

// Refuse to boot in production on mock/local-disk adapters (see env.ts).
assertProductionIntegrations();

const app = createApp();

app.listen(env.apiPort, () => {
  console.log(`API listening on port ${env.apiPort}`);
});
