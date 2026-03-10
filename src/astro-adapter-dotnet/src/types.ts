export interface UserOptions {
	/**
	 * The port the SSR server listens on. ASP.NET Core proxies to this port.
	 * Can be overridden at runtime via ASTRO_DOTNET_PORT environment variable.
	 * @default 5099
	 */
	port?: number;
}

export interface Options {
	port: number;
	client: string;
	server: string;
}
