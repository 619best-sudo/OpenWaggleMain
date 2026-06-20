import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import type { HydratedAgentSendPayload } from '@shared/types/agent'
import { SupportedModelId } from '@shared/types/brand'
import type { WaggleConfig, WaggleStreamMetadata } from '@shared/types/waggle'
import { afterEach, describe, expect, it } from 'vitest'
import type { PiModel } from '../../pi-provider-catalog'
import { createWaggleArtifactRegistry } from '../waggle-artifact-registry'
import { buildWaggleTurnCustomMessage } from '../waggle-run-messages'
import {
  collectResponseDirectiveHandoff,
  collectToolExecutionHandoff,
  createWaggleTurnHandoffDraft,
  finalizeWaggleTurnHandoff,
} from '../waggle-turn-handoff'

const tempDirs: string[] = []

function createTempDir() {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'openwaggle-waggle-handoff-'))
  tempDirs.push(directory)
  return directory
}

function createPiModel(input: readonly ('text' | 'image')[]): PiModel {
  return {
    id: 'gpt-4.1',
    name: 'GPT 4.1',
    api: 'responses',
    baseUrl: undefined,
    provider: 'openai',
    input,
    reasoning: true,
    contextWindow: 128_000,
    maxTokens: 16_384,
    availableThinkingLevels: ['off', 'medium', 'high'],
  } as unknown as PiModel
}

function createImageAttachment(id: string, name: string): HydratedAgentSendPayload['attachments'][number] {
  return {
    id,
    kind: 'image',
    name,
    path: `/tmp/${name}`,
    mimeType: 'image/png',
    sizeBytes: 128,
    extractedText: `Attachment preview for ${name}`,
    source: {
      type: 'data',
      value: Buffer.from(name).toString('base64'),
      mimeType: 'image/png',
    },
  }
}

function createPayload(
  overrides?: Partial<HydratedAgentSendPayload>,
): HydratedAgentSendPayload {
  return {
    text: 'Create and refine the visual concept',
    thinkingLevel: 'medium',
    attachments: [],
    ...overrides,
  }
}

function createConfig(): WaggleConfig {
  return {
    mode: 'sequential',
    agents: [
      {
        label: 'Generator',
        model: SupportedModelId('openai/gpt-4.1'),
        roleDescription: 'Generates the concept.',
        color: 'blue',
      },
      {
        label: 'Critic',
        model: SupportedModelId('openai/gpt-4.1'),
        roleDescription: 'Critiques the result.',
        color: 'amber',
      },
    ],
    stop: { primary: 'consensus', maxTurnsSafety: 4 },
  }
}

function createMeta(): WaggleStreamMetadata {
  return {
    agentIndex: 1,
    agentLabel: 'Critic',
    agentColor: 'amber',
    agentModel: SupportedModelId('openai/gpt-4.1'),
    turnNumber: 1,
    collaborationMode: 'sequential',
    sessionId: 'waggle-1',
  }
}

afterEach(() => {
  for (const directory of tempDirs.splice(0)) {
    fs.rmSync(directory, { recursive: true, force: true })
  }
})

function contentParts(content: ReturnType<typeof buildWaggleTurnCustomMessage>['content']) {
  return Array.isArray(content) ? content : [{ type: 'text', text: content }]
}

function isImagePart(
  part: ReturnType<typeof contentParts>[number],
): part is Extract<ReturnType<typeof contentParts>[number], { type: 'image' }> {
  return part.type === 'image'
}

