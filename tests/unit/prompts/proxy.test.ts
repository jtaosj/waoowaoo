import { describe, expect, it } from 'vitest'
import { resolveProxyUrl } from '../../../lib/prompts/proxy'

describe('resolveProxyUrl', () => {
  it('prefers explicit PROXY_URL over standard proxy environment variables', () => {
    const env: NodeJS.ProcessEnv = {
      NODE_ENV: 'test',
      PROXY_URL: ' http://127.0.0.1:7897 ',
      https_proxy: 'http://127.0.0.1:9000',
    }

    expect(resolveProxyUrl(env)).toBe('http://127.0.0.1:7897')
  })

  it('uses lowercase standard proxy variables when PROXY_URL is absent', () => {
    const env: NodeJS.ProcessEnv = {
      NODE_ENV: 'test',
      https_proxy: 'http://127.0.0.1:7897',
    }

    expect(resolveProxyUrl(env)).toBe('http://127.0.0.1:7897')
  })

  it('ignores blank proxy values', () => {
    const env: NodeJS.ProcessEnv = {
      NODE_ENV: 'test',
      PROXY_URL: ' ',
      HTTPS_PROXY: '',
      ALL_PROXY: 'http://127.0.0.1:7897',
    }

    expect(resolveProxyUrl(env)).toBe('http://127.0.0.1:7897')
  })
})
