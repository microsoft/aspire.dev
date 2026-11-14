// Static evaluation of JSX attribute expressions and their emission as Liquid argument values.
//
// Fluid (the Liquid engine of Douze) has no array or object literals: a tag argument is a string, a number, true,
// false, nil, or a variable path. Arrays and objects are therefore written to the page's front matter under `props`
// (`props: { pivot_selector_options: [...] }`) and the argument references them (`options: props.pivot_selector_options`).

import { acorn } from './deps.ts';

/** A reference to site data (a JSON import), emitted as a Liquid variable path. */
export class DataRef {
  constructor(public readonly path: string) {}
}

export type Value = string | number | boolean | null | undefined | DataRef | Value[] | { [key: string]: Value };

export interface Binding {
  kind: 'component' | 'image' | 'data' | 'raw' | 'module' | 'value';
  /** component: the imported (exported) name; image: the url; data: the data key; raw/module: the source. */
  value: string;
  /** kind 'value': a constant (an `export const` of the page, or an export of a site data module). */
  constant?: unknown;
  local: string;
  source: string;
}

export class EvalError extends Error {}

/** Evaluates an estree expression node statically. */
export function evaluate(node: any, bindings: Map<string, Binding>): Value {
  switch (node.type) {
    case 'Literal':
      if (node.regex || typeof node.value === 'bigint') throw new EvalError('regular expression or bigint literal');
      return node.value;
    case 'TemplateLiteral':
      if (node.expressions.length > 0) throw new EvalError('template literal with substitutions');
      return node.quasis.map((q: any) => q.value.cooked).join('');
    case 'ArrayExpression':
      return node.elements.map((e: any) => {
        if (!e || e.type === 'SpreadElement') throw new EvalError('array hole or spread');
        return evaluate(e, bindings);
      });
    case 'ObjectExpression': {
      const o: Record<string, Value> = {};
      for (const p of node.properties) {
        if (p.type !== 'Property' || p.computed || p.kind !== 'init') throw new EvalError('computed, spread or accessor property');
        const key = p.key.type === 'Identifier' ? p.key.name : String(p.key.value);
        o[key] = evaluate(p.value, bindings);
      }
      return o;
    }
    case 'UnaryExpression': {
      const v = evaluate(node.argument, bindings);
      if (node.operator === '-' && typeof v === 'number') return -v;
      if (node.operator === '+' && typeof v === 'number') return v;
      if (node.operator === '!' && typeof v === 'boolean') return !v;
      throw new EvalError(`unary ${node.operator}`);
    }
    case 'Identifier': {
      if (node.name === 'undefined') return undefined;
      const b = bindings.get(node.name);
      if (b?.kind === 'image') return b.value;
      if (b?.kind === 'data') return new DataRef(b.value);
      if (b?.kind === 'value') return fromPlain(b.constant, node.name);
      throw new EvalError(b ? `identifier '${node.name}' imported from '${b.source}'` : `identifier '${node.name}'`);
    }
    case 'MemberExpression': {
      const parts: string[] = [];
      let n = node;
      while (n.type === 'MemberExpression') {
        if (n.computed) {
          if (n.property.type !== 'Literal') throw new EvalError('computed member access');
          parts.unshift(String(n.property.value));
        } else parts.unshift(n.property.name);
        n = n.object;
      }
      if (n.type !== 'Identifier') throw new EvalError('member access on an expression');
      const b = bindings.get(n.name);
      if (b?.kind === 'data') return new DataRef([b.value, ...parts].join('.'));
      if (b?.kind === 'value') {
        let v: any = b.constant;
        for (const p of parts) {
          if (v === null || typeof v !== 'object' || !(p in v)) throw new EvalError(`'${n.name}.${parts.join('.')}' is not defined`);
          v = v[p];
        }
        return fromPlain(v, `${n.name}.${parts.join('.')}`);
      }
      throw new EvalError(b ? `member of '${n.name}' imported from '${b.source}'` : `member of identifier '${n.name}'`);
    }
    case 'ParenthesizedExpression':
      return evaluate(node.expression, bindings);
    default:
      throw new EvalError(node.type);
  }
}

/**
 * Evaluates an expression. The source text is parsed again with acorn when it is given: MDX strips the indentation
 * of continuation lines from the expression it hands over, which matters for multi-line template literals (code).
 */
export function evaluateExpression(value: any, bindings: Map<string, Binding>, source?: string): Value {
  if (source !== undefined) {
    let parsed: any;
    try {
      parsed = acorn.parseExpressionAt(source, 0, { ecmaVersion: 'latest', sourceType: 'module' });
    } catch {
      parsed = undefined;
    }
    if (parsed && source.slice(parsed.end).trim() === '') return evaluate(parsed, bindings);
  }
  let expr = value.data?.estree?.body?.[0]?.expression;
  if (!expr) expr = acorn.parseExpressionAt(String(value.value ?? ''), 0, { ecmaVersion: 'latest', sourceType: 'module' });
  return evaluate(expr, bindings);
}

/** A constant read from a module, when it is plain data. */
export function fromPlain(v: unknown, name: string): Value {
  if (v === null || v === undefined || typeof v === 'string' || typeof v === 'number' || typeof v === 'boolean') return v as Value;
  if (Array.isArray(v)) return v.map((x, i) => fromPlain(x, `${name}[${i}]`));
  if (typeof v === 'object' && Object.getPrototypeOf(v) === Object.prototype)
    return Object.fromEntries(Object.entries(v).map(([k, x]) => [k, fromPlain(x, `${name}.${k}`)]));
  throw new EvalError(`'${name}' is not plain data`);
}

export function containsDataRef(v: Value): boolean {
  if (v instanceof DataRef) return true;
  if (Array.isArray(v)) return v.some(containsDataRef);
  if (v && typeof v === 'object') return Object.values(v).some(containsDataRef);
  return false;
}

/** Converts a Value to plain JSON for YAML (data refs must have been rejected before). */
export function toPlain(v: Value): unknown {
  if (Array.isArray(v)) return v.map(toPlain);
  if (v instanceof DataRef) return v.path;
  if (v && typeof v === 'object') return Object.fromEntries(Object.entries(v).filter(([, x]) => x !== undefined).map(([k, x]) => [k, toPlain(x)]));
  return v;
}

/**
 * A Liquid string literal. Fluid string literals have no portable escape sequence, so the quote that does not occur
 * in the text is used; newlines (attribute values wrapped over lines) are folded to a space.
 */
export function liquidString(s: string): { text: string; ok: boolean } {
  const t = s.replace(/[ \t]*\r?\n[ \t]*/g, ' ');
  if (!t.includes('"')) return { text: `"${t}"`, ok: true };
  if (!t.includes("'")) return { text: `'${t}'`, ok: true };
  return { text: `"${t.replace(/"/g, '&quot;')}"`, ok: false };
}

/** camelCase, kebab-case and `class:list` style names to snake_case. */
export function snakeCase(name: string): string {
  return name
    .replace(/([a-z0-9])([A-Z])/g, '$1_$2')
    .replace(/([A-Z]+)([A-Z][a-z])/g, '$1_$2')
    .replace(/[^A-Za-z0-9]+/g, '_')
    .toLowerCase();
}
