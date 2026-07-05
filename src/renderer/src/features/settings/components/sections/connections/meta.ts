import type { Provider } from '@shared/types/settings'
import {
  AnthropicIcon,
  GeminiIcon,
  GroqIcon,
  getProviderIcon,
  OllamaIcon,
  OpenAIIcon,
  OpenRouterIcon,
} from '@/features/providers/components'

type ProviderIcon = typeof OpenAIIcon

export interface ProviderMeta {
  readonly icon: ProviderIcon
  readonly color: string
}

export const PROVIDER_META: Partial<Record<Provider, ProviderMeta>> = {
  openai: {
    icon: OpenAIIcon,
    color: 'var(--theme-provider-openai)',
  },
  anthropic: {
    icon: AnthropicIcon,
    color: 'var(--theme-provider-anthropic)',
  },
  google: {
    icon: GeminiIcon,
    color: 'var(--theme-provider-google)',
  },
  'google-gemini-cli': {
    icon: GeminiIcon,
    color: 'var(--theme-provider-google)',
  },
  'google-antigravity': {
    icon: GeminiIcon,
    color: 'var(--theme-provider-google)',
  },
  xai: {
    icon: getProviderIcon('xai'),
    color: 'var(--theme-provider-xai)',
  },
  groq: {
    icon: GroqIcon,
    color: 'var(--theme-provider-xai)',
  },
  deepseek: {
    icon: getProviderIcon('deepseek'),
    color: 'var(--theme-provider-deepseek)',
  },
  openrouter: {
    icon: OpenRouterIcon,
    color: 'var(--theme-provider-openrouter)',
  },
  ollama: {
    icon: OllamaIcon,
    color: 'var(--theme-provider-ollama)',
  },
}

export function getProviderMeta(provider: Provider): ProviderMeta {
  return (
    PROVIDER_META[provider] ?? {
      icon: getProviderIcon(provider),
      color: 'var(--theme-provider-default)',
    }
  )
}
