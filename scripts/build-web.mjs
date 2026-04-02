import fs from "node:fs";
import path from "node:path";

const root = process.cwd();
const src = path.join(root, "web");
const out = path.join(root, "dist");

if (!fs.existsSync(src)) {
  console.error("Missing web/ directory.");
  process.exit(1);
}

fs.rmSync(out, { recursive: true, force: true });
fs.mkdirSync(out, { recursive: true });
fs.cpSync(src, out, { recursive: true });

console.log(`Built web assets to ${out}`);
