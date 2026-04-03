import { existsSync } from "node:fs";
import { spawn } from "node:child_process";
import path from "node:path";
import process from "node:process";

function run(cmd, args) {
  return new Promise((resolve, reject) => {
    const child = spawn(cmd, args, { stdio: "inherit" });
    child.on("error", reject);
    child.on("close", (code) => {
      if (code === 0) {
        resolve();
      } else {
        reject(new Error(`Command failed (${code}): ${cmd} ${args.join(" ")}`));
      }
    });
  });
}

function runShell(command) {
  return new Promise((resolve, reject) => {
    const child = spawn(command, { stdio: "inherit", shell: true });
    child.on("error", reject);
    child.on("close", (code) => {
      if (code === 0) {
        resolve();
      } else {
        reject(new Error(`Command failed (${code}): ${command}`));
      }
    });
  });
}

function resolvePython() {
  const winVenv = path.join(process.cwd(), ".venv", "Scripts", "python.exe");
  const unixVenv = path.join(process.cwd(), ".venv", "bin", "python");
  if (existsSync(winVenv)) return winVenv;
  if (existsSync(unixVenv)) return unixVenv;
  return "python";
}

async function main() {
  const python = resolvePython();
  await run(python, ["-m", "pytest", "-q"]);
  await runShell("npm run build");
  await runShell("npm run test:web-gesture");
  await runShell("npm run test:web-classic-timer");
  await runShell("npm run test:web-health-adaptive");
  await runShell("npm run test:web-avatar-skins");
  await runShell("npm run test:web-avatar-animation");
  await runShell("npm run test:web-input-mode-fallback");
  await runShell("npm run test:web-round-flow");
  await runShell("npm run test:web-hotkeys-feedback");
  await runShell("npm run test:web-visual-upgrade");
}

main().catch((err) => {
  console.error(err.message);
  process.exit(1);
});
