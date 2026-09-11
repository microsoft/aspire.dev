import { createProcessor } from '@mdx-js/mdx';
import type { ApiReferenceDiagnostic, ApiReferenceIndex } from './api-reference-core';

export interface ApiReferenceSourceFile {
  path: string;
  content: string;
}

export interface ApiReferenceUsageDiagnostic extends ApiReferenceDiagnostic {
  filePath: string;
  line: number;
  name?: string;
  packageName?: string;
}

interface SyntaxNode {
  type: string;
  name?: string | null;
  attributes?: unknown[];
  children?: unknown[];
  value?: unknown;
  data?: {
    estree?: unknown;
  };
  position?: {
    start?: {
      line?: number;
    };
  };
}

interface ApiReferenceSyntax {
  line: number;
  attributes: SourceAttribute[];
}

interface SourceAttribute {
  name?: string;
  value?: string;
  spread: boolean;
}

interface ResolvedAttribute {
  present: boolean;
  value?: string;
}

const mdxProcessor = createProcessor({ format: 'mdx' });

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null;
}

function isUnknownArray(value: unknown): value is unknown[] {
  return Array.isArray(value);
}

function isSyntaxNode(value: unknown): value is SyntaxNode {
  return isRecord(value) && typeof value.type === 'string';
}

function readStaticStringExpression(value: unknown): string | undefined {
  if (!isRecord(value)) return undefined;
  if (value.type === 'Literal' && typeof value.value === 'string') {
    return value.value;
  }
  if (value.type === 'ParenthesizedExpression') {
    return readStaticStringExpression(value.expression);
  }
  if (
    value.type === 'TemplateLiteral' &&
    isUnknownArray(value.expressions) &&
    value.expressions.length === 0 &&
    isUnknownArray(value.quasis) &&
    value.quasis.length === 1
  ) {
    const quasi = value.quasis[0];
    if (!isRecord(quasi) || !isRecord(quasi.value)) return undefined;
    const cooked = quasi.value.cooked;
    return typeof cooked === 'string' ? cooked : undefined;
  }
  return undefined;
}

function readStaticStringProgram(value: unknown): string | undefined {
  if (!isRecord(value) || value.type !== 'Program' || !isUnknownArray(value.body)) {
    return undefined;
  }
  if (value.body.length !== 1 || !isRecord(value.body[0])) return undefined;
  const statement = value.body[0];
  return statement.type === 'ExpressionStatement'
    ? readStaticStringExpression(statement.expression)
    : undefined;
}

function readMdxAttribute(value: unknown): SourceAttribute | undefined {
  if (!isRecord(value)) return undefined;
  if (value.type === 'mdxJsxExpressionAttribute') {
    return { spread: true };
  }
  if (value.type !== 'mdxJsxAttribute' || typeof value.name !== 'string') {
    return undefined;
  }

  if (typeof value.value === 'string') {
    return { name: value.name, value: value.value, spread: false };
  }

  const expressionValue = isRecord(value.value) ? value.value : undefined;
  const data = expressionValue && isRecord(expressionValue.data) ? expressionValue.data : undefined;
  return {
    name: value.name,
    value: readStaticStringProgram(data?.estree),
    spread: false,
  };
}

function readJsxAttribute(value: unknown): SourceAttribute | undefined {
  if (!isRecord(value)) return undefined;
  if (value.type === 'JSXSpreadAttribute') {
    return { spread: true };
  }
  if (value.type !== 'JSXAttribute' || !isRecord(value.name)) {
    return undefined;
  }

  const name = value.name.type === 'JSXIdentifier' ? value.name.name : undefined;
  if (typeof name !== 'string') return undefined;

  if (isRecord(value.value) && value.value.type === 'Literal') {
    return {
      name,
      value: typeof value.value.value === 'string' ? value.value.value : undefined,
      spread: false,
    };
  }

  const expression =
    isRecord(value.value) && value.value.type === 'JSXExpressionContainer'
      ? value.value.expression
      : undefined;
  return {
    name,
    value: readStaticStringExpression(expression),
    spread: false,
  };
}

function resolveAttribute(attributes: readonly SourceAttribute[], name: string): ResolvedAttribute {
  for (let index = attributes.length - 1; index >= 0; index--) {
    const attribute = attributes[index];
    if (attribute.spread) return { present: true };
    if (attribute.name === name) return { present: true, value: attribute.value };
  }
  return { present: false };
}

