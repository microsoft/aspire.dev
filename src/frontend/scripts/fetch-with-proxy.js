import fetch from 'node-fetch';
import { HttpsProxyAgent } from 'https-proxy-agent';
import { HttpProxyAgent } from 'http-proxy-agent';

const proxyUrl =
  process.env.HTTPS_PROXY ??
  process.env.https_proxy ??
  process.env.HTTP_PROXY ??
  process.env.http_proxy;

const proxyAgent = proxyUrl ? new HttpsProxyAgent(proxyUrl) : undefined;
const httpProxyAgent = proxyUrl ? new HttpProxyAgent(proxyUrl) : undefined;

function selectAgent(parsedUrl) {
  if (parsedUrl.protocol === 'https:') {
    return proxyAgent;
  }
  if (parsedUrl.protocol === 'http:') {
    return httpProxyAgent;
  }
  return undefined;
}

export function fetchWithProxy(url, options = {}) {
  if ((!proxyAgent && !httpProxyAgent) || options.agent) {
    return fetch(url, options);
  }

  return fetch(url, { ...options, agent: selectAgent });
}
