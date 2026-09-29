import { readFileSync } from 'node:fs';
import { runInNewContext } from 'node:vm';
import { expect, test, vi } from 'vitest';

const head = readFileSync(
  new URL('../../src/components/starlight/Head.astro', import.meta.url),
  'utf8'
);
const script = [...head.matchAll(/<script is:inline>([\s\S]*?)<\/script>/g)].find((match) =>
  match[1].includes('var appHostLangLabels')
)?.[1];
if (!script) throw new Error('Navigation preference initializer not found.');

function root() {
  const attributes = new Map<string, string>();
  return {
    attributes,
    setAttribute: (name: string, value: string) => attributes.set(name, value),
    toggleAttribute(name: string, present: boolean) {
      if (present) attributes.set(name, '');
      else attributes.delete(name);
    },
  };
}

test('restores destination preferences before sidebar initialization without duplicating listeners', () => {
  const stored = new Map([
    ['aspire-lang', 'csharp'],
    ['api-sidebar-collapsed', '1'],
    ['topic-sidebar-collapsed', '1'],
  ]);
  const events = new EventTarget();
  const document = {
    documentElement: root(),
    readyState: 'complete',
    addEventListener: vi.fn(events.addEventListener.bind(events)),
  };
  const window = { location: new URL('https://aspire.dev/reference/api/csharp/') };
  const context = {
    document,
    window,
    URL,
    localStorage: {
      getItem: (key: string) => stored.get(key) ?? null,
      setItem: (key: string, value: string) => stored.set(key, value),
    },
  };
  runInNewContext(script, context);
  runInNewContext(script, context);
  expect(
    document.addEventListener.mock.calls.filter(([type]) => type === 'astro:before-swap')
  ).toHaveLength(1);
  expect(document.documentElement.attributes.get('data-apphost-lang')).toBe('csharp');

  for (const [path, language, apiCollapsed, topicCollapsed] of [
    ['/reference/api/typescript/', 'csharp', true, false],
    ['/get-started/app-host/?aspire-lang=typescript', 'typescript', false, true],
    ['/reference/api/csharp/', 'typescript', true, false],
  ] as const) {
    const nextRoot = root();
    nextRoot.setAttribute('data-theme', 'dark');
    const event = Object.assign(new Event('astro:before-swap'), {
      newDocument: { documentElement: nextRoot },
      to: new URL(path, 'https://aspire.dev'),
    });
    events.dispatchEvent(event);
    expect(nextRoot.attributes.get('data-apphost-lang')).toBe(language);
    expect(nextRoot.attributes.has('data-sidebar-collapsed')).toBe(apiCollapsed);
    expect(nextRoot.attributes.has('data-topic-sidebar-collapsed')).toBe(topicCollapsed);
    expect(nextRoot.attributes.get('data-theme')).toBe('dark');
    expect(event.defaultPrevented).toBe(false);
  }
  expect(stored.get('starlight-synced-tabs__aspire-lang')).toBe('TypeScript');
});

test('keeps explicit destination language usable when browser storage is unavailable', () => {
  const events = new EventTarget();
  const nextRoot = root();
  runInNewContext(script, {
    URL,
    window: { location: new URL('https://aspire.dev/') },
    document: {
      documentElement: root(),
      readyState: 'complete',
      addEventListener: events.addEventListener.bind(events),
    },
    localStorage: {
      getItem() {
        throw new DOMException('Storage blocked', 'SecurityError');
      },
      setItem() {
        throw new DOMException('Storage blocked', 'SecurityError');
      },
    },
  });
  events.dispatchEvent(
    Object.assign(new Event('astro:before-swap'), {
      newDocument: { documentElement: nextRoot },
      to: new URL('https://aspire.dev/get-started/app-host/?aspire-lang=csharp'),
    })
  );
  expect(nextRoot.attributes.get('data-apphost-lang')).toBe('csharp');
});
