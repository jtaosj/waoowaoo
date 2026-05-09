import { readFile, readdir, stat } from 'node:fs/promises'
import http from 'node:http'
import net from 'node:net'
import path from 'node:path'
import { performance } from 'node:perf_hooks'

import {
  evaluateHttpLatency,
  hasFailedHealthChecks,
  type HealthCheckResult,
  type HealthStatus,
  compareRequiredNodeVersion,
} from '@/lib/dev-health/checks'

type TcpTarget = Readonly<{
  name: string
  host: string
  port: number
}>

const APP_HOST = '127.0.0.1'
const PROJECT_ROOT = process.cwd()
const HTTP_TIMEOUT_MS = 8_000
const HTTP_SLOW_THRESHOLD_MS = 3_000

const TCP_TARGETS: readonly TcpTarget[] = [
  { name: 'next-dev', host: APP_HOST, port: 3000 },
  { name: 'mysql', host: APP_HOST, port: 13306 },
  { name: 'redis', host: APP_HOST, port: 16379 },
  { name: 'minio', host: APP_HOST, port: 19000 },
]

function writeLine(line = ''): void {
  process.stdout.write(`${line}\n`)
}

function statusLabel(status: HealthStatus): string {
  if (status === 'pass') return 'pass'
  if (status === 'warn') return 'warn'
  return 'fail'
}

function renderResult(result: HealthCheckResult): void {
  writeLine(`[${statusLabel(result.status)}] ${result.name}: ${result.summary}`)
  if (result.detail) {
    writeLine(`       ${result.detail}`)
  }
}

async function readRequiredNodeVersion(): Promise<string> {
  const nvmrcPath = path.join(PROJECT_ROOT, '.nvmrc')
  return (await readFile(nvmrcPath, 'utf8')).trim()
}

function checkTcpTarget(target: TcpTarget): Promise<HealthCheckResult> {
  return new Promise((resolve) => {
    const socket = net.createConnection({ host: target.host, port: target.port })

    const finish = (result: HealthCheckResult): void => {
      socket.removeAllListeners()
      socket.destroy()
      resolve(result)
    }

    socket.setTimeout(1_500)
    socket.once('connect', () => {
      finish({
        name: `tcp:${target.name}`,
        status: 'pass',
        summary: `${target.host}:${target.port} is listening`,
      })
    })
    socket.once('timeout', () => {
      finish({
        name: `tcp:${target.name}`,
        status: 'fail',
        summary: `${target.host}:${target.port} did not respond before timeout`,
      })
    })
    socket.once('error', (error: Error) => {
      finish({
        name: `tcp:${target.name}`,
        status: 'fail',
        summary: `${target.host}:${target.port} is not reachable: ${error.message}`,
      })
    })
  })
}

function checkHttpRoute(route: string): Promise<HealthCheckResult> {
  return new Promise((resolve) => {
    const startedAt = performance.now()
    const request = http.request(
      {
        host: APP_HOST,
        port: 3000,
        method: 'HEAD',
        path: route,
        timeout: HTTP_TIMEOUT_MS,
      },
      (response) => {
        response.resume()
        response.once('end', () => {
          const durationMs = performance.now() - startedAt
          const latencyResult = evaluateHttpLatency(route, durationMs, HTTP_SLOW_THRESHOLD_MS)
          if (response.statusCode && response.statusCode >= 500) {
            resolve({
              name: `http:${route}`,
              status: 'fail',
              summary: `${route} returned HTTP ${response.statusCode} in ${Math.round(durationMs)}ms`,
            })
            return
          }
          resolve(latencyResult)
        })
      },
    )

    request.once('timeout', () => {
      request.destroy()
      resolve({
        name: `http:${route}`,
        status: 'fail',
        summary: `${route} did not respond within ${HTTP_TIMEOUT_MS}ms`,
      })
    })

    request.once('error', (error: Error) => {
      resolve({
        name: `http:${route}`,
        status: 'fail',
        summary: `${route} request failed: ${error.message}`,
      })
    })

    request.end()
  })
}

async function measureDirectoryBytes(directoryPath: string): Promise<number | null> {
  try {
    const entryStat = await stat(directoryPath)
    if (!entryStat.isDirectory()) return entryStat.size
  } catch {
    return null
  }

  let totalBytes = 0
  const entries = await readdir(directoryPath, { withFileTypes: true })

  for (const entry of entries) {
    const entryPath = path.join(directoryPath, entry.name)
    if (entry.isDirectory()) {
      const childBytes = await measureDirectoryBytes(entryPath)
      totalBytes += childBytes ?? 0
      continue
    }
    if (entry.isFile()) {
      totalBytes += (await stat(entryPath)).size
    }
  }

  return totalBytes
}

async function checkNextCacheSize(): Promise<HealthCheckResult> {
  const nextPath = path.join(PROJECT_ROOT, '.next')
  const bytes = await measureDirectoryBytes(nextPath)
  if (bytes === null) {
    return {
      name: 'next-cache',
      status: 'warn',
      summary: '.next does not exist yet',
      detail: 'The first browser hit after starting dev will compile cold.',
    }
  }

  const mebibytes = Math.round(bytes / 1024 / 1024)
  if (mebibytes <= 1_024) {
    return {
      name: 'next-cache',
      status: 'pass',
      summary: `.next is ${mebibytes} MiB`,
    }
  }

  return {
    name: 'next-cache',
    status: 'warn',
    summary: `.next is ${mebibytes} MiB`,
    detail: 'Large dev cache can make cold route compilation feel like a browser disconnect.',
  }
}

async function run(): Promise<void> {
  const requiredNodeVersion = await readRequiredNodeVersion()
  const results: HealthCheckResult[] = [
    compareRequiredNodeVersion(requiredNodeVersion, process.version),
  ]

  for (const target of TCP_TARGETS) {
    results.push(await checkTcpTarget(target))
  }

  results.push(await checkHttpRoute('/zh/auth/signin'))
  results.push(await checkNextCacheSize())

  writeLine('waoowaoo dev health')
  writeLine(`cwd: ${PROJECT_ROOT}`)
  writeLine(`node: ${process.version}`)
  writeLine()

  for (const result of results) {
    renderResult(result)
  }

  if (hasFailedHealthChecks(results)) {
    writeLine()
    writeLine('Result: fail. Fix failed checks before trusting browser QA.')
    process.exitCode = 1
    return
  }

  writeLine()
  writeLine('Result: ok. Warnings may still explain slow first browser loads.')
}

void run().catch((error: unknown) => {
  const message = error instanceof Error ? error.message : String(error)
  process.stderr.write(`[fail] dev-health crashed: ${message}\n`)
  process.exitCode = 1
})
