// Asks the running realtime server to place a real test call to DEMO_CALL_TO_NUMBER.
import { config } from "dotenv";

config({ path: ".env", quiet: true });

const port = process.env.REALTIME_PORT ?? "8787";
const response = await fetch(`http://localhost:${port}/dev/call-me`, {
  method: "POST",
  headers: { "x-dev-token": process.env.DEV_ADMIN_TOKEN ?? "" },
});
console.log(response.status, await response.text());
