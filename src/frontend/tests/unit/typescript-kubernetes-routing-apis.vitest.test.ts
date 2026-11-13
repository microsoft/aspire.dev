import { readdirSync, readFileSync } from 'node:fs';
import { join, relative } from 'node:path';
import { describe, expect, test } from 'vitest';

// The C# Ingress/Gateway overloads (`WithPath`, `WithRoute`, `WithTls`, ...) are
// exported to TypeScript under distinct capability names such as
// `withIngressPath`, `withGatewayPathRoute`, `withIngressTlsAuto` and
// `withGatewayTlsIssuer`. This guards the TypeScript AppHost samples against
// copying the C# overload names or shapes.

const frontendRoot = join(import.meta.dirname, '../..');
const docsRoot = join(frontendRoot, 'src/content/docs');
const tsModulesRoot = join(frontendRoot, 'src/data/ts-modules');
const localeDirs = new Set([
  'da',
  'de',
  'es',
  'fr',
  'hi',
  'id',
  'it',
  'ja',
  'ko',
  'pt-br',
  'pt-pt',
  'ru',
  'tr',
  'uk',
  'zh-cn',
  'zh-tw',
]);

const routingFactories: Record<string, string> = {
  addIngress: 'Aspire.Hosting.Kubernetes.KubernetesIngressResource',
  addGateway: 'Aspire.Hosting.Kubernetes.KubernetesGatewayResource',
};

type Parameter = { name: string; type: string; isOptional?: boolean };
type TsFunction = { name: string; targetTypeId?: string; parameters?: Parameter[] };
type HandleType = {
  fullName: string;
  implementedInterfaces?: string[];
  baseTypeHierarchy?: string[];
};
type TsModule = { functions: TsFunction[]; handleTypes: HandleType[] };

function loadSurface() {
  const methodsByTarget = new Map<string, Map<string, Parameter[]>>();
  const handleTypes = new Map<string, HandleType>();
  for (const file of readdirSync(tsModulesRoot).filter((name) => name.endsWith('.json'))) {
    const mod = JSON.parse(readFileSync(join(tsModulesRoot, file), 'utf8')) as TsModule;
    for (const handle of mod.handleTypes) handleTypes.set(handle.fullName, handle);
    for (const fn of mod.functions) {
      const target = fn.targetTypeId?.split('/').pop();
      if (!target) continue;
      if (!methodsByTarget.has(target)) methodsByTarget.set(target, new Map());
      methodsByTarget.get(target)!.set(fn.name, fn.parameters ?? []);
    }
  }

  const methodsFor = (fullName: string) => {
    const handle = handleTypes.get(fullName);
    const targets = [
      fullName,
      ...(handle?.implementedInterfaces ?? []),
      ...(handle?.baseTypeHierarchy ?? []),
    ];
    const methods = new Map<string, Parameter[]>();
    for (const target of targets) {
      for (const [name, params] of methodsByTarget.get(target) ?? []) {
        if (!methods.has(name)) methods.set(name, params);
      }
    }
    return methods;
  };

  return methodsFor;
}

function walkDocs(dir: string, depth = 0): string[] {
  return readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    if (entry.isDirectory()) {
      if (depth === 0 && localeDirs.has(entry.name)) return [];
      return walkDocs(join(dir, entry.name), depth + 1);
    }
    return /\.mdx?$/.test(entry.name) ? [join(dir, entry.name)] : [];
  });
}

function typescriptSamples(source: string) {
  const samples: { line: number; code: string }[] = [];
  const lines = source.split('\n');
  for (let index = 0; index < lines.length; index++) {
    const open = /^\s*(`{3,}|~{3,})\s*(?:ts|typescript|tsx)\b/.exec(lines[index]);
    if (!open) continue;
    const start = index + 1;
    const body: string[] = [];
    while (++index < lines.length && lines[index].trim() !== open[1]) body.push(lines[index]);
    samples.push({ line: start, code: body.join('\n') });
  }
  return samples;
}

function splitArgs(args: string) {
  const parts: string[] = [];
  let depth = 0;
  let current = '';
  for (const char of args) {
    if ('([{'.includes(char)) depth++;
    if (')]}'.includes(char)) depth--;
    if (char === ',' && depth === 0) {
      parts.push(current.trim());
      current = '';
    } else {
      current += char;
    }
  }
  if (current.trim()) parts.push(current.trim());
  return parts;
}

describe('TypeScript Kubernetes Ingress and Gateway samples', () => {
  test('call the exported TypeScript AppHost methods with matching argument shapes', () => {
    const methodsFor = loadSurface();
    const problems: string[] = [];
    let calls = 0;

    for (const path of walkDocs(docsRoot)) {
      const page = relative(docsRoot, path);
      for (const sample of typescriptSamples(readFileSync(path, 'utf8'))) {
        const resourceVariables = new Set(
          [
            ...sample.code.matchAll(
              /\b(?:const|let)\s+(\w+)\s*=\s*(?:await\s+)?[\w.]+\.add[A-Z]\w*\(/g
            ),
          ].map(([, name]) => name)
        );
        const routingVariables = new Map<string, string>();
        for (const [, name, factory] of sample.code.matchAll(
          /\b(?:const|let)\s+(\w+)\s*=\s*await\s+\w+\.(addIngress|addGateway)\(/g
        )) {
          routingVariables.set(name, routingFactories[factory]);
        }

        for (const [name, typeName] of routingVariables) {
          const methods = methodsFor(typeName);
          for (const match of sample.code.matchAll(
            new RegExp(String.raw`^\s*(?:await\s+)?${name}\.(\w+)\((.*)\);?\s*$`, 'gm')
          )) {
            calls++;
            const [, method, rawArgs] = match;
            const location = `${page}:${sample.line + sample.code.slice(0, match.index).split('\n').length}`;
            const params = methods.get(method);
            if (!params) {
              problems.push(
                `${location}: ${method} is not exported for ${typeName.split('.').pop()}`
              );
              continue;
            }
            const args = splitArgs(rawArgs);
            const required = params.filter((param) => !param.isOptional).length;
            if (args.length < required) {
              problems.push(
                `${location}: ${method} expects ${required} argument(s) but got ${args.length}`
              );
            }
            args.forEach((arg, index) => {
              if (params[index]?.type === 'string' && resourceVariables.has(arg)) {
                problems.push(`${location}: ${method} expects a string but got resource ${arg}`);
              }
            });
          }
        }
      }
    }

    expect(calls).toBeGreaterThan(0);
    expect(problems).toEqual([]);
  });
});
