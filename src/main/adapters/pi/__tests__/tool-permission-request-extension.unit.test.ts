import { afterEach, describe, expect, it } from 'vitest'
import {
  createToolPermissionRequestExtension,
  registerApprovedToolPermission,
} from '../tool-permission-request-extension'
import {
  clearApprovedToolExecutionModels,
  consumeApprovedToolExecutionModel,
} from '../tool-execution-model-state'

type ToolCallHandler = (event: { toolName: string; input: unknown }) => Promise<unknown>

function createExtensionHarness() {
  const handlers = new Map<string, ToolCallHandler>()
  return {
    pi: {
      on: (event: string, handler: ToolCallHandler) => {
        handlers.set(event, handler)
      },
    },
    getToolCallHandler() {
      const handler = handlers.get('tool_call')
      if (!handler) {
        throw new Error('tool_call handler was not registered')
      }
      return handler
    },
  }
}

describe('createToolPermissionRequestExtension', () => {
  afterEach(() => {
    clearApprovedToolExecutionModels()
  })

  it('returns a request envelope for bash tool calls', async () => {
    const harness = createExtensionHarness()
    createToolPermissionRequestExtension({ toolNames: ['bash'] })(harness.pi as never)

    const result = (await harness.getToolCallHandler()({
      toolName: 'bash',
      input: { command: 'ls -la', timeout: 5000 },
    })) as Record<string, unknown>

    expect(result).toEqual(
      expect.objectContaining({
        terminate: true,
        request: expect.objectContaining({
          model: 'poolside/laguna-xs-2.1',
          permission: expect.objectContaining({
            kind: 'user-approval',
            toolName: 'bash',
            title: 'Approve Bash',
          }),
        }),
        details: expect.objectContaining({
          kind: 'tool_permission_request',
          toolName: 'bash',
          input: { command: 'ls -la', timeout: 5000 },
          request: expect.objectContaining({
            model: 'poolside/laguna-xs-2.1',
          }),
        }),
      }),
    )
  })

  it('does not intercept non-guarded tools', async () => {
    const harness = createExtensionHarness()
    createToolPermissionRequestExtension({ toolNames: ['bash'] })(harness.pi as never)

    await expect(
      harness.getToolCallHandler()({
        toolName: 'read',
        input: { path: 'src/main.ts' },
      }),
    ).resolves.toBeUndefined()
  })

  it('returns a request envelope for read tool calls', async () => {
    const harness = createExtensionHarness()
    createToolPermissionRequestExtension({ toolNames: ['bash', 'read'] })(harness.pi as never)

    const result = (await harness.getToolCallHandler()({
      toolName: 'read',
      input: { path: 'src/main.ts' },
    })) as Record<string, unknown>

    expect(result).toEqual(
      expect.objectContaining({
        terminate: true,
        request: expect.objectContaining({
          model: 'bytedance-seed/seed-2.0-mini',
          permission: expect.objectContaining({
            kind: 'user-approval',
            toolName: 'read',
            title: 'Approve Read',
            description: 'OpenWaggle requested permission before reading src/main.ts.',
          }),
        }),
        details: expect.objectContaining({
          kind: 'tool_permission_request',
          toolName: 'read',
          input: { path: 'src/main.ts' },
          request: expect.objectContaining({
            model: 'bytedance-seed/seed-2.0-mini',
          }),
        }),
        content: [
          {
            type: 'text',
            text: 'Permission required before running read: src/main.ts',
          },
        ],
      }),
    )
  })

  it('routes code-editing tools to the edit model', async () => {
    const harness = createExtensionHarness()
    createToolPermissionRequestExtension({ toolNames: ['write'] })(harness.pi as never)

    const result = (await harness.getToolCallHandler()({
      toolName: 'write',
      input: { path: 'src/main.ts', content: 'console.log("hi")' },
    })) as Record<string, unknown>

    expect(result).toEqual(
      expect.objectContaining({
        request: expect.objectContaining({
          model: 'tencent/hy3',
        }),
      }),
    )
  })

  it('allows the next approved matching tool call through', async () => {
    const harness = createExtensionHarness()
    createToolPermissionRequestExtension({ toolNames: ['bash'] })(harness.pi as never)
    registerApprovedToolPermission({
      toolCallId: 'tool-1',
      toolName: 'bash',
      input: { command: 'ls -la', timeout: 5000 },
    })

    await expect(
      harness.getToolCallHandler()({
        toolName: 'bash',
        input: { command: 'ls -la', timeout: 5000 },
      }),
    ).resolves.toBeUndefined()

    await expect(
      harness.getToolCallHandler()({
        toolName: 'bash',
        input: { command: 'ls -la', timeout: 5000 },
      }),
    ).resolves.toEqual(
      expect.objectContaining({
        terminate: true,
      }),
    )
  })

  it('skips permission requests when allow-all mode is active', async () => {
    const harness = createExtensionHarness()
    createToolPermissionRequestExtension({
      toolNames: ['bash', 'read'],
      getPermissionMode: () => 'allow-all',
    })(harness.pi as never)

    await expect(
      harness.getToolCallHandler()({
        toolName: 'bash',
        input: { command: 'ls -la' },
      }),
    ).resolves.toBeUndefined()
  })

  it('queues a tool execution model when allow-all mode is active', async () => {
    const harness = createExtensionHarness()
    createToolPermissionRequestExtension({
      toolNames: ['bash', 'read'],
      getPermissionMode: () => 'allow-all',
    })(harness.pi as never)

    await expect(
      harness.getToolCallHandler()({
        toolName: 'read',
        input: { path: 'src/main.ts' },
      }),
    ).resolves.toBeUndefined()

    expect(consumeApprovedToolExecutionModel()).toBe('bytedance-seed/seed-2.0-mini')
  })
})
