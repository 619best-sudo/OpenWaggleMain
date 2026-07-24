import { describe, expect, it } from 'vitest'
import { PERSISTED_PHASE_TRANSCRIPT_CUSTOM_TYPE } from '@shared/types/phase'
import type { SessionNodeRow } from '../types'
import { hydrateStructuralSessionMessage } from '../message-hydration'

function customPhaseTranscriptRow(): SessionNodeRow {
  return {
    id: 'phase-transcript-1',
    session_id: 'session-1',
    parent_id: 'assistant-1',
    pi_entry_type: 'custom',
    kind: 'custom',
    role: null,
    timestamp_ms: 123,
    content_json: JSON.stringify({
      customType: PERSISTED_PHASE_TRANSCRIPT_CUSTOM_TYPE,
      data: {
        version: 1,
        phases: [
          {
            id: 'perform',
            label: 'Understood! Let me implement the requested changes',
            activityText: 'Applying code modifications',
            status: 'completed',
            elapsedMs: 1000,
            summary: 'Updated the title after the restart path restored the phase transcript.',
            tools: [],
          },
        ],
      },
    }),
    metadata_json: '{}',
    branch_hint_id: 'session-1:main',
    path_depth: 2,
    created_order: 2,
  }
}

describe('message hydration', () => {
  it('hydrates persisted phase transcript custom nodes into assistant metadata', () => {
    const message = hydrateStructuralSessionMessage(customPhaseTranscriptRow())

    expect(message).toMatchObject({
      id: 'phase-transcript-1',
      role: 'assistant',
      parts: [],
      metadata: {
        phaseTranscript: {
          version: 1,
          phases: [
            {
              id: 'perform',
              label: 'Understood! Let me implement the requested changes',
              summary:
                'Updated the title after the restart path restored the phase transcript.',
            },
          ],
        },
      },
      createdAt: 123,
    })
  })
})
