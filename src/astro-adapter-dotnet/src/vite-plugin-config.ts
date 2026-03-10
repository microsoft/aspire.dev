import type { AstroConfig } from 'astro';
import type { Options } from './types.js';

const VIRTUAL_CONFIG_ID = 'virtual:astro-dotnet:config';
const RESOLVED_VIRTUAL_CONFIG_ID = '\0' + VIRTUAL_CONFIG_ID;

export function createConfigPlugin(
	config: Partial<Options>,
): NonNullable<AstroConfig['vite']['plugins']>[number] {
	return {
		name: VIRTUAL_CONFIG_ID,
		resolveId(id: string) {
			if (id === VIRTUAL_CONFIG_ID) {
				return RESOLVED_VIRTUAL_CONFIG_ID;
			}
		},
		load(id: string) {
			if (id === RESOLVED_VIRTUAL_CONFIG_ID) {
				return Object.entries(config)
					.map(([k, v]) => `export const ${k} = ${JSON.stringify(v)};`)
					.join('\n');
			}
		},
	};
}
