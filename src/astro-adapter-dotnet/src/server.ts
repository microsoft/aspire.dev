// @ts-nocheck — This file is bundled by Astro's build system at build time.
// Imports from virtual modules and Astro internals are resolved during the
// Astro build, not by standalone TypeScript compilation.
import http from 'node:http';
import { NodeApp } from 'astro/app/node';
import { setGetEnv } from 'astro/env/setup';
import { port as configPort } from 'virtual:astro-dotnet:config';

setGetEnv((key) => process.env[key]);

function startServer(app, options) {
	const port = parseInt(process.env.ASTRO_DOTNET_PORT ?? String(configPort), 10);

	const server = http.createServer(async (req, res) => {
		try {
			const request = NodeApp.createRequest(req);

			// Only match non-prerendered routes — prerendered content is
			// served as static files by ASP.NET Core.
			const routeData = app.match(request);

			if (routeData) {
				const response = await app.render(request, {
					addCookieHeader: true,
					routeData,
				});
				await NodeApp.writeResponse(response, res);
			} else {
				res.writeHead(404, { 'Content-Type': 'text/plain' });
				res.end('Not Found');
			}
		} catch (err) {
			console.error(`[astro-adapter-dotnet] Error rendering ${req.url}:`, err);
			if (!res.headersSent) {
				res.writeHead(500, { 'Content-Type': 'text/plain' });
				res.end('Internal Server Error');
			}
		}
	});

	server.listen(port, '127.0.0.1', () => {
		console.log(`[astro-adapter-dotnet] SSR server ready on http://127.0.0.1:${port}`);
		if (process.send) {
			process.send({ type: 'ready', port });
		}
	});

	const shutdown = () => {
		server.close(() => process.exit(0));
		setTimeout(() => process.exit(1), 5000);
	};
	process.on('SIGTERM', shutdown);
	process.on('SIGINT', shutdown);
}

// Astro 5 server entry API — Astro calls these with the SSR manifest.
export function createExports(manifest, options) {
	const app = new NodeApp(manifest);
	return {
		handler: (req, res) => {
			const request = NodeApp.createRequest(req);
			const routeData = app.match(request);
			if (routeData) {
				app.render(request, { addCookieHeader: true, routeData })
					.then((response) => NodeApp.writeResponse(response, res));
			} else {
				res.writeHead(404);
				res.end('Not Found');
			}
		},
		startServer: () => startServer(app, options),
	};
}

export function start(manifest, options) {
	const app = new NodeApp(manifest);
	startServer(app, options);
}
