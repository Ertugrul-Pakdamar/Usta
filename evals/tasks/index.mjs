// Small, checkable coding tasks. Each: { id, category, prompt, setup(dir), check(dir, answer) -> { ok, detail } }.
import { execFileSync } from "node:child_process";
import { node, pad, read, write } from "../lib.mjs";

const N = 12;
const files = (n, f) => Array.from({ length: n }, (_, i) => f(pad(i + 1)));

export const tasks = [
  {
    id: "bulk-rename",
    category: "bulk edit",
    prompt:
      "Rename the function getUser to fetchUser everywhere in this project (definition, imports and calls). Do not change anything else. Then run `node main.js` to confirm it still prints OK.",
    setup(dir) {
      write(dir, "users.js", "export function getUser(id) { return { id, name: `user${id}` }; }\n");
      files(N, (n) => n).forEach((n) =>
        write(
          dir,
          `src/m${n}.js`,
          `import { getUser } from "../users.js";\nexport const name${n} = () => getUser(${Number(n)}).name;\n`,
        ),
      );
      write(
        dir,
        "main.js",
        `import { getUser } from "./users.js";\n${files(N, (n) => `import { name${n} } from "./src/m${n}.js";`).join("\n")}\nconst all = [${files(N, (n) => `name${n}()`).join(", ")}];\nconsole.log(getUser(1).id === 1 && all.length === ${N} ? "OK" : "BAD");\n`,
      );
      write(dir, "package.json", '{"type":"module"}\n');
    },
    check(dir) {
      const all = ["users.js", "main.js", ...files(N, (n) => `src/m${n}.js`)]
        .map((f) => read(dir, f))
        .join("\n");
      if (/getUser/.test(all)) return { ok: false, detail: "getUser still present" };
      if (!all.includes("fetchUser")) return { ok: false, detail: "fetchUser missing" };
      const r = node(dir, "main.js");
      return r.ok && r.out.trim() === "OK"
        ? { ok: true }
        : { ok: false, detail: `main.js: ${r.out.slice(0, 80)}` };
    },
  },
  {
    id: "bulk-header",
    category: "bulk edit",
    prompt:
      "Add this exact first line to every .js file under src/: `// Copyright (c) Acme Corp`. Keep the rest of each file unchanged.",
    setup(dir) {
      files(15, (n) => n).forEach((n) =>
        write(
          dir,
          `src/f${n}.js`,
          `export const v${n} = ${Number(n)};\nexport const double${n} = () => v${n} * 2;\n`,
        ),
      );
    },
    check(dir) {
      for (const n of files(15, (x) => x)) {
        const t = read(dir, `src/f${n}.js`);
        if (!t.startsWith("// Copyright (c) Acme Corp\n"))
          return { ok: false, detail: `f${n} has no header` };
        if (!t.includes(`export const v${n} = ${Number(n)};`))
          return { ok: false, detail: `f${n} content changed` };
        if (t.split("// Copyright").length > 2)
          return { ok: false, detail: `f${n} duplicated header` };
      }
      return { ok: true };
    },
  },
  {
    id: "bulk-version",
    category: "bulk edit",
    prompt:
      "Replace the version string 1.2.3 with 1.3.0 everywhere in the config files under config/ (the `version` field and every dependency version that is 1.2.3). Do not touch CHANGELOG.md, which documents history.",
    setup(dir) {
      files(10, (n) => n).forEach((n) =>
        write(
          dir,
          `config/svc${n}.json`,
          JSON.stringify({ name: `svc${n}`, version: "1.2.3", deps: { core: "1.2.3" } }, null, 2) +
            "\n",
        ),
      );
      write(dir, "CHANGELOG.md", "# Changelog\n\n## 1.2.3\n- first release of the 1.2.3 line\n");
    },
    check(dir) {
      for (const n of files(10, (x) => x)) {
        const j = JSON.parse(read(dir, `config/svc${n}.json`));
        if (j.version !== "1.3.0" || j.deps.core !== "1.3.0")
          return { ok: false, detail: `svc${n} not updated` };
      }
      return read(dir, "CHANGELOG.md").includes("## 1.2.3")
        ? { ok: true }
        : { ok: false, detail: "CHANGELOG was modified" };
    },
  },
  {
    id: "fix-bug",
    category: "fix",
    prompt:
      "The tests in test.js fail. Find the bug in the code (not in the tests) and fix it. Run `node test.js` to confirm.",
    setup(dir) {
      write(
        dir,
        "stats.js",
        "export function average(xs) {\n  let sum = 0;\n  for (let i = 1; i < xs.length; i++) sum += xs[i];\n  return xs.length ? sum / xs.length : 0;\n}\nexport function max(xs) { return Math.max(...xs); }\n",
      );
      write(
        dir,
        "test.js",
        'import { average, max } from "./stats.js";\nimport assert from "node:assert";\nassert.strictEqual(average([2, 4, 6]), 4);\nassert.strictEqual(average([]), 0);\nassert.strictEqual(max([1, 9, 3]), 9);\nconsole.log("PASS");\n',
      );
      write(dir, "package.json", '{"type":"module"}\n');
    },
    check(dir) {
      const r = node(dir, "test.js");
      const testIntact = read(dir, "test.js").includes(
        "assert.strictEqual(average([2, 4, 6]), 4);",
      );
      return r.ok && r.out.includes("PASS") && testIntact
        ? { ok: true }
        : { ok: false, detail: r.out.slice(0, 100) };
    },
  },
  {
    id: "add-feature",
    category: "feature",
    prompt:
      "Implement `slugify(text)` in slug.js (it currently throws). It lowercases, trims, replaces runs of non-alphanumeric characters with a single '-', and strips leading/trailing '-'. Make `node test.js` pass.",
    setup(dir) {
      write(
        dir,
        "slug.js",
        'export function slugify(text) {\n  throw new Error("not implemented");\n}\n',
      );
      write(
        dir,
        "test.js",
        'import { slugify } from "./slug.js";\nimport assert from "node:assert";\nassert.strictEqual(slugify("Hello, World!"), "hello-world");\nassert.strictEqual(slugify("  A  B   C "), "a-b-c");\nassert.strictEqual(slugify("--x--"), "x");\nassert.strictEqual(slugify("Ünï 42"), "n-42");\nconsole.log("PASS");\n',
      );
      write(dir, "package.json", '{"type":"module"}\n');
    },
    check(dir) {
      const r = node(dir, "test.js");
      return r.ok && r.out.includes("PASS")
        ? { ok: true }
        : { ok: false, detail: r.out.slice(0, 100) };
    },
  },
  {
    id: "find-answer",
    category: "read-only",
    prompt:
      "Which file defines the function `computeTax`, and what rate does it use for the 'reduced' category? Answer in one sentence with the file path and the rate.",
    setup(dir) {
      files(20, (n) => n).forEach((n) =>
        write(
          dir,
          `lib/mod${n}.js`,
          `export function helper${n}(x) { return x + ${Number(n)}; }\nexport const label${n} = "module ${n}";\n`,
        ),
      );
      write(
        dir,
        "lib/billing/tax.js",
        'const RATES = { standard: 0.2, reduced: 0.075, zero: 0 };\nexport function computeTax(amount, category = "standard") {\n  return amount * RATES[category];\n}\n',
      );
    },
    check(_dir, answer) {
      return /billing\/tax\.js/.test(answer) && /0\.075|7\.5/.test(answer)
        ? { ok: true }
        : { ok: false, detail: answer.slice(0, 100) };
    },
  },
  {
    id: "big-log-count",
    category: "read-only",
    prompt:
      "How many lines in server.log contain both `[auth]` and `ERROR`? Answer with just the number.",
    setup(dir) {
      const svcs = ["auth", "db", "api", "cache"];
      const lines = [];
      let seed = 7;
      const rnd = () => (seed = (seed * 1103515245 + 12345) % 2147483648) / 2147483648;
      for (let i = 0; i < 700; i++) {
        const s = svcs[Math.floor(rnd() * 4)];
        const lvl = rnd() < 0.2 ? "ERROR" : rnd() < 0.5 ? "INFO" : "WARN";
        lines.push(
          `2026-10-29T10:${pad(i % 60)}:00Z [${s}] ${lvl} request ${i} took ${Math.floor(rnd() * 900)}ms`,
        );
      }
      write(dir, "server.log", lines.join("\n") + "\n");
      write(dir, ".expected", String(lines.filter((l) => l.includes("[auth] ERROR")).length));
    },
    check(dir, answer) {
      const expected = read(dir, ".expected").trim();
      return new RegExp(`(^|\\D)${expected}(\\D|$)`).test(answer)
        ? { ok: true }
        : { ok: false, detail: `expected ${expected}, got: ${answer.slice(0, 60)}` };
    },
  },
  {
    id: "create-cli",
    category: "feature",
    prompt:
      "Create wc.js: a CommonJS Node script that reads all of stdin and prints the number of lines, then the number of words, separated by a single space (like `3 7`). Then test it yourself with a short input.",
    setup(dir) {
      write(dir, "README.md", "scratch directory\n");
    },
    check(dir) {
      try {
        const out = execFileSync(process.execPath, ["wc.js"], {
          cwd: dir,
          input: "one two\nthree\nfour five six\n",
          encoding: "utf8",
          timeout: 10_000,
        });
        return out.trim() === "3 6"
          ? { ok: true }
          : { ok: false, detail: `printed ${JSON.stringify(out)}` };
      } catch (e) {
        return { ok: false, detail: String(e.message).slice(0, 80) };
      }
    },
  },
  {
    id: "csv-to-json",
    category: "bulk edit",
    prompt:
      "Convert people.csv (header row: name,age,city) into people.json: an array of objects with `age` as a number. Keep the row order.",
    setup(dir) {
      const rows = Array.from(
        { length: 60 },
        (_, i) => `person${i + 1},${20 + (i % 40)},city${i % 7}`,
      );
      write(dir, "people.csv", `name,age,city\n${rows.join("\n")}\n`);
    },
    check(dir) {
      try {
        const j = JSON.parse(read(dir, "people.json"));
        const ok =
          Array.isArray(j) &&
          j.length === 60 &&
          j[0].name === "person1" &&
          j[59].name === "person60" &&
          typeof j[3].age === "number" &&
          j[3].age === 23 &&
          j[10].city === "city3";
        return ok ? { ok: true } : { ok: false, detail: "content mismatch" };
      } catch (e) {
        return { ok: false, detail: String(e.message).slice(0, 80) };
      }
    },
  },
];

