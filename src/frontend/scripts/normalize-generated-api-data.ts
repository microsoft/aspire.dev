/**
 * normalize-generated-api-data.ts — Enforces Aspire terminology in the generated
 * C#/TypeScript API reference JSON (`src/data/pkgs/*.json`, `src/data/ts-modules/*.json`).
 *
 * The C# API JSON is produced by the .NET `PackageJsonGenerator`; the TS API JSON
 * by `AtsJsonGenerator`. Both copy XML/JSDoc documentation text verbatim from the
 * upstream packages, so deprecated Aspire terminology leaks into the committed
 * data and trips the Forbidden Words CI check (see `.github/forbidden-words.json`).
 * This pass rewrites only prose fields, reusing the single source of truth in
 * `aspire-terminology.ts` (kept in sync with `.github/forbidden-words.json`).
 *
 * It transforms the raw file text (never a JSON re-serialization) so that files
 * without deprecated terms stay byte-for-byte identical to the generators'
 * output — the .NET serializer escapes some characters (astral code points,
 * U+00A0, ...) that `JSON.stringify` would emit raw, and a round-trip would
 * churn every such line. The deprecated phrases are pure ASCII with no
 * JSON-escaped characters, so applying the terminology rules directly to the
 * escaped string content yields exactly the correctly-escaped normalized value.
 *
 * Usage:
 *   tsx ./scripts/normalize-generated-api-data.ts                 # both areas
 *   tsx ./scripts/normalize-generated-api-data.ts --pkgs          # C# API only
 *   tsx ./scripts/normalize-generated-api-data.ts --ts-modules    # TS API only
 */

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

import { normalizeAspireTerminology } from './aspire-terminology';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const DATA_DIR = path.resolve(__dirname, '..', 'src', 'data');
export const PKGS_DIR = path.join(DATA_DIR, 'pkgs');
export const TS_MODULES_DIR = path.join(DATA_DIR, 'ts-modules');

// Per-line matcher (multiline) for EITHER a documentation node's `kind` marker
// OR a prose string field. Groups:
//   1 = kind value (kind-marker alternative)
//   2 = indent + opening quote of the key
//   3 = prose key name
//   4 = closing key quote, colon, opening value quote
//   5 = escaped value content
//   6 = closing value quote
// JSON strings can't contain literal newlines, so every value sits on one line.
// The `text` field is prose only inside `kind:"text"` nodes; code-bearing nodes
// (code, codeblock, cref, langword, paramref, ...) also carry `text` and must be
// left intact, hence the kind gating below. `description`/`returns`/`remarks`
// are always prose (and appear as string values only in the TS API + member
// summaries; the C# doc arrays open with `[` and are skipped, their inner text
// nodes handled by the `text` rule).
const nodeLine =
  /^[ \t]*"kind"[ \t]*:[ \t]*"([^"]*)"|^([ \t]*")(text|description|returns|remarks)("[ \t]*:[ \t]*")((?:[^"\\]|\\.)*)(")/gm;

/**
 * Rewrite deprecated Aspire terminology in the prose fields of a generated API
 * JSON document, preserving every byte outside the changed phrases.
 */
export function normalizeApiJsonText(raw: string): { text: string; changes: number } {
  let result = '';
  let lastIndex = 0;
  let lastKind: string | null = null;
  let changes = 0;

  for (const match of raw.matchAll(nodeLine)) {
    const start = match.index ?? 0;
    result += raw.slice(lastIndex, start);
    lastIndex = start + match[0].length;

    if (match[1] !== undefined) {
      // `kind` marker — remember it so the next `text` field can be classified.
      lastKind = match[1];
      result += match[0];
      continue;
    }

    const [, , open, key, separator, value, close] = match;
    const isProse = key !== 'text' || lastKind === 'text';
    if (!isProse) {
      result += match[0];
      continue;
    }

    const normalized = normalizeAspireTerminology(value);
    if (normalized !== value) {
      changes++;
    }
    result += `${open}${key}${separator}${normalized}${close}`;
  }

  return { text: result + raw.slice(lastIndex), changes };
}

/** Normalize a single API JSON file in place; returns the number of changes. */
export function normalizeApiFile(filePath: string): number {
  const raw = fs.readFileSync(filePath, 'utf8');
  const { text, changes } = normalizeApiJsonText(raw);
  if (changes > 0) {
    fs.writeFileSync(filePath, text);
  }
  return changes;
}

/** Normalize every `*.json` file in a directory; returns per-run counts. */
export function normalizeApiDir(dir: string): {
  files: number;
  changes: number;
  changedFiles: string[];
} {
  if (!fs.existsSync(dir)) {
    return { files: 0, changes: 0, changedFiles: [] };
  }

  const changedFiles: string[] = [];
  let files = 0;
  let changes = 0;

  for (const name of fs.readdirSync(dir).sort()) {
    if (!name.endsWith('.json')) {
      continue;
    }
    files++;
    const fileChanges = normalizeApiFile(path.join(dir, name));
    if (fileChanges > 0) {
      changes += fileChanges;
      changedFiles.push(name);
    }
  }

  return { files, changes, changedFiles };
}

function main(): void {
  const args = process.argv.slice(2);
  const explicit = args.includes('--pkgs') || args.includes('--ts-modules');
  const targets: Array<{ label: string; dir: string }> = [];
  if (!explicit || args.includes('--pkgs')) {
    targets.push({ label: 'pkgs', dir: PKGS_DIR });
  }
  if (!explicit || args.includes('--ts-modules')) {
    targets.push({ label: 'ts-modules', dir: TS_MODULES_DIR });
  }

  let total = 0;
  for (const { label, dir } of targets) {
    const { files, changes, changedFiles } = normalizeApiDir(dir);
    total += changes;
    console.log(
      `  ${label}: normalized ${changes} occurrence(s) across ${changedFiles.length}/${files} file(s)`
    );
    for (const file of changedFiles) {
      console.log(`      • ${file}`);
    }
  }

  console.log(
    total > 0
      ? `✅ Aspire terminology normalized (${total} occurrence(s)).`
      : '✅ Aspire terminology already normalized.'
  );
}

const isMainModule = process.argv[1]
  ? path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)
  : false;

if (isMainModule) {
  main();
}
