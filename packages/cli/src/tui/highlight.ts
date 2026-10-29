/** A tiny, dependency-free tokenizer for coloring code inside diffs. Not a parser: good enough to read. */
export type TokenKind = "keyword" | "string" | "comment" | "number" | "plain";
export interface Token {
  text: string;
  kind: TokenKind;
}

interface Lang {
  keywords: Set<string>;
  /** Line comment starter(s). */
  comment: string[];
}

const words = (s: string) => new Set(s.split(/\s+/));
const JS = words(
  "const let var function return if else for while do switch case break continue new class extends import export from default async await try catch finally throw typeof instanceof in of this super null undefined true false interface type enum implements public private protected readonly static void as",
);
const PY = words(
  "def class return if elif else for while in not and or is import from as try except finally raise with lambda pass break continue None True False async await yield global nonlocal assert del",
);
const C = words(
  "int char long short unsigned signed float double void struct union enum typedef static const extern return if else for while do switch case break continue sizeof goto default volatile register inline NULL",
);
const GO = words(
  "func package import return if else for range switch case break continue go defer chan select struct interface map type var const nil true false",
);
const RUST = words(
  "fn let mut const static struct enum impl trait pub use mod crate self super return if else for while loop match break continue as in where async await move ref true false Some None Ok Err",
);
const SH = words(
  "if then else elif fi for while do done case esac function in return export local echo exit",
);

const LANGS: Record<string, Lang> = {
  js: { keywords: JS, comment: ["//"] },
  py: { keywords: PY, comment: ["#"] },
  c: { keywords: C, comment: ["//"] },
  go: { keywords: GO, comment: ["//"] },
  rs: { keywords: RUST, comment: ["//"] },
  sh: { keywords: SH, comment: ["#"] },
  json: { keywords: words("true false null"), comment: [] },
  yaml: { keywords: words("true false null"), comment: ["#"] },
};

const EXT: Record<string, string> = {
  ts: "js",
  tsx: "js",
  js: "js",
  jsx: "js",
  mjs: "js",
  cjs: "js",
  java: "js",
  cs: "js",
  kt: "js",
  swift: "js",
  py: "py",
  rb: "py",
  c: "c",
  h: "c",
  cc: "c",
  cpp: "c",
  hpp: "c",
  go: "go",
  rs: "rs",
  sh: "sh",
  bash: "sh",
  zsh: "sh",
  json: "json",
  yml: "yaml",
  yaml: "yaml",
  toml: "yaml",
};

/** Language key for a path, or undefined (then nothing is highlighted). */
export function languageOf(path: string | undefined): string | undefined {
  const ext = path?.split(".").pop()?.toLowerCase();
  return ext && path?.includes(".") ? EXT[ext] : undefined;
}

export function tokenize(line: string, language: string | undefined): Token[] {
  const lang = language ? LANGS[language] : undefined;
  if (!lang) return [{ text: line, kind: "plain" }];
  const out: Token[] = [];
  const push = (text: string, kind: TokenKind) => {
    if (!text) return;
    const last = out[out.length - 1];
    if (last && last.kind === kind) last.text += text;
    else out.push({ text, kind });
  };
  let i = 0;
  while (i < line.length) {
    const rest = line.slice(i);
    const start = lang.comment.find((c) => rest.startsWith(c));
    if (start) {
      push(rest, "comment");
      break;
    }
    const ch = line[i] as string;
    if (ch === '"' || ch === "'" || ch === "`") {
      let j = i + 1;
      while (j < line.length && line[j] !== ch) j += line[j] === "\\" ? 2 : 1;
      push(line.slice(i, Math.min(j + 1, line.length)), "string");
      i = j + 1;
      continue;
    }
    const num = /^\d[\d_.]*(?:[eE][+-]?\d+)?|^0x[\da-fA-F]+/.exec(rest);
    if (num && !/[\w$]/.test(line[i - 1] ?? "")) {
      push(num[0], "number");
      i += num[0].length;
      continue;
    }
    const word = /^[A-Za-z_$][\w$]*/.exec(rest);
    if (word) {
      push(word[0], lang.keywords.has(word[0]) ? "keyword" : "plain");
      i += word[0].length;
      continue;
    }
    push(ch, "plain");
    i++;
  }
  return out;
}
