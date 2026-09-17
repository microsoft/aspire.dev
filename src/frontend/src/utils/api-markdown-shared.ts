export function normalizeBase(base: string): string {
  return base.replace(/\/$/, '');
}

export function finalizeMarkdown(blocks: Array<string | null | undefined | false>): string {
  const markdown = blocks
    .map((block) => (typeof block === 'string' ? block.trim() : ''))
    .filter(Boolean)
    .join('\n\n')
    .replace(/\n{3,}/g, '\n\n');

  return markdown ? `${normalizeMarkdownText(markdown)}\n` : '';
}

export function normalizeMarkdownText(markdown: string): string {
  return markdown
    .replace(/\u00A0/g, ' ')
    .replace(/[ \t]*[·•][ \t]*/g, ' - ')
    .replace(/[ \t]*—[ \t]*/g, ' -- ')
    .replace(/[ \t]*–[ \t]*/g, ' - ')
    .replace(/…/g, '...');
}

export function section(title: string, content?: string | null, level: number = 2): string {
  if (!content?.trim()) {
    return '';
  }

  return `${'#'.repeat(level)} ${title}\n\n${content.trim()}`;
}

export function bulletList(items: Array<string | null | undefined | false>): string {
  return items
    .map((item) => (typeof item === 'string' ? item.trim() : ''))
    .filter(Boolean)
    .join('\n');
}

export function keyValueBullets(
  entries: Array<{ label: string; value?: string | null | undefined }>
): string {
  return bulletList(
    entries
      .filter((entry) => entry.value)
      .map((entry) => `- ${entry.label}: ${entry.value}`)
  );
}

export function dedentText(value: string): string {
  if (!value) {
    return value;
  }

  const normalized = value.replace(/\r\n/g, '\n');
  const lines = normalized.split('\n');

  while (lines.length > 0 && lines[0]?.trim() === '') {
    lines.shift();
  }

  while (lines.length > 0 && lines[lines.length - 1]?.trim() === '') {
    lines.pop();
  }

  let minIndent = Number.POSITIVE_INFINITY;
  for (const line of lines) {
    if (!line.trim()) {
      continue;
    }

    const indent = line.match(/^(\s*)/)?.[1].length ?? 0;
    if (indent < minIndent) {
      minIndent = indent;
    }
  }

  if (!Number.isFinite(minIndent) || minIndent <= 0) {
    return lines.join('\n');
  }

  return lines
    .map((line) => {
      if (!line.trim()) {
        return '';
      }

      return line.slice(minIndent);
    })
    .join('\n');
}

export function codeBlock(code: string, language: string = ''): string {
  return `\`\`\`${language}\n${dedentText(code).trimEnd()}\n\`\`\``;
}

export function indentMarkdown(markdown: string, prefix: string): string {
  return markdown
    .split('\n')
    .map((line) => (line ? `${prefix}${line}` : prefix.trimEnd()))
    .join('\n');
}

export function escapeTableCell(value: string): string {
  // Backslashes are literal inside code spans, but need escaping in prose.
  // Keep existing inline Markdown (including links) rather than escaping its syntax.
  const delimiters = [...value.matchAll(/`+/g)];
  let escaped = '';
  let offset = 0;
  for (let index = 0; index < delimiters.length; index++) {
    const opening = delimiters[index];
    const closingIndex = delimiters.findIndex((delimiter, candidate) =>
      candidate > index && delimiter[0].length === opening[0].length);
    if (closingIndex === -1) continue;

    const closing = delimiters[closingIndex];
    const end = closing.index + closing[0].length;
    escaped += value.slice(offset, opening.index).replace(/\\/g, '\\\\');
    let code = value.slice(opening.index + opening[0].length, closing.index)
      .replace(/\r\n|\r|\n/g, ' ');
    if (code.includes('\\|')) {
      // GFM cannot represent an odd number of literal backslashes before a pipe
      // in a code span. Use encoded HTML code text for this otherwise lossy case.
      if (code.startsWith(' ') && code.endsWith(' ') && code.trim()) {
        code = code.slice(1, -1);
      }
      escaped += `<code>${code.replace(/[^\p{Letter}\p{Number} ]/gu,
        (character) => `&#${character.codePointAt(0)};`)}</code>`;
    } else {
      escaped += `${opening[0]}${code}${closing[0]}`;
    }
    offset = end;
    index = closingIndex;
  }
  escaped += value.slice(offset).replace(/\\/g, '\\\\');
  return escaped.replace(/\|/g, '\\|').replace(/\r\n|\r|\n/g, '<br>');
}

export function link(label: string, href: string): string {
  return `[${label}](${href})`;
}

export function inlineCode(value: string): string {
  return `\`${value}\``;
}

export function markdownResponse(content: string): Response {
  // NOTE: production preview/deployment serves these prerendered `.md` files
  // via a static file server, which infers Content-Type from the file
  // extension (`text/markdown`). This explicit header only takes effect
  // under SSR/dev — we keep it as the canonical signal of what we intend
  // to serve, but consumers like the page-actions "Copy Markdown" button
  // do not depend on the response Content-Type.
  return new Response(content, {
    headers: {
      'Content-Type': 'text/markdown; charset=utf-8',
    },
  });
}