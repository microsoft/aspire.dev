import { describe, expect, it } from 'vitest';
import { sampleLanguages } from '../../src/utils/sample-tags';
import { featuredSamples, sampleLanguageOptions } from '../../src/data/dev-hub';
import samples from '../../src/data/samples.json';
import { buildResourceCatalog } from '../../src/utils/dev-center/catalog-normalization';

describe('sample language discovery', () => {
  it('includes each tagged service language and the AppHost without duplicates', () => {
    expect(sampleLanguages({ tags: ['python', 'javascript', 'typescript', 'node', 'redis'], appHost: 'typescript' }))
      .toEqual(['javascript', 'python', 'typescript']);
    for (const appHost of ['csproj', 'file-based']) {
      expect(sampleLanguages({ tags: ['python', 'csharp'], appHost })).toEqual(['csharp', 'python']);
    }
  });

  it('does not infer a language from infrastructure, runtimes, or unspecified AppHosts', () => {
    expect(sampleLanguages({ tags: ['docker', 'redis', 'node'] })).toEqual([]);
    expect(sampleLanguages({ tags: [], appHost: null })).toEqual([]);
    expect(sampleLanguages({ tags: ['go'], appHost: null })).toEqual(['go']);
  });

  it('keeps featured filtering and the full resource catalog in agreement', () => {
    const catalog = buildResourceCatalog({
      docs: [], glossary: [], samples, integrations: [], integrationDocs: [], videos: [], blogs: [],
    });
    for (const sample of featuredSamples) {
      expect(sample.languages).toEqual(catalog.find(({ id }) => id === `sample:${sample.name}`)?.languages);
    }
    expect(sampleLanguageOptions).toEqual([...new Set(catalog.flatMap(({ languages }) => languages))].sort());
  });
});
