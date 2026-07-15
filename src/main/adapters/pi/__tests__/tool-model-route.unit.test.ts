import { describe, expect, it } from 'vitest'
import {
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
