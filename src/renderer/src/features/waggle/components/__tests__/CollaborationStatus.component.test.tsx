import { SessionId, SupportedModelId } from '@shared/types/brand'
import { DEFAULT_SETTINGS } from '@shared/types/settings'
import { WAGGLE_INHERIT_MODEL, type WaggleConfig } from '@shared/types/waggle'
import { fireEvent, render, screen } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { usePreferencesStore } from '@/features/settings/state'
import { useWaggleStore } from '@/features/waggle/state'
import { WaggleCollaborationStatus } from '../CollaborationStatus'

const SESSION_ID = SessionId('session-1')
const SELECTED_MODEL = SupportedModelId('openai/gpt-5.5')

function inheritedConfig(): WaggleConfig {
  return {
    mode: 'sequential',
    agents: [
      {
        label: 'Architect',
        model: WAGGLE_INHERIT_MODEL,
        roleDescription: 'Plans the implementation',
        color: 'blue',
      },
      {
        label: 'Reviewer',
        model: WAGGLE_INHERIT_MODEL,
        roleDescription: 'Reviews the implementation',
        color: 'amber',
      },
    ],
    stop: { primary: 'consensus', maxTurnsSafety: 4 },
  }
}

describe('WaggleCollaborationStatus', () => {
  beforeEach(() => {
    useWaggleStore.getState().reset()
    usePreferencesStore.setState({
      settings: { ...DEFAULT_SETTINGS, selectedModel: SELECTED_MODEL },
      isLoaded: true,
      loadError: null,
    })
  })

  it('renders inherited agent models as the selected standard model without materializing config', () => {
    const config = inheritedConfig()
    useWaggleStore.getState().setConfig(config, SESSION_ID)

    render(<WaggleCollaborationStatus currentSessionId={SESSION_ID} onStop={vi.fn()} />)

    expect(screen.getAllByText(/GPT 5.5/)).toHaveLength(2)
    expect(screen.queryByText(/\$inherit/)).not.toBeInTheDocument()
    expect(screen.getByText(/Waggle ready · Sequential · 4 turns/)).toBeInTheDocument()
    expect(useWaggleStore.getState().activeConfig).toBe(config)
  })

  it('shows current and total turns while running', () => {
    const config = inheritedConfig()
    useWaggleStore.getState().startCollaboration(SESSION_ID, config)
    useWaggleStore
      .getState()
      .handleTurnEvent({ type: 'turn-start', turnNumber: 1, agentIndex: 1, agentLabel: 'Reviewer' })

    render(<WaggleCollaborationStatus currentSessionId={SESSION_ID} onStop={vi.fn()} />)

    expect(screen.getByText(/Turn 2\/4: Reviewer · GPT 5.5/)).toBeInTheDocument()
  })

  it('shows recently registered Waggle artifacts with exact downstream file guidance', () => {
    const config = inheritedConfig()
    useWaggleStore.getState().startCollaboration(SESSION_ID, config)
    useWaggleStore.getState().handleTurnEvent({
      type: 'artifact-registered',
      artifact: {
        id: 'waggle-artifact-001',
        kind: 'video',
        path: '/tmp/generated/hero.mp4',
        uri: 'file:///tmp/generated/hero.mp4',
        mimeType: 'video/mp4',
        sourceTool: 'generate-video',
        createdByAgentIndex: 0,
        createdByAgentLabel: 'Architect',
        turnNumber: 1,
        transport: {
          fileName: 'hero.mp4',
          sizeBytes: 2_400_000,
          preferredFieldNames: ['path', 'filePath', 'inputPath'],
          fallbackFieldNames: ['uri', 'fileUri', 'url'],
          base64Mode: 'avoid',
        },
      },
    })

    render(<WaggleCollaborationStatus currentSessionId={SESSION_ID} onStop={vi.fn()} />)

    expect(screen.getByText(/waggle artifacts/i)).toBeInTheDocument()
    expect(
      screen.getByText(
        /when using mcps, always map artifact starter payload values into the tool schema exactly/i,
      ),
    ).toBeInTheDocument()
    expect(screen.getByText(/waggle-artifact-001/i)).toBeInTheDocument()
    expect(screen.getByText('/tmp/generated/hero.mp4')).toBeInTheDocument()
    expect(screen.getByText(/prefer `path`, `filePath`, `inputPath`/i)).toBeInTheDocument()
    expect(screen.getByText(/fallback `uri`, `fileUri`, `url`/i)).toBeInTheDocument()
    expect(
      screen.getByText(
        /prefer exact path or file uri\. avoid base64 unless the mcp has no path or uri option/i,
      ),
    ).toBeInTheDocument()
  })

  it('shows a Turing follow-up prompt CTA after completion and forwards clicks', () => {
    const config = {
      mode: 'sequential' as const,
      agents: [
        {
          label: 'Context Reader',
          model: WAGGLE_INHERIT_MODEL,
          roleDescription: 'Reads the request',
          color: 'blue' as const,
        },
        {
          label: 'Installed Waggle Selector',
          model: WAGGLE_INHERIT_MODEL,
          roleDescription: 'Selects the next waggle',
          color: 'amber' as const,
        },
      ],
      stop: { primary: 'consensus' as const, maxTurnsSafety: 4 },
    }
    const onUseFollowUpPrompt = vi.fn()

    useWaggleStore.getState().startCollaboration(SESSION_ID, config)
    useWaggleStore.getState().handleTurnEvent({
      type: 'collaboration-complete',
      reason: 'Routing complete',
      totalTurns: 2,
    })

    render(
      <WaggleCollaborationStatus
        currentSessionId={SESSION_ID}
        onStop={vi.fn()}
        onUseFollowUpPrompt={onUseFollowUpPrompt}
        followUpSuggestion={{
          nextWaggle: 'product-planning',
          examplePrompt: 'Inspect auth-related files and write an MVP plan.',
          fallbackWaggle: 'code-review',
        }}
      />,
    )

    expect(screen.getByText('Suggested Next Waggle')).toBeInTheDocument()
    expect(screen.getByText('product-planning')).toBeInTheDocument()
    expect(screen.getByText('code-review')).toBeInTheDocument()

    fireEvent.click(screen.getByRole('button', { name: 'Use Example Prompt' }))

    expect(onUseFollowUpPrompt).toHaveBeenCalledWith({
      nextWaggle: 'product-planning',
      examplePrompt: 'Inspect auth-related files and write an MVP plan.',
      fallbackWaggle: 'code-review',
    })
  })
})
