const PROXY_ENV_KEYS = [
  'PROXY_URL',
  'HTTPS_PROXY',
  'https_proxy',
  'HTTP_PROXY',
  'http_proxy',
  'ALL_PROXY',
  'all_proxy',
] as const

let installedProxyUrl: string | null = null

export function resolveProxyUrl(env: NodeJS.ProcessEnv = process.env): string | null {
  for (const key of PROXY_ENV_KEYS) {
    const value = env[key]?.trim()
    if (value) return value
  }
  return null
}

export async function setProxy(): Promise<boolean> {
  const proxyUrl = resolveProxyUrl()
  if (!proxyUrl) return false
  if (installedProxyUrl === proxyUrl) return true

  const { setGlobalDispatcher, ProxyAgent } = await import('undici')
  const proxyAgent = new ProxyAgent(proxyUrl)
  setGlobalDispatcher(proxyAgent)
  installedProxyUrl = proxyUrl
  return true
}
