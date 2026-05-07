import { existsSync, readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { describe, expect, it } from 'vitest'

describe('Next instrumentation edge runtime boundary', () => {
  it('keeps task queue recovery out of Next instrumentation so middleware does not bundle BullMQ', () => {
    const instrumentationPath = resolve(process.cwd(), 'src/instrumentation.ts')
    const source = existsSync(instrumentationPath)
      ? readFileSync(instrumentationPath, 'utf8')
      : ''

    expect(source).not.toContain('@/lib/task/queues')
    expect(source).not.toContain('@/lib/task/reconcile')
    expect(source).not.toContain('@/lib/prisma')
    expect(source.toLowerCase()).not.toContain('bullmq')
  })
})
