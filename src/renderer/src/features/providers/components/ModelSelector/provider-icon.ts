import type { Provider } from '@shared/types/settings'
import { type CSSProperties, createElement, type ReactElement } from 'react'
import { getProviderIcon } from '@/features/providers/components/provider-icons'

interface ProviderModelIconProps {
  readonly provider: Provider
  readonly className?: string
  readonly style?: CSSProperties
}

export function ProviderModelIcon({
  provider,
  className,
  style,
}: ProviderModelIconProps): ReactElement {
  return createElement(getProviderIcon(provider), { className, style })
}

const PROVIDER_COLOR: Partial<Record<Provider, string>> = {
  anthropic: 'var(--theme-provider-anthropic)',
  openai: 'var(--theme-provider-openai)',
  'openai-codex': 'var(--theme-provider-google)',
  'github-copilot': 'var(--theme-provider-google)',
  google: 'var(--theme-provider-google)',
  'google-gemini-cli': 'var(--theme-provider-google)',
  'google-antigravity': 'var(--theme-provider-google)',
  'google-vertex': 'var(--theme-provider-google)',
  deepseek: 'var(--theme-provider-deepseek)',
  xai: 'currentColor',
  openrouter: 'var(--theme-provider-openrouter)',
  ollama: 'currentColor',
}

export function resolveIconColor(provider: Provider): string {
  return PROVIDER_COLOR[provider] ?? 'currentColor'
}
