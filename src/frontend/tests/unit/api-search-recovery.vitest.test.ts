import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { runInNewContext } from 'node:vm';
import ts from 'typescript';
import { describe, expect, it, vi } from 'vitest';

const routes = [
  'csharp/index.astro',
  'csharp/[package]/index.astro',
  'csharp/[package]/[type]/index.astro',
  'typescript/index.astro',
  'typescript/[module]/index.astro',
  'typescript/[module]/[item]/index.astro',
];

interface Entry {
  n: string; f: string; ns: string; p: string; s: string; r: string; k: string; v: string;
}
interface Controller {
  index: Entry[];
  activeKinds: Set<string>;
  activeVersions: Set<string> | null;
  findMatches(query: string, kinds?: Set<string>, versions?: Set<string> | null): { entry: Entry; score: number }[];
  search(query: string): void;
}

function createController(route: string) {
  const source = readFileSync(resolve('src/pages/reference/api', route), 'utf8');
  const script = source.slice(source.lastIndexOf('<script>') + '<script>'.length).split('</script>')[0];
  const ast = ts.createSourceFile('controller.ts', script, ts.ScriptTarget.Latest, true);
  const declaration = ast.statements.find(ts.isClassDeclaration)!;
  const { outputText } = ts.transpileModule(
    `${ts.createPrinter().printNode(ts.EmitHint.Unspecified, declaration, ast)}\nexports.Controller = ${declaration.name!.text};`,
    { compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.CommonJS } },
  );
  const exports: { Controller?: { prototype: Controller } } = {};
  runInNewContext(outputText, { exports });
  const controller = Object.create(exports.Controller!.prototype) as Controller;
  const renderEmpty = vi.fn();
  const element = () => ({ style: { display: '' }, textContent: '', innerHTML: '' });
  Object.assign(controller, {
    index: [
      { n: 'RedisNeedle', f: 'Example.RedisNeedle', ns: 'Example', p: 'Package', s: 'Cache', r: 'void', k: 'method', v: '13.6.0' },
      { n: 'MongoOther', f: 'Example.MongoOther', ns: 'Example', p: 'Package', s: 'Database', r: 'void', k: 'property', v: '13.5.0' },
    ],
    activeKinds: new Set(['property']),
    activeVersions: null,
    presentation: { renderEmpty },
    resultsEl: element(), packageList: element(), nsList: element(), countEl: element(), status: element(),
    loadMore: vi.fn(),
  });
  return { controller, renderEmpty };
}

describe.each(routes)('API recovery uses actual matching predicates: %s', route => {
  it('preserves query token AND matching and reports alternatives only for zero results', () => {
    const { controller, renderEmpty } = createController(route);
    const find = vi.spyOn(controller, 'findMatches');
    controller.search('RedisNeedle');
    expect(renderEmpty).toHaveBeenCalledOnce();
    expect(renderEmpty.mock.calls[0][3]).toEqual({ withoutQuery: 1, withoutFilters: 1 });
    expect(find).toHaveBeenCalledTimes(3);
    expect(controller.findMatches('RedisNeedle nonexistent', new Set())).toHaveLength(0);
    find.mockClear();
    renderEmpty.mockClear();
    controller.search('MongoOther');
    expect(find).toHaveBeenCalledOnce();
    expect(renderEmpty).not.toHaveBeenCalled();
  });

  it('keeps useful facets when the query is globally absent', () => {
    const { controller, renderEmpty } = createController(route);
    controller.search('absent-query');
    expect(renderEmpty.mock.calls[0][3]).toEqual({ withoutQuery: 1, withoutFilters: 0 });
    expect(controller.activeKinds).toEqual(new Set(['property']));
  });

  if (route === 'csharp/index.astro' || route === 'typescript/index.astro') {
    it('restores the supported catalog version default instead of retaining selected versions', () => {
      const { controller, renderEmpty } = createController(route);
      controller.activeVersions = new Set(['13.5.0']);
      controller.activeKinds.clear();
      controller.search('RedisNeedle');
      expect(renderEmpty.mock.calls[0][3]).toEqual({ withoutQuery: 1, withoutFilters: 1 });
      expect(controller.activeVersions).toEqual(new Set(['13.5.0']));
    });

    it('requires resetting both when no versions and a globally absent query are selected', () => {
      const { controller, renderEmpty } = createController(route);
      controller.activeVersions = new Set();
      controller.search('absent-query');
      expect(renderEmpty.mock.calls[0][3]).toEqual({ withoutQuery: 0, withoutFilters: 0 });
    });
  }
});
