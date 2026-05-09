export type HealthStatus = 'pass' | 'warn' | 'fail'

export type HealthCheckResult = Readonly<{
  name: string
  status: HealthStatus
  summary: string
  detail?: string
}>

export type SemverVersion = Readonly<{
  major: number
  minor: number
  patch: number
}>

const SEMVER_PATTERN = /^v?(\d+)\.(\d+)\.(\d+)/

export function parseSemverVersion(value: string): SemverVersion | null {
  const match = value.trim().match(SEMVER_PATTERN)
  if (!match) return null

  return {
    major: Number(match[1]),
    minor: Number(match[2]),
    patch: Number(match[3]),
  }
}

export function formatSemverVersion(version: SemverVersion): string {
  return `${version.major}.${version.minor}.${version.patch}`
}

export function compareRequiredNodeVersion(
  requiredRaw: string,
  actualRaw: string,
): HealthCheckResult {
  const required = parseSemverVersion(requiredRaw)
  const actual = parseSemverVersion(actualRaw)

  if (!required) {
    return {
      name: 'node-version',
      status: 'fail',
      summary: `Could not parse required Node version from .nvmrc: ${requiredRaw.trim()}`,
    }
  }

  if (!actual) {
    return {
      name: 'node-version',
      status: 'fail',
      summary: `Could not parse active Node version: ${actualRaw.trim()}`,
    }
  }

  const requiredText = formatSemverVersion(required)
  const actualText = formatSemverVersion(actual)

  if (
    required.major === actual.major &&
    required.minor === actual.minor &&
    required.patch === actual.patch
  ) {
    return {
      name: 'node-version',
      status: 'pass',
      summary: `Node version matches .nvmrc: actual ${actualText}`,
    }
  }

  if (required.major !== actual.major) {
    return {
      name: 'node-version',
      status: 'fail',
      summary: `Node major version mismatch: expected ${requiredText}, actual ${actualText}`,
      detail: 'Run `nvm use` before starting the dev server, then restart npm run dev.',
    }
  }

  return {
    name: 'node-version',
    status: 'warn',
    summary: `Node version differs from .nvmrc: expected ${requiredText}, actual ${actualText}`,
    detail: 'The major version matches, but exact .nvmrc alignment is safer for local browser QA.',
  }
}

export function evaluateHttpLatency(
  route: string,
  durationMs: number,
  slowThresholdMs = 3_000,
): HealthCheckResult {
  const roundedDuration = Math.round(durationMs)
  const roundedThreshold = Math.round(slowThresholdMs)

  if (roundedDuration <= roundedThreshold) {
    return {
      name: `http:${route}`,
      status: 'pass',
      summary: `${route} responded in ${roundedDuration}ms`,
    }
  }

  return {
    name: `http:${route}`,
    status: 'warn',
    summary: `${route} responded in ${roundedDuration}ms, above ${roundedThreshold}ms`,
    detail: 'Slow first hits usually mean Next dev is compiling; refresh after it warms up before judging UI stability.',
  }
}

export function hasFailedHealthChecks(results: readonly HealthCheckResult[]): boolean {
  return results.some((result) => result.status === 'fail')
}
