import type { APIRoute } from 'astro';

import samplesJson from '@data/samples.json';
import { markdownResponse } from '@utils/api-markdown-shared';
import {
  appHostLabel,
  buildSampleMarkdown,
  sampleSlug,
  type Sample,
} from '@utils/samples';

export const prerender = true;

type RouteProps = {
  sample: Sample;
};

type StaticPath = {
  params: { sample: string };
  props: RouteProps;
};

export function getStaticPaths(): StaticPath[] {
  return (samplesJson as Sample[]).map((sample) => ({
    params: { sample: sampleSlug(sample.name) },
    props: { sample },
  }));
}

export const GET: APIRoute = ({ props }) => {
  const { sample } = props as RouteProps;
  return markdownResponse(buildSampleMarkdown(sample, { appHostLabel }));
};