// A code-review request on a small Go + React project (the kind of prompt that produced long,
// repetitive output). Pass = the real findings are named; verbosity is measured separately
// (completion tokens, `repeat_ratio`).
const goFile = (name, body) => [`backend/${name}`, body];
const REVIEW_FILES = [
  goFile(
    "pkg/utils/jwt.go",
    'package utils\n\nimport "github.com/golang-jwt/jwt/v5"\n\nfunc Sign(secret string, claims jwt.Claims) (string, error) {\n\treturn jwt.NewWithClaims(jwt.SigningMethodHS256, claims).SignedString([]byte(secret))\n}\n',
  ),
  goFile(
    "pkg/utils/password.go",
    'package utils\n\nimport "golang.org/x/crypto/bcrypt"\n\nfunc Hash(p string) (string, error) {\n\tb, err := bcrypt.GenerateFromPassword([]byte(p), 4)\n\treturn string(b), err\n}\n',
  ),
  goFile(
    "internal/config/config.go",
    'package config\n\nimport "os"\n\ntype JWT struct {\n\tSecret     string\n\tExpiration string\n}\n\nfunc Load() JWT {\n\treturn JWT{Secret: get("JWT_SECRET", "change-me-in-production"), Expiration: get("JWT_EXPIRATION", "24h")}\n}\n\nfunc get(k, d string) string {\n\tif v := os.Getenv(k); v != "" {\n\t\treturn v\n\t}\n\treturn d\n}\n',
  ),
  goFile(
    "internal/middleware/auth.go",
    'package middleware\n\nimport "net/http"\n\nfunc Auth(next http.Handler) http.Handler {\n\treturn http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {\n\t\tif r.Header.Get("Authorization") == "" {\n\t\t\thttp.Error(w, "unauthorized", 401)\n\t\t\treturn\n\t\t}\n\t\tnext.ServeHTTP(w, r)\n\t})\n}\n',
  ),
  goFile(
    "internal/repository/form_repository.go",
    'package repository\n\nimport "context"\n\nfunc (r *Repo) AllForms(ctx context.Context) ([]Form, error) {\n\tcur, err := r.col.Find(ctx, bson.M{})\n\tif err != nil {\n\t\treturn nil, err\n\t}\n\tvar out []Form\n\treturn out, cur.All(ctx, &out)\n}\n',
  ),
  [
    "frontend/src/components/FormEditor.jsx",
    'import { useState } from "react";\nexport default function FormEditor({ form }) {\n  const [fields, setFields] = useState(form.fields);\n  return <div dangerouslySetInnerHTML={{ __html: form.description }} />;\n}\n',
  ],
  [
    "frontend/vite.config.js",
    'import { defineConfig } from "vite";\nexport default defineConfig({});\n',
  ],
  [
    "docker-compose.yml",
    'services:\n  api:\n    build: ./backend\n    ports: ["8080:8080"]\n  mongo:\n    image: mongo\n    ports: ["27017:27017"]\n',
  ],
  [".gitignore", ".env\nnode_modules\n"],
  [".env", "JWT_SECRET=dev-secret-123\nJWT_EXPIRATION=24h\n"],
  ["README.md", "# Formexus\n\nA small form builder (Go + React + MongoDB).\n"],
];

tasks.push({
  id: "review-project",
  category: "review",
  prompt:
    "Selam bu proje bir form oluşturucu uygulaması. Projeyi inceleyip güvenlik açıklarını ve optimizasyon sorunlarını listeleyip çözüm önerileri planlayabilir misin?",
  setup(dir) {
    for (const [rel, text] of REVIEW_FILES) write(dir, rel, text);
  },
  check(_dir, answer) {
    const a = answer.toLowerCase();
    const found = ["change-me-in-production", "dangerouslysetinnerhtml", "hs256", "27017"].filter(
      (k) => a.includes(k),
    );
    return found.length >= 2
      ? { ok: true }
      : { ok: false, detail: `only ${found.length} real finding(s) named` };
  },
});
