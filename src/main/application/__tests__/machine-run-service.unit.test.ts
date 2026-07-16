import type { Message } from '@shared/types/agent'
import { MessageId, SupportedModelId, ToolCallId } from '@shared/types/brand'
import type { MachineExecutionState } from '@shared/types/machine'
import { describe, expect, it } from 'vitest'
import {
  getVisibleMachineTaskMessages,
  isInternalToolHandoffAssistantText,
  normalizeMachineState,
  parseMachinePlan,
} from '../machine-run-service'

function assistantMessage(id: string, parts: Message['parts']): Message {
  return {
    id: MessageId(id),
    role: 'assistant',
    createdAt: 1,
    parts,
  }
}

describe('machine-run-service visible task output', () => {
  it('parses planner JSON even when the model wraps it in prose', () => {
    expect(
      parseMachinePlan(`The plan covers implementation, validation, and repair.

{
  "goal": "Build the requested feature",
  "tasks": [
    {
      "id": "task-1",
      "title": "Create the main component",
      "prompt": "Implement the main feature component and wire it into the page.",
      "dependsOn": []
    }
  ]
}

Let me know if you want a more detailed breakdown.`),
    ).toEqual({
      goal: 'Build the requested feature',
      tasks: [
        {
          id: 'task-1',
          title: 'Create the main component',
          prompt: 'Implement the main feature component and wire it into the page.',
          dependsOn: [],
          kind: 'logic',
          complexity: 'medium',
        },
      ],
    })
  })

  it('carries planner-provided kind and complexity through', () => {
    const plan = parseMachinePlan(`{
  "goal": "Draw the sun",
  "tasks": [
    {
      "id": "task-1",
      "title": "Add the sun SVG",
      "prompt": "Add a richly shaded sun as an SVG.",
      "dependsOn": [],
      "kind": "svg",
      "complexity": "high"
    }
  ]
}`)
    expect(plan.tasks[0]).toMatchObject({ kind: 'svg', complexity: 'high' })
  })

  it('recognizes internal tool handoff assistant payloads', () => {
    expect(
      isInternalToolHandoffAssistantText(
        `[TOOL_HANDOFF]
{"type":"tool_handoff","tool":"read","tool_call_id":"call_123","status":"ok"}`,
      ),
    ).toBe(true)

    expect(isInternalToolHandoffAssistantText('Created the file successfully.')).toBe(false)
  })

  it('ignores tool-handoff-only assistant output when deciding whether a task visibly executed', () => {
    const visibleMessages = getVisibleMachineTaskMessages([
      assistantMessage('assistant-handoff', [
        {
          type: 'text',
          text: `[TOOL_HANDOFF]
{"type":"tool_handoff","tool":"read","tool_call_id":"call_123","status":"ok"}`,
        },
      ]),
    ])

    expect(visibleMessages).toEqual([])
  })

  it('keeps assistant messages that contain tool activity or visible text output', () => {
    const visibleMessages = getVisibleMachineTaskMessages([
      assistantMessage('assistant-tool', [
        {
          type: 'tool-call',
          toolCall: {
            id: ToolCallId('tool-call-1'),
            name: 'write',
            args: { path: 'index.html' },
            state: 'input-complete',
          },
        },
        {
          type: 'tool-result',
          toolResult: {
            id: ToolCallId('tool-call-1'),
            name: 'write',
            args: { path: 'index.html' },
            result: { ok: true },
            isError: false,
            duration: 10,
            details: null,
          },
        },
      ]),
      assistantMessage('assistant-text', [{ type: 'text', text: 'Created `index.html`.' }]),
    ])

    expect(visibleMessages.map((message) => String(message.id))).toEqual([
      'assistant-tool',
      'assistant-text',
    ])
  })
})

describe('normalizeMachineState', () => {
  function state(): MachineExecutionState {
    return {
      goal: 'Build the page',
      phase: 'running',
      tasks: [
        { id: 't1', title: 'First', prompt: 'do first', status: 'completed' },
        { id: 't2', title: 'Second', prompt: 'do second', status: 'running' },
        { id: 't3', title: 'Third', prompt: 'do third', status: 'pending' },
        { id: 't4', title: 'Fourth', prompt: 'do fourth', status: 'failed' },
      ],
      model: SupportedModelId('openai/gpt-5.5'),
      thinkingLevel: 'medium',
      generatedAt: 1,
    }
  }

  it('sets isCompleted to mirror status === completed for every task', () => {
    const normalized = normalizeMachineState(state())
    expect(normalized.tasks.map((task) => task.isCompleted)).toEqual([true, false, false, false])
  })

  it('does not change task status or ordering', () => {
    const normalized = normalizeMachineState(state())
    expect(normalized.tasks.map((task) => `${task.id}:${task.status}`)).toEqual([
      't1:completed',
      't2:running',
      't3:pending',
      't4:failed',
    ])
  })
})
