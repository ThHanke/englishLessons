import { createCompanionServer } from "./index.ts";

const DEV_PORT = 5199;

const handle = await createCompanionServer({ port: DEV_PORT });
console.log(`Companion dev server: ${handle.url}`);
