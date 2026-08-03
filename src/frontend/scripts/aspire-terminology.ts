const horizontalWhitespace = String.raw`[ \t]+`;

// A deprecated term only matches when it isn't fused to an adjacent alphanumeric
// character, so longer tokens like `ASP.NET Aspire` or `.NET AspireX` stay intact
// while punctuation and Markdown wrappers (`_`, `*`, `[`) still count as
// boundaries around a standalone term.
const termStart = String.raw`(?<![A-Za-z0-9])`;
const termEnd = String.raw`(?![A-Za-z0-9])`;

// Markdown emphasis/link openers can sit between an article and a term in raw
// README content (e.g. `a **.NET Aspire**`, `a [.NET Aspire](url)`, or
// `a _.NET Aspire_`), so the article corrector consumes them to stay grammatical
// after the term shrinks. Backticks are intentionally excluded: inline code is
// skipped wholesale (see `codeRegion`), so a term inside it is never rewritten.
const markdownOpeners = String.raw`[*\[_]*`;

// Fenced code blocks and inline code spans are copied through verbatim so sample
// commands like `dotnet aspire run` are never rewritten into an unrunnable
// `Aspire run`. Everything outside these regions is treated as prose. This runs
// over raw README Markdown (`readmeRaw` feeds the Copy/View Markdown actions), so
// preserving code exactly matters.
const codeRegion = /```[\s\S]*?```|~~~[\s\S]*?~~~|`[^`\n]*`/g;

interface TerminologyRule {
  /**
   * Case-insensitive regex source matching the deprecated term core, without
   * boundaries. Use `${horizontalWhitespace}` for internal spaces; alphanumeric
   * boundaries are applied automatically so a rule can never corrupt a longer
   * token like `ASP.NET Aspire` or `.NET AspireX`.
   */
  readonly term: string;
  /** Canonical replacement text. */
  readonly replacement: string;
  /**
   * Indefinite article the replacement should take. Set this only when the
   * replacement's leading sound differs from the term's, so a preceding `a`/`an`
   * is corrected (e.g. `a .NET Aspire` -> `an Aspire`).
   */
  readonly article?: 'a' | 'an';
}

// Adding a rule here normalizes a new term everywhere generated sample and
// integration data is written. Keep this list in sync with the deprecated terms
// in `.github/forbidden-words.json`.
const terminologyRules: readonly TerminologyRule[] = [
  {
    term: String.raw`\.NET${horizontalWhitespace}Aspire`,
    replacement: 'Aspire',
    article: 'an',
  },
  {
    term: String.raw`dotnet${horizontalWhitespace}aspire`,
    replacement: 'Aspire',
    article: 'an',
  },
  {
    term: String.raw`app${horizontalWhitespace}host`,
    replacement: 'AppHost',
  },
];

export function normalizeAspireTerminology(text: string): string;
export function normalizeAspireTerminology(
  text: string | null | undefined
): string | null | undefined;
export function normalizeAspireTerminology(
  text: string | null | undefined
): string | null | undefined {
  if (text == null) {
    return text;
  }

  return normalizeProse(text);
}

// Normalize terminology inside C#/TypeScript code comments. The scanner skips
// string, char, and template literals so their contents and executable code stay
// byte-for-byte identical.
export function normalizeAspireTerminologyInCode(code: string): string;
export function normalizeAspireTerminologyInCode(
  code: string | null | undefined
): string | null | undefined;
export function normalizeAspireTerminologyInCode(
  code: string | null | undefined
): string | null | undefined {
  if (code == null) {
    return code;
  }

  let result = '';
  let lastIndex = 0;
  let index = 0;

  while (index < code.length) {
    const commentEnd = findCommentEnd(code, index);
    if (commentEnd !== undefined) {
      result += code.slice(lastIndex, index);
      result += normalizeProse(code.slice(index, commentEnd));
      lastIndex = commentEnd;
      index = commentEnd;
      continue;
    }

    // Skip complete C#/TypeScript literals so comment-like text inside them is
    // never rewritten. Interpolated literals scan nested expressions to find the
    // real closing delimiter rather than stopping at an expression's string.
    index = findLiteralEnd(code, index) ?? index + 1;
  }

  return result + code.slice(lastIndex);
}

function findCommentEnd(code: string, index: number): number | undefined {
  if (code.startsWith('//', index)) {
    const lineEnd = code.indexOf('\n', index + 2);
    return lineEnd === -1 ? code.length : lineEnd;
  }

  if (code.startsWith('/*', index)) {
    const blockEnd = code.indexOf('*/', index + 2);
    return blockEnd === -1 ? code.length : blockEnd + 2;
  }

  return undefined;
}

function findLiteralEnd(code: string, index: number): number | undefined {
  const rawStringEnd = findCSharpRawStringEnd(code, index);
  if (rawStringEnd !== undefined) {
    return rawStringEnd;
  }

  if (code.startsWith('$@"', index) || code.startsWith('@$"', index)) {
    return findCSharpInterpolatedStringEnd(code, index + 3, true);
  }

  if (code.startsWith('$"', index)) {
    return findCSharpInterpolatedStringEnd(code, index + 2, false);
  }

  if (code.startsWith('@"', index)) {
    return findCSharpVerbatimStringEnd(code, index + 2);
  }

  const delimiter = code[index];
  if (delimiter === '"' || delimiter === "'") {
    return findEscapedStringEnd(code, index + 1, delimiter);
  }

  if (delimiter === '`') {
    return findTypeScriptTemplateEnd(code, index + 1);
  }

  return undefined;
}