function findApiReferenceNodes(content: string): ApiReferenceSyntax[] {
  const root = mdxProcessor.parse(content);
  const matches: ApiReferenceSyntax[] = [];
  const seenEstreeNodes = new WeakSet<object>();

  const visitEstree = (value: unknown): void => {
    if (isUnknownArray(value)) {
      for (const item of value) visitEstree(item);
      return;
    }
    if (!isRecord(value)) return;
    if (seenEstreeNodes.has(value)) return;
    seenEstreeNodes.add(value);

    if (value.type === 'JSXElement' && isRecord(value.openingElement)) {
      const openingElement = value.openingElement;
      const elementName = isRecord(openingElement.name) ? openingElement.name : undefined;
      if (elementName?.type === 'JSXIdentifier' && elementName.name === 'ApiReference') {
        const loc = isRecord(value.loc) && isRecord(value.loc.start) ? value.loc.start : undefined;
        matches.push({
          line: typeof loc?.line === 'number' ? loc.line : 1,
          attributes: isUnknownArray(openingElement.attributes)
            ? openingElement.attributes.flatMap((attribute) => {
                const parsed = readJsxAttribute(attribute);
                return parsed ? [parsed] : [];
              })
            : [],
        });
      }
    }

    for (const child of Object.values(value)) {
      visitEstree(child);
    }
  };

  const visit = (value: unknown): void => {
    if (!isSyntaxNode(value)) return;
    if (
      (value.type === 'mdxJsxFlowElement' || value.type === 'mdxJsxTextElement') &&
      value.name === 'ApiReference'
    ) {
      matches.push({
        line: value.position?.start?.line ?? 1,
        attributes: (value.attributes ?? []).flatMap((attribute) => {
          const parsed = readMdxAttribute(attribute);
          return parsed ? [parsed] : [];
        }),
      });
    }
    visitEstree(value.data?.estree);
    for (const attribute of value.attributes ?? []) {
      visit(attribute);
    }
    visit(value.value);
    for (const child of value.children ?? []) {
      visit(child);
    }
  };

  visit(root);
  return matches;
}

export function validateApiReferenceSource(
  file: ApiReferenceSourceFile,
  index: ApiReferenceIndex
): ApiReferenceUsageDiagnostic[] {
  const diagnostics: ApiReferenceUsageDiagnostic[] = [];

  for (const node of findApiReferenceNodes(file.content)) {
    const nameAttribute = resolveAttribute(node.attributes, 'name');
    const name = nameAttribute.value;
    const packageAttribute = resolveAttribute(node.attributes, 'package');
    const packageName = packageAttribute.value;

    if (!name) {
      diagnostics.push({
        filePath: file.path,
        line: node.line,
        code: 'invalid-fqn',
        severity: 'error',
        message:
          'ApiReference: the name prop must be a static, canonical fully qualified API member name.',
        candidates: [],
      });
      continue;
    }

    if (packageAttribute.present && !packageName) {
      diagnostics.push({
        filePath: file.path,
        line: node.line,
        name,
        code: 'invalid-fqn',
        severity: 'error',
        message: 'ApiReference: the package prop must be a static package name.',
        candidates: [],
      });
      continue;
    }

    const resolution = index.resolve(name, packageName);
    diagnostics.push(
      ...resolution.diagnostics.map((diagnostic) => ({
        ...diagnostic,
        filePath: file.path,
        line: node.line,
        name,
        packageName,
      }))
    );
  }

  return diagnostics;
}

export function validateApiReferenceFiles(
  files: readonly ApiReferenceSourceFile[],
  index: ApiReferenceIndex
): ApiReferenceUsageDiagnostic[] {
  return files
    .flatMap((file) => validateApiReferenceSource(file, index))
    .sort(
      (left, right) =>
        left.filePath.localeCompare(right.filePath) ||
        left.line - right.line ||
        left.severity.localeCompare(right.severity)
    );
}

export function formatApiReferenceDiagnostics(
  diagnostics: readonly ApiReferenceUsageDiagnostic[]
): string {
  return diagnostics
    .map((diagnostic) => {
      const candidates =
        diagnostic.candidates.length > 0
          ? `\n  Candidates:\n${diagnostic.candidates
              .map((candidate) => `    - ${candidate}`)
              .join('\n')}`
          : '';
      return `${diagnostic.filePath}:${diagnostic.line} [${diagnostic.severity}] ${diagnostic.message}${candidates}`;
    })
    .join('\n');
}
