import type { AstroComponentFactory } from 'astro/runtime/server/index.js';

export interface Props {
  text: string;
}

declare const ReadableText: AstroComponentFactory &
  ((props: Props) => ReturnType<AstroComponentFactory>);
export default ReadableText;
