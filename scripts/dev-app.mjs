import { spawn } from "node:child_process";
import { fileURLToPath } from "node:url";
const root = fileURLToPath(new URL("../", import.meta.url));
const bridge = spawn(
  process.execPath,
  ["--env-file=" + root + "nexora-api/.env", root + "scripts/app-centers.mjs"],
  { stdio: "inherit" },
);
const app = spawn("npm", ["run", "web"], {
  cwd: root + "horekia-app",
  stdio: "inherit",
});
const children = [bridge, app];
let stopping = false;
function stop(code = 0) {
  if (stopping) return;
  stopping = true;
  for (const child of children) child.kill("SIGTERM");
  process.exitCode = code;
}
for (const child of children) {
  child.on("error", () => stop(1));
  child.on("exit", (code) => stop(code ?? 0));
}
process.on("SIGINT", () => stop());
process.on("SIGTERM", () => stop());
