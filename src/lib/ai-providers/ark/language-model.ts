import type { LanguageModel } from 'ai'
import type { AiProviderLanguageModelContext } from '@/lib/ai-providers/runtime-types'
import { createOpenAiSdkLanguageModel } from '@/lib/ai-providers/shared/language-model'

const ARK_OPENAI_COMPATIBLE_BASE_URL = 'https://ark.cn-beijing.volces.com/api/v3'

export function createArkLanguageModel(input: AiProviderLanguageModelContext): LanguageModel {
  return createOpenAiSdkLanguageModel({
    ...input,
    providerConfig: {
      ...input.providerConfig,
      baseUrl: input.providerConfig.baseUrl || ARK_OPENAI_COMPATIBLE_BASE_URL,
    },
  })
}
