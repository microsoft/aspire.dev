import type { TsRouteParameterLike } from './ts-api-routes';
import { CSharpLanguageProvider } from './api-reference/csharp-provider';
import { ApiReferenceProviderRegistry } from './api-reference/registry';
import { TypeScriptLanguageProvider } from './api-reference/typescript-provider';

export interface ApiReferenceAttribute {
  name: string;
  constructorArguments?: unknown[];
  arguments?: Record<string, unknown>;
  namedArguments?: Record<string, unknown>;
}

export interface ApiReferenceParameter {
  name?: string;
  type: string;
  modifier?: string;
}

export interface ApiReferenceMember {
  name: string;
  kind?: string;
  signature?: string;
  genericParameters?: { name: string; constraints?: string[] }[];
  parameters?: ApiReferenceParameter[];
  attributes?: ApiReferenceAttribute[];
  isStatic?: boolean;
  isExtension?: boolean;
  docs?: { summary?: unknown };
}

export interface ApiReferenceDocNode {
  kind: string;
  text?: string;
  value?: string;
  children?: ApiReferenceDocNode[];
}

export interface ApiReferenceType {
  name: string;
  fullName?: string;
  namespace?: string;
  genericParameters?: { name: string; constraints?: string[] }[];
  attributes?: ApiReferenceAttribute[];
  members?: ApiReferenceMember[];
}

export interface ApiReferencePackageDocument {
  package: {
    name: string;
  };
  types?: ApiReferenceType[];
}

export interface ApiReferenceTsCallable {
  name: string;
  description?: string;
  kind?: string;
  capabilityId?: string;
  qualifiedName?: string;
  signature?: string;
  targetTypeId?: string;
  expandedTargetTypes?: string[];
  parameters?: (TsRouteParameterLike & { isOptional?: boolean })[];
}

export interface ApiReferenceTsHandle {
  name: string;
  fullName?: string;
  capabilities?: ApiReferenceTsCallable[];
}

export interface ApiReferenceTsDocument {
  package: {
    name: string;
  };
  functions?: ApiReferenceTsCallable[];
  handleTypes?: ApiReferenceTsHandle[];
  dtoTypes?: { name: string; fullName?: string }[];
  enumTypes?: { name: string; fullName?: string }[];
}

export interface ApiReferenceTarget {
  label: string;
  path?: string;
  description?: string;
}

export type ApiReferenceDiagnosticCode =
  | 'unsupported-spread'
  | 'invalid-fqn'
  | 'missing-csharp'
  | 'ambiguous-csharp'
  | 'invalid-overload'
  | 'missing-overload'
  | 'ambiguous-overload'
  | 'missing-typescript'
  | 'unresolved-typescript-export'
  | 'ambiguous-typescript';

export interface ApiReferenceDiagnostic {
  code: ApiReferenceDiagnosticCode;
  severity: 'error' | 'warning';
  message: string;
  candidates: string[];
}

export interface ApiReferenceResolution {
  name: string;
  status: 'resolved' | 'missing' | 'ambiguous';
  primaryLanguage?: string;
  targets?: Record<string, ApiReferenceTarget>;
  diagnostics: ApiReferenceDiagnostic[];
  csharp: ApiReferenceTarget;
  typescript: ApiReferenceTarget;
}

export interface ApiReferenceIndex {
  readonly size: number;
  resolve(
    name: string,
    packageName?: string,
    parameterTypes?: readonly string[]
  ): ApiReferenceResolution;
}

export const API_REFERENCE_FQN_PATTERN = /^[A-Za-z_][A-Za-z0-9_]*(?:\.[A-Za-z_][A-Za-z0-9_]*)+$/;

export function buildApiReferenceIndex(
  packages: readonly ApiReferencePackageDocument[],
  modules: readonly ApiReferenceTsDocument[]
): ApiReferenceIndex {
  return new ApiReferenceProviderRegistry(new CSharpLanguageProvider(), [
    new TypeScriptLanguageProvider(),
  ]).build({
    csharp: packages,
    typescript: modules,
  });
}
