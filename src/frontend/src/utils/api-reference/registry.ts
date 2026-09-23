import {
  API_REFERENCE_FQN_PATTERN,
  type ApiReferenceDiagnostic,
  type ApiReferenceIndex,
  type ApiReferenceResolution,
  type ApiReferenceTarget,
} from '../api-reference-core';
import type {
  PrimaryLanguageProvider,
  PrimaryResolutionContext,
  TargetLanguageProvider,
} from './language-provider';

function fallbackTarget(name: string): ApiReferenceTarget {
  const label = name.slice(name.lastIndexOf('.') + 1) || name || 'Unknown API';
  return { label };
}

export class ApiReferenceProviderRegistry<TPrimaryDocument, TPrimaryIndex, TCandidate> {
  constructor(
    private readonly primary: PrimaryLanguageProvider<TPrimaryDocument, TPrimaryIndex, TCandidate>,
    private readonly targets: readonly TargetLanguageProvider<unknown, unknown>[]
  ) {}

  build(documentsByProvider: Record<string, readonly unknown[]>): ApiReferenceIndex {
    const primaryIndex = this.primary.buildIndex(
      (documentsByProvider[this.primary.id] ?? []) as readonly TPrimaryDocument[]
    );
    const targetIndexes = new Map<string, unknown>();
    for (const target of this.targets) {
      targetIndexes.set(target.id, target.buildIndex(documentsByProvider[target.id] ?? []));
    }

    const resolutions = new Map<string, ApiReferenceResolution>();
    const packageResolutions = new Map<string, ApiReferenceResolution>();

    const withAliases = (
      name: string,
      status: ApiReferenceResolution['status'],
      targets: Record<string, ApiReferenceTarget>,
      diagnostics: ApiReferenceDiagnostic[]
    ): ApiReferenceResolution => {
      const csharp = targets.csharp ?? fallbackTarget(name);
      const typescript = targets.typescript ?? csharp;
      return {
        name,
        status,
        primaryLanguage: this.primary.id,
        targets,
        csharp,
        typescript,
        diagnostics,
      };
    };

    const fallbackResolution = (
      name: string,
      status: ApiReferenceResolution['status'],
      diagnostics: ApiReferenceDiagnostic[]
    ): ApiReferenceResolution => {
      const fallback = fallbackTarget(name);
      const targets: Record<string, ApiReferenceTarget> = {
        [this.primary.id]: fallback,
      };
      for (const target of this.targets) {
        targets[target.id] = fallback;
      }
      return withAliases(name, status, targets, diagnostics);
    };

    const resolvedResolution = (
      candidate: TCandidate,
      exactOverload: boolean
    ): ApiReferenceResolution => {
      const primaryTarget = this.primary.createTarget(candidate, { exactOverload });
      const context: PrimaryResolutionContext = {
        fqn: this.primary.fqnOf(candidate),
        packageName: this.primary.packageOf(candidate),
        canonicalName: this.primary.canonicalMemberName(candidate),
        mappings: this.primary.exportMappings(candidate),
        describe: () => this.primary.describeCandidate(candidate),
      };
      const targets: Record<string, ApiReferenceTarget> = {
        [this.primary.id]: primaryTarget,
      };
      const diagnostics: ApiReferenceDiagnostic[] = [];
      for (const targetProvider of this.targets) {
        const resolved = targetProvider.resolveTarget(
          context,
          primaryTarget,
          targetIndexes.get(targetProvider.id),
          { exactOverload }
        );
        targets[targetProvider.id] = resolved.target;
        diagnostics.push(...resolved.diagnostics);
      }
      return withAliases(context.fqn, 'resolved', targets, diagnostics);
    };

    for (const group of this.primary.enumerate(primaryIndex)) {
      const matches = group.allMatches;
      for (const [packageName, packageMatches] of group.matchesByPackage) {
        if (packageMatches.length > 1) {
          packageResolutions.set(
            `${packageName}\0${group.fqn}`,
            fallbackResolution(group.fqn, 'ambiguous', [
              {
                code: this.primary.code.ambiguous,
                severity: 'error',
                message: `ApiReference: "${group.fqn}" resolves to multiple generated ${this.primary.displayName} API members in package "${packageName}".`,
                candidates: packageMatches
                  .map((candidate) => this.primary.describeCandidate(candidate))
                  .sort(),
              },
            ])
          );
          continue;
        }

        const match = packageMatches[0];
        packageResolutions.set(`${packageName}\0${group.fqn}`, resolvedResolution(match, false));
      }

      if (matches.length > 1) {
        resolutions.set(
          group.fqn,
          fallbackResolution(group.fqn, 'ambiguous', [
            {
              code: this.primary.code.ambiguous,
              severity: 'error',
              message: `ApiReference: "${group.fqn}" resolves to multiple generated ${this.primary.displayName} API members.`,
              candidates: matches
                .map((candidate) => this.primary.describeCandidate(candidate))
                .sort(),
            },
          ])
        );
        continue;
      }

      resolutions.set(
        group.fqn,
        packageResolutions.get(`${this.primary.packageOf(matches[0])}\0${group.fqn}`)!
      );
    }

    const missingResolutions = new Map<string, ApiReferenceResolution>();
    const overloadResolutions = new Map<string, ApiReferenceResolution>();

    return {
      size: packageResolutions.size,
      resolve: (
        name: string,
        packageName?: string,
        parameterTypes?: readonly string[]
      ): ApiReferenceResolution => {
        if (parameterTypes !== undefined) {
          const cacheKey = JSON.stringify([name, packageName, parameterTypes]);
          const cached = overloadResolutions.get(cacheKey);
          if (cached) return cached;

          const groups = this.primary.lookup(primaryIndex, name, packageName);
          const matches = this.primary.matchOverload(groups, parameterTypes);
          let resolution: ApiReferenceResolution;
          if (matches.length === 1) {
            resolution = resolvedResolution(matches[0], true);
          } else {
            resolution = fallbackResolution(name, matches.length > 1 ? 'ambiguous' : 'missing', [
              {
                code: matches.length > 1 ? 'ambiguous-overload' : 'missing-overload',
                severity: 'error',
                message: `ApiReference: "${name}" with parameter types ${JSON.stringify(parameterTypes)} ${matches.length > 1 ? 'matches multiple overloads' : 'does not match a generated overload'}. Use the complete declared C# parameter types, including the extension receiver, and qualify the package if needed.`,
                candidates: (matches.length > 1 ? matches : groups)
                  .map((candidate) => this.primary.describeCandidate(candidate))
                  .sort(),
              },
            ]);
          }
          overloadResolutions.set(cacheKey, resolution);
          return resolution;
        }

        const resolved = packageName
          ? packageResolutions.get(`${packageName}\0${name}`)
          : resolutions.get(name);
        if (resolved) return resolved;

        const cacheKey = `${packageName ?? ''}\0${name}`;
        const cached = missingResolutions.get(cacheKey);
        if (cached) return cached;

        const validFqn = API_REFERENCE_FQN_PATTERN.test(name);
        const packageCandidates = this.primary.lookup(primaryIndex, name);
        const candidatesForDiagnostic = packageCandidates.length
          ? packageCandidates.map((candidate) => this.primary.describeCandidate(candidate)).sort()
          : validFqn
            ? this.primary.suggestionsFor(primaryIndex, name)
            : [];
        const missing = fallbackResolution(name, 'missing', [
          {
            code: validFqn ? this.primary.code.missing : 'invalid-fqn',
            severity: 'error',
            message:
              validFqn && packageName
                ? `ApiReference: could not resolve "${name}" in package "${packageName}".`
                : validFqn
                  ? `ApiReference: could not resolve "${name}" to a generated ${this.primary.displayName} API member.`
                  : `ApiReference: "${name}" is not a canonical fully qualified API member name.`,
            candidates: candidatesForDiagnostic,
          },
        ]);
        missingResolutions.set(cacheKey, missing);
        return missing;
      },
    };
  }
}
