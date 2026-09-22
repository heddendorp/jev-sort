import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { pathToFileURL } from "node:url";

const root = process.cwd();
const temporary = mkdtempSync(join(tmpdir(), "jev-sort-package-"));
try {
  const [packed] = JSON.parse(execFileSync("npm", ["pack", "--ignore-scripts", "--json", "--pack-destination", temporary], { encoding: "utf8" }));
  assert.ok(packed.files.some((file) => file.path === "dist/index.d.ts"));
  assert.ok(packed.files.every((file) => !file.path.startsWith(".env") && !file.path.startsWith("test/")));
  writeFileSync(join(temporary, "package.json"), JSON.stringify({ private: true, type: "module" }));
  execFileSync("npm", ["install", "--ignore-scripts", "--no-audit", "--no-fund", join(temporary, packed.filename)], { cwd: temporary, stdio: "pipe" });
  const source = `import { jevSort, createJevSorter, estimateSort } from "jev-sort";
const empty: number[] = await jevSort<number>([], "Ascending");
const value = { rank: 1 };
const sorted = await createJevSorter()([value], "Ascending", { project: item => item.rank });
if (empty.length !== 0 || sorted[0] !== value || estimateSort(8).rounds !== 6) throw new Error("Package smoke test failed");
`;
  writeFileSync(join(temporary, "consumer.mts"), source);
  execFileSync(resolve(root, "node_modules/.bin/tsc"), ["--strict", "--noEmit", "--module", "NodeNext", "--target", "ES2022", "--skipLibCheck", "consumer.mts"], { cwd: temporary, stdio: "inherit" });
  writeFileSync(join(temporary, "consumer.mjs"), source.replace("const empty: number[] = await jevSort<number>", "const empty = await jevSort"));
  await import(pathToFileURL(join(temporary, "consumer.mjs")).href);
  const manifest = JSON.parse(readFileSync(join(temporary, "node_modules/jev-sort/package.json"), "utf8"));
  console.log(`Packed ${manifest.name}@${manifest.version}: clean install, ESM import, and TypeScript consumer passed.`);
} finally {
  rmSync(temporary, { recursive: true, force: true });
}