function findCSharpRawStringEnd(code: string, index: number): number | undefined {
  let delimiterStart = index;
  while (code[delimiterStart] === '$') {
    delimiterStart++;
  }

  let quoteCount = 0;
  while (code[delimiterStart + quoteCount] === '"') {
    quoteCount++;
  }

  if (quoteCount < 3) {
    return undefined;
  }

  const delimiter = '"'.repeat(quoteCount);
  const closingStart = code.indexOf(delimiter, delimiterStart + quoteCount);
  return closingStart === -1 ? code.length : closingStart + quoteCount;
}

function findCSharpInterpolatedStringEnd(code: string, index: number, verbatim: boolean): number {
  while (index < code.length) {
    if (!verbatim && code[index] === '\\') {
      index += 2;
      continue;
    }

    if (code[index] === '"') {
      if (verbatim && code[index + 1] === '"') {
        index += 2;
        continue;
      }
      return index + 1;
    }

    if (code[index] === '{') {
      if (code[index + 1] === '{') {
        index += 2;
      } else {
        index = findInterpolationExpressionEnd(code, index + 1);
      }
      continue;
    }

    if (code[index] === '}' && code[index + 1] === '}') {
      index += 2;
      continue;
    }

    index++;
  }

  return code.length;
}

function findTypeScriptTemplateEnd(code: string, index: number): number {
  while (index < code.length) {
    if (code[index] === '\\') {
      index += 2;
    } else if (code[index] === '`') {
      return index + 1;
    } else if (code[index] === '$' && code[index + 1] === '{') {
      index = findInterpolationExpressionEnd(code, index + 2);
    } else {
      index++;
    }
  }

  return code.length;
}

function findInterpolationExpressionEnd(code: string, index: number): number {
  let braceDepth = 1;

  while (index < code.length) {
    const commentEnd = findCommentEnd(code, index);
    if (commentEnd !== undefined) {
      index = commentEnd;
      continue;
    }

    const literalEnd = findLiteralEnd(code, index);
    if (literalEnd !== undefined) {
      index = literalEnd;
      continue;
    }

    if (code[index] === '{') {
      braceDepth++;
    } else if (code[index] === '}') {
      braceDepth--;
      if (braceDepth === 0) {
        return index + 1;
      }
    }

    index++;
  }

  return code.length;
}

function findCSharpVerbatimStringEnd(code: string, index: number): number {
  while (index < code.length) {
    if (code[index] !== '"') {
      index++;
    } else if (code[index + 1] === '"') {
      index += 2;
    } else {
      return index + 1;
    }
  }

  return code.length;
}

function findEscapedStringEnd(code: string, index: number, delimiter: string): number {
  while (index < code.length) {
    if (code[index] === '\\') {
      index += 2;
    } else if (code[index] === delimiter) {
      return index + 1;
    } else {
      index++;
    }
  }

  return code.length;
}

// Apply every terminology rule to prose only, copying fenced and inline code
// regions through untouched so sample commands stay runnable.
function normalizeProse(text: string): string {
  let result = '';
  let lastIndex = 0;

  for (const match of text.matchAll(codeRegion)) {
    result += applyRules(text.slice(lastIndex, match.index));
    result += match[0];
    lastIndex = match.index + match[0].length;
  }

  return result + applyRules(text.slice(lastIndex));
}

function applyRules(text: string): string {
  return terminologyRules.reduce(applyRule, text);
}

function applyRule(text: string, rule: TerminologyRule): string {
  const corrected = rule.article ? correctArticle(text, rule, rule.article) : text;
  return corrected.replace(new RegExp(boundedTerm(rule), 'gi'), rule.replacement);
}

// Bound a term core with alphanumeric edges so it can't fuse into a longer token
// while still allowing Markdown wrappers (`_`, `*`, `[`) as boundaries.
function boundedTerm(rule: TerminologyRule): string {
  return `${termStart}${rule.term}${termEnd}`;
}

// Rewrite a preceding indefinite article when the replacement changes the
// leading sound, tolerating Markdown wrappers between the article and the term.
function correctArticle(text: string, rule: TerminologyRule, article: 'a' | 'an'): string {
  const capitalized = article === 'a' ? 'A' : 'An';
  const withArticle = new RegExp(
    String.raw`\b([Aa])${horizontalWhitespace}(${markdownOpeners})` + boundedTerm(rule),
    'gi'
  );
  return text.replace(
    withArticle,
    (_match, matchedArticle: string, opener: string) =>
      `${matchedArticle === 'A' ? capitalized : article} ${opener}${rule.replacement}`
  );
}
