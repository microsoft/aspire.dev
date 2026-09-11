import fs from 'fs';
import { Response } from 'node-fetch';
import { expect, test, vi } from 'vitest';
import { fetchWithProxy } from '../../scripts/fetch-with-proxy';
import { aspireProject } from '../../src/data/aspire-project';
import { gettingStartedDescription } from '../../src/data/dev-central';
import stats from '../../src/data/github-stats.json';

vi.mock('fs', () => ({ default: { writeFileSync: vi.fn() } }));
vi.mock('../../scripts/fetch-with-proxy', () => ({ fetchWithProxy: vi.fn() }));

test('the Dev Hub and checked-in repository card share the current product identity', () => {
  expect(aspireProject).toEqual({
    name: 'microsoft/aspire',
    repo: 'https://github.com/microsoft/aspire',
    description: 'Aspire is the tool for code-first, extensible, observable dev and deploy.',
  });
  expect(gettingStartedDescription).toContain(aspireProject.description);
  expect(stats.find(({ name }) => name === aspireProject.name)).toMatchObject(aspireProject);
  expect(stats.some(({ name, repo }) => name === 'dotnet/aspire' || repo === 'https://github.com/dotnet/aspire')).toBe(false);
});

test('refreshing repository stats cannot restore the old primary identity or positioning', async () => {
  vi.mocked(fetchWithProxy).mockImplementation((url) => {
    const name = String(url).replace('https://api.github.com/repos/', '');
    const primary = name === aspireProject.name;
    return Promise.resolve(new Response(JSON.stringify({
      full_name: primary ? 'dotnet/aspire' : name,
      html_url: `https://github.com/${primary ? 'dotnet/aspire' : name}`,
      description: primary ? 'Old cloud-native positioning.' : 'Repository description.',
      stargazers_count: 123,
      default_branch: 'main',
      license: null,
    })));
  });
  await import('../../scripts/update-github-stats');
  await vi.waitFor(() => expect(fs.writeFileSync).toHaveBeenCalledOnce());
  const [file, content] = vi.mocked(fs.writeFileSync).mock.calls[0];
  expect(file).toBe('./src/data/github-stats.json');
  if (typeof content !== 'string') throw new Error('Repository stats must be written as JSON text.');
  const output = JSON.parse(content) as unknown[];
  expect(output[0]).toMatchObject({ ...aspireProject, stars: 123 });
  expect(content).not.toContain('dotnet/aspire');
  expect(content).not.toContain('Old cloud-native positioning.');
  expect(fetchWithProxy).toHaveBeenCalledWith(
    'https://api.github.com/repos/microsoft/aspire',
    expect.any(Object),
  );
});
