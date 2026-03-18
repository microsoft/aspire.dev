import fetch from 'node-fetch';
import { HttpsProxyAgent } from 'https-proxy-agent';

const proxyUrl =
  process.env.HTTPS_PROXY ??
  process.env.https_proxy ??
  process.env.HTTP_PROXY ??
  process.env.http_proxy;

const proxyAgent = proxyUrl ? new HttpsProxyAgent(proxyUrl) : undefined;

function selectAgent(parsedUrl) {
  return parsedUrl.protocol === 'https:' ? proxyAgent : undefined;
}

export function fetchWithProxy(url, options = {}) {
  if (!proxyAgent || options.agent) {
    return fetch(url, options);
  }

  return fetch(url, { ...options, agent: selectAgent });
}
