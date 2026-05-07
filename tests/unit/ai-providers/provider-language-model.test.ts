import { beforeEach, describe, expect, it, vi } from 'vitest'

const openAiState = vi.hoisted(() => ({
  createOpenAI: vi.fn((settings: { apiKey?: string; baseURL?: string; name?: string }) => ({
    chat: vi.fn((modelId: string) => ({
      provider: 'openai',
      modelId,
      settings,
    })),
  })),
}))

const anthropicState = vi.hoisted(() => ({
  createAnthropic: vi.fn((settings: { apiKey?: string; baseURL?: string; name?: string }) => ({
    chat: vi.fn((modelId: string) => ({
      provider: 'anthropic',
      modelId,
      settings,
    })),
  })),
}))

vi.mock('@ai-sdk/openai', () => ({
  createOpenAI: openAiState.createOpenAI,
}))

vi.mock('@ai-sdk/anthropic', () => ({
  createAnthropic: anthropicState.createAnthropic,
}))

import { createRegisteredLanguageModel } from '@/lib/ai-providers'

describe('ai provider language model registry', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('creates OpenAI language models from registered provider configs', () => {
    const model = createRegisteredLanguageModel({
      providerKey: 'openai',
      selection: {
        provider: 'openai',
        modelId: 'gpt-4.1',
        modelKey: 'openai::gpt-4.1',
      },
      providerConfig: {
        id: 'openai',
        name: 'OpenAI',
        apiKey: 'sk-openai',
      },
    })

    expect(model).toMatchObject({
      provider: 'openai',
      modelId: 'gpt-4.1',
    })
    expect(openAiState.createOpenAI).toHaveBeenCalledWith({
      apiKey: 'sk-openai',
      name: 'openai',
    })
  })

  it('creates Anthropic language models from registered provider configs', () => {
    const model = createRegisteredLanguageModel({
      providerKey: 'anthropic',
      selection: {
        provider: 'anthropic',
        modelId: 'claude-3-5-sonnet-latest',
        modelKey: 'anthropic::claude-3-5-sonnet-latest',
      },
      providerConfig: {
        id: 'anthropic',
        name: 'Anthropic',
        apiKey: 'sk-anthropic',
        baseUrl: 'https://anthropic.example/v1',
      },
    })

    expect(model).toMatchObject({
      provider: 'anthropic',
      modelId: 'claude-3-5-sonnet-latest',
    })
    expect(anthropicState.createAnthropic).toHaveBeenCalledWith({
      apiKey: 'sk-anthropic',
      baseURL: 'https://anthropic.example/v1',
      name: 'anthropic',
    })
  })

  it('creates Ark language models with the Ark OpenAI-compatible endpoint by default', () => {
    const model = createRegisteredLanguageModel({
      providerKey: 'ark',
      selection: {
        provider: 'ark',
        modelId: 'doubao-seed-1-8-251228',
        modelKey: 'ark::doubao-seed-1-8-251228',
      },
      providerConfig: {
        id: 'ark',
        name: '火山引擎 Ark',
        apiKey: 'ark-api-key',
      },
    })

    expect(model).toMatchObject({
      provider: 'openai',
      modelId: 'doubao-seed-1-8-251228',
    })
    expect(openAiState.createOpenAI).toHaveBeenCalledWith({
      apiKey: 'ark-api-key',
      baseURL: 'https://ark.cn-beijing.volces.com/api/v3',
      name: 'ark',
    })
  })

  it('keeps an explicit Ark language model endpoint when one is configured', () => {
    createRegisteredLanguageModel({
      providerKey: 'ark',
      selection: {
        provider: 'ark',
        modelId: 'doubao-seed-1-8-251228',
        modelKey: 'ark::doubao-seed-1-8-251228',
      },
      providerConfig: {
        id: 'ark',
        name: '火山引擎 Ark',
        apiKey: 'ark-api-key',
        baseUrl: 'https://ark.example/api/v3',
      },
    })

    expect(openAiState.createOpenAI).toHaveBeenCalledWith({
      apiKey: 'ark-api-key',
      baseURL: 'https://ark.example/api/v3',
      name: 'ark',
    })
  })
})
