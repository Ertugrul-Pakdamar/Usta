#!/usr/bin/env node
// Builds ONE self-contained executable of the CLI (no Node.js needed on the target machine).
//   pnpm build && node scripts/build-binary.mjs [--out dist-bin] [--name usta]
//
// How: esbuild folds the CLI and its dependencies into a single ES module; that module is embedded
// as an asset into a copy of the Node.js binary (Node "single executable application"). The tiny
// CommonJS bootstrap writes the asset to ~/.usta/cache once (keyed by content hash) and imports it.
// The Node binary that runs this script is the one copied, so run it with an OFFICIAL Node.js build
// (nodejs.org / actions/setup-node); distro packages are often a stub around libnode.so and cannot be used.
import { execFileSync } from "node:child_process";
import { createHash } from "node:crypto";
import {
  chmodSync,
  copyFileSync,
  mkdirSync,
  readFileSync,
  rmSync,
  statSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { build } from "esbuild";
import { inject } from "postject";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const arg = (name, fallback) => {
  const i = process.argv.indexOf(`--${name}`);
  return i > 0 ? process.argv[i + 1] : fallback;
};
const outDir = resolve(root, arg("out", "dist-bin"));
const isWindows = process.platform === "win32";
const name = `${arg("name", "usta")}${isWindows ? ".exe" : ""}`;
const version = JSON.parse(readFileSync(join(root, "packages/cli/package.json"), "utf8")).version;

const SENTINEL = "NODE_SEA_FUSE_fce680ab2cc467b6e072b8b5df1996b2";
const node = process.execPath;
if (!readFileSync(node).includes(SENTINEL)) {
  console.error(
    `${node} cannot host a single executable (no SEA fuse). Use an official Node.js build from nodejs.org.`,
  );
  process.exit(1);
}

const work = join(tmpdir(), `usta-sea-${process.pid}`);
rmSync(work, { recursive: true, force: true });
mkdirSync(work, { recursive: true });
mkdirSync(outDir, { recursive: true });

// 1. One ES module with everything inside.
await build({
  entryPoints: [join(root, "packages/cli/dist/bin.js")],
  bundle: true,
  platform: "node",
  format: "esm",
  target: "node22",
  outfile: join(work, "usta.mjs"),
  banner: {
    js: 'import { createRequire as __cr } from "node:module"; const require = __cr(import.meta.url);',
  },
  // ink loads react-devtools-core only when DEV=true; it is not shipped.
  alias: { "react-devtools-core": join(root, "scripts/stubs/empty.mjs") },
  define: { __USTA_VERSION__: JSON.stringify(version) },
  logLevel: "warning",
});

// 2. The bootstrap embedded as the SEA main script (CommonJS).
writeFileSync(
  join(work, "boot.cjs"),
  `const sea = require("node:sea");
const { createHash } = require("node:crypto");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const { pathToFileURL } = require("node:url");

const code = Buffer.from(sea.getAsset("usta.mjs"));
const hash = createHash("sha256").update(code).digest("hex").slice(0, 16);
const dir = path.join(os.homedir(), ".usta", "cache");
const file = path.join(dir, "usta-" + hash + ".mjs");
if (!fs.existsSync(file)) {
  fs.mkdirSync(dir, { recursive: true, mode: 0o700 });
  fs.writeFileSync(file + ".tmp", code, { mode: 0o600 });
  fs.renameSync(file + ".tmp", file);
  // drop bundles of older versions
  for (const f of fs.readdirSync(dir)) {
    if (/^usta-[0-9a-f]{16}\\.mjs$/.test(f) && f !== path.basename(file)) fs.rmSync(path.join(dir, f), { force: true });
  }
}
import(pathToFileURL(file).href).catch((e) => {
  console.error(e);
  process.exit(1);
});
`,
);
writeFileSync(
  join(work, "sea-config.json"),
  JSON.stringify({
    main: "boot.cjs",
    output: "sea.blob",
    disableExperimentalSEAWarning: true,
    assets: { "usta.mjs": "usta.mjs" },
  }),
);

// 3. Blob + injection into a copy of the Node binary.
execFileSync(node, ["--experimental-sea-config", "sea-config.json"], {
  cwd: work,
  stdio: "inherit",
});
const target = join(outDir, name);
rmSync(target, { force: true });
copyFileSync(node, target);
chmodSync(target, 0o755);
if (process.platform === "darwin") {
  execFileSync("codesign", ["--remove-signature", target], { stdio: "inherit" });
}
await inject(target, "NODE_SEA_BLOB", readFileSync(join(work, "sea.blob")), {
  sentinelFuse: SENTINEL,
  ...(process.platform === "darwin" ? { machoSegmentName: "NODE_SEA" } : {}),
});
if (process.platform === "darwin") {
  execFileSync("codesign", ["--sign", "-", target], { stdio: "inherit" });
}

const sha = createHash("sha256").update(readFileSync(target)).digest("hex");
writeFileSync(`${target}.sha256`, `${sha}  ${name}\n`);
rmSync(work, { recursive: true, force: true });
console.log(
  `${target}  v${version}  ${(statSync(target).size / 1e6).toFixed(0)} MB\nsha256 ${sha}`,
);
