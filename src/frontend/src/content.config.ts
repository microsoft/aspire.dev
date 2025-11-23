import { defineCollection, z } from 'astro:content';
import { docsLoader, i18nLoader } from '@astrojs/starlight/loaders';
import { docsSchema, i18nSchema } from '@astrojs/starlight/schema';

export const collections = {
	docs: defineCollection({
		loader: docsLoader(),
		schema: docsSchema(
			{
				extend: ({ image }) => z.object({
					renderBlocking: z.string().optional(),
					giscus: z.boolean().optional().default(false),
					category: z.enum([
						'conceptual',
						'quickstart',
						'tutorial',
						'blog',
						'reference',
						'sample',
						'feature'
					]).optional(),
				})
			}
		)
	}),
	i18n: defineCollection({
		loader: i18nLoader(),
		schema: i18nSchema(),
	}),
};
