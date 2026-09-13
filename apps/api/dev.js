import { spawn } from "node:child_process";
import { existsSync } from "node:fs";
import { resolve } from "node:path";

// Node 24 watch mode can crash when --env-file-if-exists names a missing file.
const envArgs = ["../../.env", ".env"]
  .map((file) => resolve(import.meta.dirname, file))
  .filter((file) => existsSync(file))
  .map((file) => `--env-file=${file}`);

const child = spawn(
  process.execPath,
  [...envArgs, "--watch", "src/server.js"],
  {
    cwd: import.meta.dirname,
    stdio: "inherit",
  },
);

for (const signal of ["SIGINT", "SIGTERM"]) {
  process.on(signal, () => child.kill(signal));
}

child.on("error", (error) => {
  console.error(error);
  process.exitCode = 1;
});

child.on("exit", (code, signal) => {
  process.exitCode = code ?? (signal === "SIGINT" ? 130 : 143);
});
