import { existsSync, readFileSync, rmSync } from "node:fs";

import { PID_FILE } from "./pidfile";

if (!existsSync(PID_FILE)) {
  console.log("No running forks.");
  process.exit(0);
}

const pid = Number(readFileSync(PID_FILE, "utf8"));
try {
  process.kill(pid, "SIGTERM");
  console.log(`Stopped forks (pid ${pid}).`);
} catch {
  rmSync(PID_FILE, { force: true });
  console.log(`Forks process ${pid} was already gone.`);
}
