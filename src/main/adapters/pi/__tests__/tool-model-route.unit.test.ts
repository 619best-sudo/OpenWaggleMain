import * as Effect from 'effect/Effect'
import { describe, expect, it } from 'vitest'
import {
  enterMachineTaskRoutingContext,
  getActiveMachineTaskRoutingContext,
  isCodeEditingTool,
  isReadTool,
  resolveEarlyToolAuthoringPlan,
  resolveToolExecutionModel,
  resolveToolRoute,
} from '../tool-model-route'

describe('resolveToolRoute', () => {
  it('routes read tools to the read model with post-execution reasoning', () => {
    expect(resolveToolRoute('read')).toEqual({
      id: 'read',
      model: 'bytedance-seed/seed-2.0-mini',
      authorFinalArgs: false,
      reasonOverResult: true,
    })
  })

  it('routes mutation tools to the editing model with routed authoring enabled', () => {
    for (const toolName of ['edit', 'write', 'patch', 'multiedit']) {
      expect(resolveToolRoute(toolName)).toEqual({
        id: 'editing',
        model: 'tencent/hy3',
        authorFinalArgs: true,
        reasonOverResult: false,
      })
    }
  })

  it('treats edit/write/patch aliases as mutation tools', () => {
    expect(resolveToolRoute('write-file').authorFinalArgs).toBe(true)
    expect(resolveToolRoute('multi_edit').id).toBe('editing')
    expect(isCodeEditingTool('apply-patch')).toBe(true)
  })

  it('routes everything else to the default model without a routed phase', () => {
    for (const toolName of ['bash', 'grep', 'ls', 'some_mcp_tool']) {
      expect(resolveToolRoute(toolName)).toEqual({
        id: 'default',
        model: 'poolside/laguna-xs-2.1',
        authorFinalArgs: false,
        reasonOverResult: false,
      })
    }
  })

  it('normalizes tool names before matching', () => {
    expect(isReadTool('Read')).toBe(true)
    expect(resolveToolRoute('Read').id).toBe('read')
    expect(resolveToolExecutionModel('WRITE')).toBe('tencent/hy3')
  })

  it('keeps resolveToolExecutionModel in sync with the route model', () => {
    for (const toolName of ['read', 'edit', 'bash']) {
      expect(resolveToolExecutionModel(toolName)).toBe(resolveToolRoute(toolName).model)
    }
  })

  it('selects read/mutation models from the kind × complexity matrix when a task context is given', () => {
    const logicHigh = { kind: 'logic', complexity: 'high' } as const
    expect(resolveToolRoute('read', logicHigh).model).toBe('poolside/laguna-xs-2.1')
    expect(resolveToolRoute('edit', logicHigh).model).toBe('tencent/hy3')

    const uiLow = { kind: 'ui', complexity: 'low' } as const
    // A low-complexity UI mutation is cheap enough for the default model.
    expect(resolveToolRoute('write', uiLow).model).toBe('poolside/laguna-xs-2.1')

    // The routed phase flags are unaffected by the context.
    expect(resolveToolRoute('edit', uiLow).authorFinalArgs).toBe(true)
    expect(resolveToolRoute('read', uiLow).reasonOverResult).toBe(true)
  })

  it('leaves non-read/mutation tools on the default model regardless of task context', () => {
    expect(resolveToolRoute('bash', { kind: 'ui', complexity: 'high' }).model).toBe(
      'poolside/laguna-xs-2.1',
    )
  })
})

describe('machine-task routing context', () => {
  it('propagates the context through an Effect run across await boundaries, then clears it', async () => {
    // Mirrors how machine-run-service establishes routing around a task: enter the
    // context in `acquire`, resolve a model deep inside an awaited continuation
    // (as the pi runtime does when a tool call fires), and clear it in `release`.
    const model = await Effect.runPromise(
      Effect.acquireUseRelease(
        Effect.sync(() => enterMachineTaskRoutingContext({ kind: 'logic', complexity: 'high' })),
        () =>
          Effect.promise(async () => {
            await Promise.resolve()
            return resolveToolRoute('read').model
          }),
        () => Effect.sync(() => enterMachineTaskRoutingContext(null)),
      ),
    )

    // logic/high reads route to the default (more capable) model per the matrix —
    // distinct from the flat read fallback, so this proves the context propagated.
    expect(model).toBe('poolside/laguna-xs-2.1')
    // Context is cleared after the run, so routing falls back to the flat defaults.
    expect(getActiveMachineTaskRoutingContext()).toBeNull()
    expect(resolveToolRoute('write').model).toBe('tencent/hy3')
  })
})

describe('resolveEarlyToolAuthoringPlan', () => {
  it('returns a plan only for tools that author their final args', () => {
    for (const toolName of ['edit', 'write', 'patch', 'multiedit', 'write-file']) {
      const plan = resolveEarlyToolAuthoringPlan(toolName)
      expect(plan).not.toBeNull()
      expect(plan?.targetKeys).toContain('path')
      expect(plan?.payloadKeys).toEqual(expect.arrayContaining(['content', 'edits']))
    }
  })

  it('returns null for read and default tools', () => {
    for (const toolName of ['read', 'bash', 'grep', 'ls']) {
      expect(resolveEarlyToolAuthoringPlan(toolName)).toBeNull()
    }
  })
})
