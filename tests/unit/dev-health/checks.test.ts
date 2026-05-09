import {
  compareRequiredNodeVersion,
  evaluateHttpLatency,
  parseSemverVersion,
} from '@/lib/dev-health/checks'
import { describe, expect, it } from 'vitest'

describe('dev health checks', () => {
  it('fails when the active Node major version does not match .nvmrc', () => {
    const result = compareRequiredNodeVersion('22.14.0', 'v25.9.0')

    expect(result.status).toBe('fail')
    expect(result.summary).toContain('expected 22.14.0')
    expect(result.summary).toContain('actual 25.9.0')
  })

  it('warns when the active Node major version matches but the exact version differs', () => {
    const result = compareRequiredNodeVersion('22.14.0', 'v22.15.1')

    expect(result.status).toBe('warn')
    expect(result.summary).toContain('expected 22.14.0')
    expect(result.summary).toContain('actual 22.15.1')
  })

  it('passes when the active Node version exactly matches .nvmrc', () => {
    const result = compareRequiredNodeVersion('22.14.0', 'v22.14.0')

    expect(result.status).toBe('pass')
  })

  it('parses semver strings with and without a leading v', () => {
    expect(parseSemverVersion('v22.14.0')).toEqual({ major: 22, minor: 14, patch: 0 })
    expect(parseSemverVersion('22.14.0')).toEqual({ major: 22, minor: 14, patch: 0 })
  })

  it('marks slow local route responses as warnings before they look like browser disconnects', () => {
    const result = evaluateHttpLatency('/zh/auth/signin', 6_200, 3_000)

    expect(result.status).toBe('warn')
    expect(result.summary).toContain('6200ms')
  })
})
