import type {
  ApiReferenceDiagnostic,
  ApiReferenceDiagnosticCode,
  ApiReferenceTarget,
} from '../api-reference-core';

export interface ApiLanguageProvider<TDocument, TIndex> {
  readonly id: string;
  buildIndex(documents: readonly TDocument[]): TIndex;
}

export interface PrimaryLanguageProvider<TDocument, TIndex, TCandidate> extends ApiLanguageProvider<
  TDocument,
  TIndex
> {
  readonly role: 'primary';
  readonly displayName: string;
  readonly code: {
    readonly missing: ApiReferenceDiagnosticCode;
    readonly ambiguous: ApiReferenceDiagnosticCode;
  };
  enumerate(index: TIndex): Iterable<PrimaryCandidateGroup<TCandidate>>;
  lookup(index: TIndex, name: string, packageName?: string): TCandidate[];
  matchOverload(candidates: readonly TCandidate[], parameterTypes: readonly string[]): TCandidate[];
  createTarget(candidate: TCandidate, options: { exactOverload: boolean }): ApiReferenceTarget;
  describeCandidate(candidate: TCandidate): string;
  suggestionsFor(index: TIndex, name: string): string[];
  exportMappings(candidate: TCandidate): ExportMapping[];
  packageOf(candidate: TCandidate): string;
  fqnOf(candidate: TCandidate): string;
  /**
   * Canonical, language-neutral member name for cross-language matching
   * (for example, `addwidget` for a C# `AddWidget` member). Used by target
   * providers to prefer the natural mapping over `[AspireExport(MethodName)]`
   * overrides so a method-group reference does not silently pick an
   * arbitrary export when a member declares several.
   */
  canonicalMemberName(candidate: TCandidate): string;
}

export interface TargetLanguageProvider<TDocument, TIndex> extends ApiLanguageProvider<
  TDocument,
  TIndex
> {
  readonly role: 'target';
  resolveTarget(
    context: PrimaryResolutionContext,
    primaryTarget: ApiReferenceTarget,
    index: TIndex,
    options: { exactOverload: boolean }
  ): { target: ApiReferenceTarget; diagnostics: ApiReferenceDiagnostic[] };
}

export interface ExportMapping {
  capabilityId?: string;
  methodName: string;
  required: boolean;
  allowUntargeted: boolean;
  declaringTypeNames: readonly string[];
  isExtension: boolean;
}

export interface PrimaryResolutionContext {
  fqn: string;
  packageName: string;
  /**
   * Canonical, language-neutral member name from the primary provider
   * (see {@link PrimaryLanguageProvider.canonicalMemberName}). Target
   * providers should prefer routes matching this name over routes picked
   * up via `[AspireExport(MethodName)]` overrides in {@link mappings}.
   */
  canonicalName: string;
  mappings: readonly ExportMapping[];
  describe(): string;
}

export interface PrimaryCandidateGroup<TCandidate> {
  fqn: string;
  matchesByPackage: ReadonlyMap<string, readonly TCandidate[]>;
  allMatches: readonly TCandidate[];
}