describe('buildWaggleTurnCustomMessage', () => {
  it('adds concise generation handoff text and image outputs for image-capable models', () => {
    const tempDir = createTempDir()
    const imagePath = path.join(tempDir, 'generated.png')
    fs.writeFileSync(imagePath, Buffer.from('fake-image-data'))

    const draft = createWaggleTurnHandoffDraft()
    const meta = createMeta()
    collectToolExecutionHandoff(
      draft,
      createWaggleArtifactRegistry('waggle-1'),
      {
        type: 'tool_execution_end',
        toolCallId: 'tool-1',
        toolName: 'generate-image',
        args: { prompt: 'A cinematic watercolor fox under neon signs' },
        result: {
          outputPath: imagePath,
          raw: { enormous: 'tool-result-payload' },
        },
        isError: false,
        timestamp: 1,
        model: 'openai/gpt-4.1',
      },
      meta,
    )

    const handoff = finalizeWaggleTurnHandoff(draft)
    const message = buildWaggleTurnCustomMessage({
      model: createPiModel(['text', 'image']),
      payload: createPayload(),
      config: createConfig(),
      meta,
      runId: 'run-1',
      handoff,
    })
    const parts = contentParts(message.content)

    expect(parts).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          type: 'text',
          text: expect.stringContaining('Media handoff:'),
        }),
        expect.objectContaining({
          type: 'text',
          text: expect.stringContaining('A cinematic watercolor fox under neon signs'),
        }),
        expect.objectContaining({
          type: 'text',
          text: expect.stringContaining('waggle-artifact-001 (image)'),
        }),
        expect.objectContaining({
          type: 'image',
          mimeType: 'image/png',
          data: Buffer.from('fake-image-data').toString('base64'),
        }),
      ]),
    )

    const textContent = parts.find((part) => part.type === 'text')
    expect(textContent).toBeTruthy()
    const promptText = textContent && 'text' in textContent ? textContent.text : ''
    expect(promptText).toContain(imagePath)
    expect(promptText).toContain('uri: file://')
    expect(promptText).toContain('Artifact usage rules:')
    expect(promptText).toContain(
      'When using MCPs, always map artifact starter payload values into the tool schema exactly.',
    )
    expect(promptText).toContain('MCP starter payload:')
    expect(promptText).toContain('"path"')
    expect(promptText).toContain('"filePath"')
    expect(promptText).toContain('"inputPath"')
    expect(promptText).toContain('"fileUri"')
    expect(promptText).toContain('"url"')
    expect(promptText).toContain('Prefer absolute path fields first')
    expect(promptText).toContain('Do not paraphrase, shorten, or rename artifact paths')
    expect(promptText).not.toContain('tool-result-payload')
  })

  it('keeps media handoff as text-only notes for models without image input', () => {
    const tempDir = createTempDir()
    const imagePath = path.join(tempDir, 'generated.png')
    fs.writeFileSync(imagePath, Buffer.from('fake-image-data'))

    const draft = createWaggleTurnHandoffDraft()
    const meta = createMeta()
    collectToolExecutionHandoff(
      draft,
      createWaggleArtifactRegistry('waggle-1'),
      {
        type: 'tool_execution_end',
        toolCallId: 'tool-2',
        toolName: 'generate-image',
        args: { prompt: 'A clean monochrome poster layout' },
        result: { outputPath: imagePath },
        isError: false,
        timestamp: 2,
        model: 'openai/gpt-4.1',
      },
      meta,
    )

    const message = buildWaggleTurnCustomMessage({
      model: createPiModel(['text']),
      payload: createPayload(),
      config: createConfig(),
      meta,
      runId: 'run-2',
      handoff: finalizeWaggleTurnHandoff(draft),
    })
    const parts = contentParts(message.content)

    expect(parts).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          type: 'text',
          text: expect.stringContaining('waggle-artifact-001 (image)'),
        }),
      ]),
    )
    const textContent = parts.find((part) => part.type === 'text')
    const promptText = textContent && 'text' in textContent ? textContent.text : ''
    expect(promptText).toContain(imagePath)
    expect(promptText).toContain(
      'When using MCPs, always map artifact starter payload values into the tool schema exactly.',
    )
    expect(promptText).toContain('"filePath"')
    expect(promptText).toContain('"fileUri"')
    expect(parts.some((part) => part.type === 'image')).toBe(false)
  })

  it('injects rollback directives from verifier output into the next turn prompt', () => {
    const draft = createWaggleTurnHandoffDraft()
    collectResponseDirectiveHandoff(draft, {
      responseText: `verification verdict: not fixed
evidence reviewed: playwright reproduction and console logs
adjacent flows checked: settings page and save flow
keep or revert current fix: revert
failed-attempt learning for next planner pass: the layout issue comes from stale container sizing, not the button component
exact next loop instructions: revert the failed button patch first, then inspect the parent layout and remeasure bounding boxes`,
    })

    const message = buildWaggleTurnCustomMessage({
      model: createPiModel(['text']),
      payload: createPayload(),
      config: createConfig(),
      meta: createMeta(),
      runId: 'run-rollback',
      handoff: finalizeWaggleTurnHandoff(draft),
    })
    const parts = contentParts(message.content)
    const textContent = parts.find((part) => part.type === 'text')
    const promptText = textContent && 'text' in textContent ? textContent.text : ''

    expect(promptText).toContain('Critical loop directives:')
    expect(promptText).toContain('Rollback required: the previous fix attempt was rejected')
    expect(promptText).toContain(
      'Carry this failed-attempt learning into the next planner pass: the layout issue comes from stale container sizing, not the button component',
    )
    expect(promptText).toContain(
      'Verifier-required next loop instructions: revert the failed button patch first, then inspect the parent layout and remeasure bounding boxes',
    )
  })

  it('caps merged prompt images at four using user images first and latest handoff screenshots next', () => {
    const tempDir = createTempDir()
    const draft = createWaggleTurnHandoffDraft()
    const meta = createMeta()
    const registry = createWaggleArtifactRegistry('waggle-1')

    for (let index = 1; index <= 3; index += 1) {
      const imagePath = path.join(tempDir, `generated-${String(index)}.png`)
      fs.writeFileSync(imagePath, Buffer.from(`fake-image-data-${String(index)}`))

      collectToolExecutionHandoff(
        draft,
        registry,
        {
          type: 'tool_execution_end',
          toolCallId: `tool-${String(index)}`,
          toolName: 'mobile-mcp-qa',
          args: { prompt: `Inspect screenshot ${String(index)}` },
          result: { outputPath: imagePath },
          isError: false,
          timestamp: index,
          model: 'openai/gpt-4.1',
        },
        meta,
      )
    }

    const message = buildWaggleTurnCustomMessage({
      model: createPiModel(['text', 'image']),
      payload: createPayload({
        attachments: [
          createImageAttachment('base-1', 'reference-1.png'),
          createImageAttachment('base-2', 'reference-2.png'),
        ],
      }),
      config: createConfig(),
      meta,
      runId: 'run-3',
      handoff: finalizeWaggleTurnHandoff(draft),
    })
    const parts = contentParts(message.content)

    const imageParts = parts.filter(isImagePart)
    expect(imageParts).toHaveLength(4)
    expect(imageParts.map((part) => part.data)).toEqual([
      Buffer.from('reference-1.png').toString('base64'),
      Buffer.from('reference-2.png').toString('base64'),
      Buffer.from('fake-image-data-2').toString('base64'),
      Buffer.from('fake-image-data-3').toString('base64'),
    ])

    const textContent = parts.find((part) => part.type === 'text')
    const promptText = textContent && 'text' in textContent ? textContent.text : ''
    expect(promptText).toContain('waggle-artifact-001 (image)')
    expect(promptText).toContain('waggle-artifact-002 (image)')
    expect(promptText).toContain('waggle-artifact-003 (image)')
  })
})
