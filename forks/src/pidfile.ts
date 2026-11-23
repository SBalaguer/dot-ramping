import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

export const PID_FILE = resolve(dirname(fileURLToPath(import.meta.url)), "../.cache/forks.pid");
