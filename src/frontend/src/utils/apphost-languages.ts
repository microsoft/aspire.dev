import rawConfig from '@data/apphost-languages.json';

export const appHostLanguageIds = [
  'typescript',
  'csharp',
  'python',
  'go',
  'java',
  'rust',
] as const;

export type AppHostLanguageId = (typeof appHostLanguageIds)[number];

export interface AppHostLanguage {
  id: AppHostLanguageId;
  label: string;
  enabled: boolean;
  experimental: boolean;
  aliases: string[];
  cliLanguage: string;
  codegenTarget: string | null;
  appHostFile: string;
  codeFence: string;
  featureFlag: string | null;
  icon: AppHostLanguageId;
  generatedApi: boolean;
}

export interface AppHostLanguageConfig {
  defaultLanguage: AppHostLanguageId;
  languages: AppHostLanguage[];
}

function normalizeAlias(value: string): string {
  return value.trim().toLowerCase().replace(/\s+/g, '');
}

function validateConfig(value: unknown): AppHostLanguageConfig {
  if (!value || typeof value !== 'object') {
    throw new Error('apphost-languages.json must contain an object.');
  }

  const candidate = value as { defaultLanguage?: unknown; languages?: unknown };
  if (!Array.isArray(candidate.languages)) {
    throw new Error('apphost-languages.json must contain a languages array.');
  }

  const knownIds = new Set<string>(appHostLanguageIds);
  const seenIds = new Set<string>();
  const seenAliases = new Map<string, string>();

  const languages = candidate.languages.map((entry, index) => {
    if (!entry || typeof entry !== 'object') {
      throw new Error(`apphost-languages.json language at index ${index} must be an object.`);
    }

    const language = entry as Partial<AppHostLanguage>;
    if (!language.id || !knownIds.has(language.id)) {
      throw new Error(`Unsupported AppHost language id at index ${index}: ${String(language.id)}`);
    }
    if (seenIds.has(language.id)) {
      throw new Error(`Duplicate AppHost language id: ${language.id}`);
    }
    seenIds.add(language.id);

    for (const property of [
      'label',
      'cliLanguage',
      'appHostFile',
      'codeFence',
      'icon',
    ] as const) {
      if (typeof language[property] !== 'string' || language[property].length === 0) {
        throw new Error(`AppHost language ${language.id} requires ${property}.`);
      }
    }

    if (typeof language.enabled !== 'boolean' || typeof language.experimental !== 'boolean') {
      throw new Error(`AppHost language ${language.id} requires boolean enabled and experimental values.`);
    }
    if (typeof language.generatedApi !== 'boolean' || !Array.isArray(language.aliases)) {
      throw new Error(`AppHost language ${language.id} requires generatedApi and aliases values.`);
    }
    if (language.experimental && !language.featureFlag) {
      throw new Error(`Experimental AppHost language ${language.id} requires a featureFlag.`);
    }
    if (!knownIds.has(language.icon!)) {
      throw new Error(`AppHost language ${language.id} has an unsupported icon: ${language.icon}`);
    }

    const aliases = [
      language.id,
      language.label!,
      language.cliLanguage!,
      ...language.aliases,
    ].map(normalizeAlias);

    for (const alias of aliases) {
      const owner = seenAliases.get(alias);
      if (owner && owner !== language.id) {
        throw new Error(`AppHost language alias "${alias}" is shared by ${owner} and ${language.id}.`);
      }
      seenAliases.set(alias, language.id);
    }

    return language as AppHostLanguage;
  });

  if (languages.length !== appHostLanguageIds.length) {
    const missing = appHostLanguageIds.filter((id) => !seenIds.has(id));
    throw new Error(`apphost-languages.json is missing languages: ${missing.join(', ')}`);
  }

  if (
    typeof candidate.defaultLanguage !== 'string' ||
    !seenIds.has(candidate.defaultLanguage)
  ) {
    throw new Error('apphost-languages.json defaultLanguage must reference a configured language.');
  }

  const defaultLanguage = candidate.defaultLanguage as AppHostLanguageId;
  if (!languages.find((language) => language.id === defaultLanguage)?.enabled) {
    throw new Error('The default AppHost language must be enabled.');
  }

  return { defaultLanguage, languages };
}

export const appHostLanguageConfig = validateConfig(rawConfig);

export function getAppHostLanguages(): readonly AppHostLanguage[] {
  return appHostLanguageConfig.languages;
}

export function getEnabledAppHostLanguages(): readonly AppHostLanguage[] {
  return appHostLanguageConfig.languages.filter((language) => language.enabled);
}

export function getGeneratedApiLanguages(): readonly AppHostLanguage[] {
  return appHostLanguageConfig.languages.filter(
    (language) => language.enabled && language.generatedApi
  );
}

export function getAppHostLanguage(id: AppHostLanguageId): AppHostLanguage {
  const language = appHostLanguageConfig.languages.find((candidate) => candidate.id === id);
  if (!language) {
    throw new Error(`Unknown AppHost language: ${id}`);
  }
  return language;
}

export function normalizeAppHostLanguage(
  value: string | null | undefined,
  enabledOnly = true
): AppHostLanguageId | undefined {
  if (!value) {
    return undefined;
  }

  const normalized = normalizeAlias(value);
  const language = appHostLanguageConfig.languages.find((candidate) =>
    [candidate.id, candidate.label, candidate.cliLanguage, ...candidate.aliases]
      .map(normalizeAlias)
      .includes(normalized)
  );

  if (!language || (enabledOnly && !language.enabled)) {
    return undefined;
  }

  return language.id;
}

export function getAppHostLanguageClientConfig() {
  return {
    defaultLanguage: appHostLanguageConfig.defaultLanguage,
    languages: appHostLanguageConfig.languages.map((language) => ({
      id: language.id,
      label: language.label,
      enabled: language.enabled,
      experimental: language.experimental,
      aliases: [language.id, language.label, language.cliLanguage, ...language.aliases].map(
        normalizeAlias
      ),
    })),
  };
}
