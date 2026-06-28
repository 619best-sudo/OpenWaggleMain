import type { WaggleAgentColor } from '@shared/types/waggle'

export const AGENT_BG: Record<WaggleAgentColor, string> = {
  blue: 'bg-[var(--theme-agent-blue)]',
  amber: 'bg-[var(--theme-agent-amber)]',
  emerald: 'bg-[var(--theme-agent-emerald)]',
  violet: 'bg-[var(--theme-agent-violet)]',
}

export const AGENT_TEXT: Record<WaggleAgentColor, string> = {
  blue: 'text-[var(--theme-agent-blue)]',
  amber: 'text-[var(--theme-agent-amber)]',
  emerald: 'text-[var(--theme-agent-emerald)]',
  violet: 'text-[var(--theme-agent-violet)]',
}

export const AGENT_BORDER: Record<WaggleAgentColor, string> = {
  blue: 'border-[color:color-mix(in_srgb,var(--theme-agent-blue)_40%,transparent)]',
  amber: 'border-[color:color-mix(in_srgb,var(--theme-agent-amber)_40%,transparent)]',
  emerald: 'border-[color:color-mix(in_srgb,var(--theme-agent-emerald)_40%,transparent)]',
  violet: 'border-[color:color-mix(in_srgb,var(--theme-agent-violet)_40%,transparent)]',
}

export const AGENT_SURFACE: Record<WaggleAgentColor, string> = {
  blue: 'bg-[color:color-mix(in_srgb,var(--theme-agent-blue)_10%,transparent)]',
  amber: 'bg-[color:color-mix(in_srgb,var(--theme-agent-amber)_10%,transparent)]',
  emerald: 'bg-[color:color-mix(in_srgb,var(--theme-agent-emerald)_10%,transparent)]',
  violet: 'bg-[color:color-mix(in_srgb,var(--theme-agent-violet)_10%,transparent)]',
}

export const AGENT_RING: Record<WaggleAgentColor, string> = {
  blue: 'ring-[color:color-mix(in_srgb,var(--theme-agent-blue)_25%,transparent)]',
  amber: 'ring-[color:color-mix(in_srgb,var(--theme-agent-amber)_25%,transparent)]',
  emerald: 'ring-[color:color-mix(in_srgb,var(--theme-agent-emerald)_25%,transparent)]',
  violet: 'ring-[color:color-mix(in_srgb,var(--theme-agent-violet)_25%,transparent)]',
}

export const AGENT_BORDER_LEFT: Record<WaggleAgentColor, string> = {
  blue: 'border-l-[var(--theme-agent-blue)]',
  amber: 'border-l-[var(--theme-agent-amber)]',
  emerald: 'border-l-[var(--theme-agent-emerald)]',
  violet: 'border-l-[var(--theme-agent-violet)]',
}
