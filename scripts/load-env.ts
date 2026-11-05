// Imported first by scripts so .env is loaded before any module reads process.env.
import { config } from "dotenv";

config({ path: ".env", quiet: true });
