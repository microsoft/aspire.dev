import fetch, { type RequestInit, type Response } from 'node-fetch';
import { HttpsProxyAgent } from 'https-proxy-agent';
import { HttpProxyAgent } from 'http-proxy-agent';

const proxyUrl =
  process.env.HTTPS_PROXY ??
  process.env.https_proxy ??
  process.env.HTTP_PROXY ??
  process.env.http_proxy;

const httpsProxyAgent = proxyUrl ? new HttpsProxyAgent(proxyUrl) : undefined;
const httpProxyAgent = proxyUrl ? new HttpProxyAgent(proxyUrl) : undefined;

function selectAgent(parsedUrl: URL) {
  if (parsedUrl.protocol === 'https:') {
    return httpsProxyAgent;
  }
  if (parsedUrl.protocol === 'http:') {
    return httpProxyAgent;
  }
  return undefined;
}

export function fetchWithProxy(url: string | URL, options: RequestInit = {}): Promise<Response> {
  if ((!httpsProxyAgent && !httpProxyAgent) || options.agent) {
    return fetch(url, options);
  }

  const parsedUrl = url instanceof URL ? url : new URL(url);
  return fetch(url, { ...options, agent: selectAgent(parsedUrl) });
}