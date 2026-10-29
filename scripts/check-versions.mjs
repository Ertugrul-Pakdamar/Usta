#!/usr/bin/env node
// All workspace packages ship together, so they must carry one version; with a tag name
// (`node scripts/check-versions.mjs v0.1.1`) it also checks that the tag matches it.
import { readdirSync, readFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const versions = new Map(
  readdirSync(join(root, "packages")).map((dir) => [
    dir,
    JSON.parse(readFileSync(join(root, "packages", dir, "package.json"), "utf8")).version,
  ]),
);
const distinct = new Set(versions.values());
if (distinct.size !== 1) {
  console.error(
    `Package versions differ: ${[...versions].map(([d, v]) => `${d}=${v}`).join(", ")}`,
  );
  process.exit(1);
}
const [version] = distinct;
const tag = process.argv[2];
if (tag && tag !== `v${version}`) {
  console.error(`Tag ${tag} does not match the package version v${version}`);
  process.exit(1);
}
console.log(`all packages at ${version}${tag ? ` (tag ${tag} matches)` : ""}`);
