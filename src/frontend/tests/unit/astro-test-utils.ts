import { experimental_AstroContainer as AstroContainer } from 'astro/container';

type Translator = ((key: string) => string) & { dir: () => 'ltr' };

export interface StarlightRoute {
  editUrl: string;
  entry: {
    id: string;
    slug: string;
    filePath: string;
    data: Record<string, unknown>;
  };
}

interface TestLocals {
  t: Translator;
  starlightRoute: StarlightRoute;
  [key: string]: unknown;
}

interface RenderOptions {
  props?: Record<string, unknown>;
  slots?: Record<string, string>;
  requestUrl?: string;
  locals?: Partial<TestLocals>;
}

type AstroRenderable = Parameters<AstroContainer['renderToString']>[0];

let containerPromise: Promise<AstroContainer> | undefined;

function createTranslator(overrides: Record<string, string> = {}): Translator {
  const translator = ((key: string) => overrides[key] ?? String(key)) as Translator;
  translator.dir = () => 'ltr';
  return translator;
}

function createStarlightRoute(): StarlightRoute {
  return {
    editUrl:
      'https://github.com/microsoft/aspire.dev/edit/main/src/frontend/src/content/docs/test.mdx',
    entry: {
      id: 'docs/test',
      slug: 'test',
      filePath: 'src/content/docs/test.mdx',
      data: {},
    },
  };
}

export async function renderComponent(
  Component: AstroRenderable,
  {
    props = {},
    slots = {},
    requestUrl = 'https://aspire.dev/test/',
    locals = {},
  }: RenderOptions = {}
): Promise<string> {
  if (!containerPromise) {
    containerPromise = AstroContainer.create();
  }

  const container = await containerPromise;
  const defaultLocals = {
    t: createTranslator(),
    starlightRoute: createStarlightRoute(),
  } satisfies TestLocals;

  const mergedLocals: TestLocals = {
    ...defaultLocals,
    ...locals,
    t: locals.t ?? defaultLocals.t,
    starlightRoute: locals.starlightRoute ?? defaultLocals.starlightRoute,
  };

  if (typeof mergedLocals.t === 'function' && typeof mergedLocals.t.dir !== 'function') {
    mergedLocals.t.dir = () => 'ltr';
  }

  return container.renderToString(Component, {
    props,
    slots,
    request: new Request(requestUrl),
    locals: mergedLocals,
  });
}

export function normalizeHtml(html: string): string {
  return html.replace(/\s+/g, ' ').trim();
}
