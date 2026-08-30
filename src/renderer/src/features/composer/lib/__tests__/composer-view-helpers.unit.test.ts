import { SupportedModelId } from '@shared/types/brand'
import type { ProviderInfo } from '@shared/types/llm'
import { describe, expect, it } from 'vitest'
import { actionDialogHasInput, getActionDialogConfig } from '../action-dialog-config'
import {
  buildContextMeterValue,
  buildContextUsageRequestKey,
  findContextWindow,
} from '../context-meter-view'
import { findMentionMatch } from '../mention-match'
import {
  getThinkingButtonLabel,
  getThinkingButtonTitle,
  hasOnlyOffThinkingLevel,
} from '../thinking-level-view'

const MODEL_REF = SupportedModelId('anthropic/claude-sonnet-4-5')
const PROVIDER_MODELS: ProviderInfo[] = [
  {
    provider: 'anthropic',
    displayName: 'Anthropic',
    auth: {
      configured: true,
      source: 'api-key',
      apiKeyConfigured: true,
      apiKeySource: 'api-key',
      oauthConnected: false,
      supportsApiKey: true,
      supportsOAuth: true,
    },
    models: [
      {
        id: MODEL_REF,
        modelId: 'claude-sonnet-4-5',
        name: 'Claude Sonnet 4.5',
        provider: 'anthropic',
        available: true,
        availableThinkingLevels: ['off', 'low'],
        contextWindow: 200_000,
      },
    ],
  },
]

describe('composer view helpers', () => {
  it('builds action dialog copy and input requirements from the action kind', () => {
    expect(getActionDialogConfig('rename-branch', 'main', '')).toMatchObject({
      title: 'Rename "main"',
      confirmLabel: 'Rename',
      confirmTone: 'normal',
      inputPlaceholder: 'feature/new-name',
    })
    expect(getActionDialogConfig('delete-branch', 'main', 'feature/old')).toMatchObject({
      title: 'Delete "feature/old"',
      confirmLabel: 'Delete',
      confirmTone: 'danger',
    })
    expect(actionDialogHasInput('set-upstream')).toBe(true)
    expect(actionDialogHasInput('delete-branch')).toBe(false)
    expect(actionDialogHasInput(null)).toBe(false)
  })

  it('resolves context usage request keys and model context windows', () => {
    expect(buildContextUsageRequestKey('session-1', MODEL_REF, 'v1')).toBe(
      'session-1:anthropic/claude-sonnet-4-5:v1',
    )
    expect(buildContextUsageRequestKey(null, MODEL_REF, 'v1')).toBe('')
    expect(findContextWindow(PROVIDER_MODELS, MODEL_REF)).toBe(200_000)
    expect(findContextWindow(PROVIDER_MODELS, SupportedModelId('anthropic/missing'))).toBeNull()
  })

  it('builds context meter display state for loaded, fallback, and failed usage', () => {
    expect(
      buildContextMeterValue({
        snapshot: { tokens: 25_000, contextWindow: 100_000, percent: 25 },
        fallbackContextWindow: null,
        hasActiveSession: true,
        failed: false,
      }),
    ).toMatchObject({
      contextWindow: 100_000,
      // Both halves, the way Claude Code reads: "25k / 100k" and "25%".
      displayTokens: '25k',
      displayPercent: '25',
      strokeColor: 'var(--color-success)',
      title: 'Context: 25k / 100k tokens (25.0%)',
    })

    expect(
      buildContextMeterValue({
        snapshot: null,
        fallbackContextWindow: 200_000,
        hasActiveSession: false,
        failed: false,
      }),
    ).toMatchObject({
      displayTokens: '0',
      displayPercent: '0',
      title: 'Context: 0 / 200k tokens (0.0%)',
    })

    expect(
      buildContextMeterValue({
        snapshot: null,
        fallbackContextWindow: 200_000,
        hasActiveSession: true,
        failed: true,
      }),
    ).toMatchObject({
      displayTokens: '0',
      displayPercent: '0',
      title: 'Context: 0 / 200k tokens (usage unavailable)',
    })
  })

  it('names what the kernel measures in the tooltip, so a small number is not misread', () => {
    expect(
      buildContextMeterValue({
        // What the turing kernel reports: the context the NEXT run carries, not
        // a transcript filling the window.
        snapshot: {
          tokens: 3_400,
          contextWindow: 262_144,
          percent: 1.3,
          label: 'Next request',
        },
        fallbackContextWindow: 256_000,
        hasActiveSession: true,
        failed: false,
      }),
    ).toMatchObject({
      displayTokens: '3k',
      displayPercent: '1',
      // The snapshot's own window wins — no fallback bounce.
      contextWindow: 262_144,
      title: 'Next request: 3k / 262k tokens (1.3%)',
    })

    // A real bounded turing thread lands under one percent; rounding that to
    // `0` would erase the only movement the meter has.
    expect(
      buildContextMeterValue({
        snapshot: { tokens: 489, contextWindow: 262_144, percent: 0.1865, label: 'Next request' },
        fallbackContextWindow: null,
        hasActiveSession: true,
        failed: false,
      }),
    ).toMatchObject({
      displayTokens: '489',
      displayPercent: '0.2',
      title: 'Next request: 489 / 262k tokens (0.2%)',
    })
  })

  it('finds a mention query only when the at-sign starts the current token', () => {
    expect(findMentionMatch('ask @skill', 'ask @skill'.length)).toEqual({
      query: 'skill',
      startOffset: 4,
    })
    expect(findMentionMatch('email@test', 'email@test'.length)).toBeNull()
    expect(findMentionMatch('ask @two words', 'ask @two words'.length)).toBeNull()
  })

  it('builds thinking labels and titles from model capability state', () => {
    expect(hasOnlyOffThinkingLevel(['off'])).toBe(true)
    expect(hasOnlyOffThinkingLevel(['off', 'low'])).toBe(false)
    expect(getThinkingButtonLabel(true, true, 'high')).toBe('High')
    expect(getThinkingButtonLabel(true, false, 'high')).toBe('Thinking…')
    expect(
      getThinkingButtonTitle({
        hasSelectedModel: true,
        capabilitiesKnown: true,
        selectedModelOnlySupportsOff: false,
        isAdjustedForModel: true,
        requestedThinkingLevel: 'xhigh',
        effectiveThinkingLevel: 'high',
      }),
    ).toBe('Extra High is not available for this model; using High')
  })
})
