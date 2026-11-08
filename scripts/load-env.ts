// Imported first by scripts so .env (and .env.test when KINDLY_ENV=test) is loaded before any module reads process.env.
import { loadEnvFiles } from "@/lib/env-files";

loadEnvFiles();
