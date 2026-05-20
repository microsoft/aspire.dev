import { describe, expect, it } from 'vitest';

import { getKnownTopicIcons, getTopicForEntry } from '@utils/topic-resolver';

describe('getTopicForEntry', () => {
  it('maps docs entries to the Foundations topic with the open-book icon', () => {
    const topic = getTopicForEntry('docs/get-started/aspire-overview');
    expect(topic.id).toBe('docs');
    expect(topic.iconName).toBe('open-book');
    expect(topic.iconSvg).toMatch(/^<path/);
    expect(topic.label).toBe('Foundations');
  });

  it('maps integration entries to the Integrations topic with the puzzle icon', () => {
    const topic = getTopicForEntry('integrations/messaging/azure-service-bus-integration');
    expect(topic.id).toBe('integrations');
    expect(topic.iconName).toBe('puzzle');
  });

  it('maps dashboard entries to the Dashboard topic with the seti:happenings icon', () => {
    const topic = getTopicForEntry('dashboard/overview');
    expect(topic.id).toBe('dashboard');
    expect(topic.iconName).toBe('seti:happenings');
  });

  it('maps deployment entries to the Deployments topic with the rocket icon', () => {
    const topic = getTopicForEntry('deployment/overview');
    expect(topic.id).toBe('deployment');
    expect(topic.iconName).toBe('rocket');
  });

  it('maps reference entries to the Reference topic with the seti:json icon', () => {
    const topic = getTopicForEntry('reference/index');
    expect(topic.id).toBe('reference');
    expect(topic.iconName).toBe('seti:json');
  });

  it('maps community entries to the Community topic with the heart icon', () => {
    const topic = getTopicForEntry('community/index');
    expect(topic.id).toBe('community');
    expect(topic.iconName).toBe('heart');
  });

  it('honours an explicit locale override when one is supplied', () => {
    const topic = getTopicForEntry('docs/get-started/aspire-overview', 'de');
    expect(topic.label).toBe('Grundlagen');
  });

  it('falls back to English when the requested locale is missing', () => {
    const topic = getTopicForEntry('docs/get-started/aspire-overview', 'xx-LATIN');
    expect(topic.label).toBe('Foundations');
  });

  it('strips markdown extensions before matching', () => {
    const topic = getTopicForEntry('integrations/overview.mdx');
    expect(topic.id).toBe('integrations');
  });

  it('normalizes Windows-style separators in entry ids', () => {
    const topic = getTopicForEntry('integrations\\messaging\\azure-service-bus-integration');
    expect(topic.id).toBe('integrations');
  });

  it('returns the Aspire fallback when nothing claims the entry', () => {
    const topic = getTopicForEntry('does-not-exist/at-all');
    expect(topic.id).toBe('aspire');
    expect(topic.label).toBe('Aspire');
    expect(topic.iconName).toBe('open-book');
  });

  it('exposes the inlined icon registry to keep it in sync with sidebar config', () => {
    const icons = getKnownTopicIcons();
    expect(icons).toEqual(
      expect.arrayContaining([
        'open-book',
        'puzzle',
        'seti:happenings',
        'rocket',
        'heart',
        'seti:json',
      ])
    );
  });
});
