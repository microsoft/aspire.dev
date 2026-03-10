import type { AstroAdapter, AstroConfig, AstroIntegration } from 'astro';
import { createConfigPlugin } from './vite-plugin-config.js';
import type { UserOptions } from './types.js';

export function getAdapter(): AstroAdapter {
	return {
		name: 'astro-adapter-dotnet',
		serverEntrypoint: 'astro-adapter-dotnet/server.js',
		adapterFeatures: {
			buildOutput: 'server',
			edgeMiddleware: false,
		},
		supportedAstroFeatures: {
			hybridOutput: 'stable',
			staticOutput: 'stable',
			serverOutput: 'stable',
			sharpImageService: 'stable',
		},
	};
}

export default function createIntegration(userOptions?: UserOptions): AstroIntegration {
	let _config: AstroConfig;

	return {
		name: 'astro-adapter-dotnet',
		hooks: {
			'astro:config:setup': ({ updateConfig, config }) => {
				_config = config;
				updateConfig({
					build: {
						redirects: false,
					},
					image: {
						endpoint: {
							route: config.image.endpoint.route ?? '_image',
						},
					},
					vite: {
						ssr: {
							noExternal: ['astro-adapter-dotnet'],
						},
						plugins: [
							createConfigPlugin({
								port: userOptions?.port ?? 5099,
								client: config.build.client?.toString() ?? '',
								server: config.build.server?.toString() ?? '',
							}),
						],
					},
				});
			},
			'astro:config:done': ({ setAdapter }) => {
				setAdapter(getAdapter());
			},
		},
	};
}
