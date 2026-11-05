import { execSync } from "node:child_process";

// Every run starts from the same fictional demo data (also resets per-hour call limits).
export default function globalSetup() {
  execSync("pnpm demo:reset", { stdio: "ignore" });
}
