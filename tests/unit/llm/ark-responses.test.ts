import { afterEach, describe, expect, it, vi } from 'vitest'
import { arkResponsesCompletion, arkResponsesStream, type ArkStreamDelta } from '@/lib/ai-providers/ark/responses'

function sseResponse(payload: string): Response {
  const encoder = new TextEncoder()
  const stream = new ReadableStream<Uint8Array>({
    start(controller) {
      controller.enqueue(encoder.encode(payload))
      controller.close()
    },
  })
  return new Response(stream, {
    status: 200,
    headers: { 'Content-Type': 'text/event-stream' },
  })
}

async function collectStream(stream: AsyncIterable<ArkStreamDelta>): Promise<ArkStreamDelta[]> {
  const chunks: ArkStreamDelta[] = []
  for await (const chunk of stream) {
    chunks.push(chunk)
  }
  return chunks
}

describe('ark responses protocol', () => {
  afterEach(() => {
    vi.unstubAllGlobals()
  })

  it('parses text from SSE chunks that include event and data lines', async () => {
    const fetchMock = vi.fn<typeof fetch>(async () => sseResponse([
      'event: response.output_text.delta',
      'data: {"output_text":"hello"}',
      '',
      '',
    ].join('\n')))
    vi.stubGlobal('fetch', fetchMock)

    const { stream, result } = arkResponsesStream({
      apiKey: 'ark-key',
      model: 'doubao-seed-2-0-lite-260215',
      input: [{ role: 'user', content: [{ type: 'input_text', text: 'hi' }] }],
    })

    await expect(collectStream(stream)).resolves.toEqual([{ kind: 'text', delta: 'hello' }])
    await expect(result()).resolves.toMatchObject({ text: 'hello' })
  })

  it('parses text from streamed output item events', async () => {
    const fetchMock = vi.fn<typeof fetch>(async () => sseResponse([
      'event: response.output_item.done',
      'data: {"item":{"type":"message","content":[{"type":"output_text","text":"item text"}]}}',
      '',
      '',
    ].join('\n')))
    vi.stubGlobal('fetch', fetchMock)

    const { stream, result } = arkResponsesStream({
      apiKey: 'ark-key',
      model: 'doubao-seed-2-0-lite-260215',
      input: [{ role: 'user', content: [{ type: 'input_text', text: 'hi' }] }],
    })

    await expect(collectStream(stream)).resolves.toEqual([{ kind: 'text', delta: 'item text' }])
    await expect(result()).resolves.toMatchObject({ text: 'item text' })
  })

  it('fails explicitly when streaming completion has no text or reasoning', async () => {
    const fetchMock = vi.fn<typeof fetch>(async () => sseResponse([
      'event: response.completed',
      'data: {"id":"resp-1","output":[]}',
      '',
      '',
    ].join('\n')))
    vi.stubGlobal('fetch', fetchMock)

    const { stream, result } = arkResponsesStream({
      apiKey: 'ark-key',
      model: 'doubao-seed-2-0-lite-260215',
      input: [{ role: 'user', content: [{ type: 'input_text', text: 'hi' }] }],
    })

    const resultExpectation = expect(result()).rejects.toThrow(/empty response/i)
    await expect(collectStream(stream)).rejects.toThrow(/empty response/i)
    await resultExpectation
  })

  it('fails explicitly when non-streaming completion has no text or reasoning', async () => {
    const fetchMock = vi.fn<typeof fetch>(async () => new Response(JSON.stringify({ id: 'resp-1', output: [] }), {
      status: 200,
      headers: { 'Content-Type': 'application/json' },
    }))
    vi.stubGlobal('fetch', fetchMock)

    await expect(arkResponsesCompletion({
      apiKey: 'ark-key',
      model: 'doubao-seed-2-0-lite-260215',
      input: [{ role: 'user', content: [{ type: 'input_text', text: 'hi' }] }],
    })).rejects.toThrow(/empty response/i)
  })
})
