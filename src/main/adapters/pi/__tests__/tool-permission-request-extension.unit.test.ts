import { afterEach, describe, expect, it } from 'vitest'
import {
  clearApprovedToolPermissions,
  createToolPermissionRequestExtension,
  registerApprovedToolPermission,
} from '../tool-permission-request-extension'

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
    clearApprovedToolPermissions()
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

  it('does not intercept non-guarded tools with no routed phase', async () => {
    const harness = createExtensionHarness()
    createToolPermissionRequestExtension({ toolNames: ['bash'] })(harness.pi as never)

    // grep has the default route (no authoring, no reasoning) and is not guarded.
    await expect(
      harness.getToolCallHandler()({
        toolName: 'grep',
        input: { pattern: 'TODO' },
      }),
    ).resolves.toBeUndefined()
  })

  it('surfaces the read route for post-execution reasoning even when unguarded', async () => {
    const harness = createExtensionHarness()
    createToolPermissionRequestExtension({
      toolNames: ['bash'],
      getPermissionMode: () => 'allow-all',
    })(harness.pi as never)

    // read is not guarded here, but its route requests post-execution reasoning,
    // so the runtime must still be handed the routed model.
    await expect(
      harness.getToolCallHandler()({
        toolName: 'read',
        input: { path: 'src/main.ts' },
      }),
    ).resolves.toEqual({
      route: {
        id: 'read',
        model: 'bytedance-seed/seed-2.0-mini',
        authorFinalArgs: false,
        reasonOverResult: true,
      },
    })
  })

  it('matches guarded tool names after normalization', async () => {
    const harness = createExtensionHarness()
    createToolPermissionRequestExtension({ toolNames: ['multi_edit'] })(harness.pi as never)

    const result = (await harness.getToolCallHandler()({
      toolName: 'multi-edit',
      input: { path: 'src/main.ts', edits: [{ oldText: 'a', newText: 'b' }] },
    })) as Record<string, unknown>

    expect(result).toEqual(
      expect.objectContaining({
        terminate: true,
        request: expect.objectContaining({
          permission: expect.objectContaining({
            toolName: 'multi-edit',
          }),
        }),
      }),
    )
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

  it('carries the routed model on the permission request for editing tools', async () => {
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
        route: { id: 'editing', model: 'tencent/hy3', authorFinalArgs: true, reasonOverResult: false },
      }),
    )
  })

  it('allows the next approved tool call through, then re-guards', async () => {
    const harness = createExtensionHarness()
    createToolPermissionRequestExtension({ toolNames: ['bash'] })(harness.pi as never)
    registerApprovedToolPermission({
      toolCallId: 'tool-1',
      toolName: 'bash',
      input: { command: 'ls -la', timeout: 5000 },
    })

    // Approval is tool-name-scoped, so a resumed re-proposal matches even if the
    // arguments differ from the intercepted proposal.
    await expect(
      harness.getToolCallHandler()({
        toolName: 'bash',
        input: { command: 'ls -la --color', timeout: 9000 },
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

  it('emits a routed authoring directive once a mutation is approved', async () => {
    const harness = createExtensionHarness()
    createToolPermissionRequestExtension({ toolNames: ['write'] })(harness.pi as never)
    registerApprovedToolPermission({
      toolCallId: 'tool-1',
      toolName: 'write',
      input: { path: 'src/main.ts', content: 'console.log("hi")' },
    })

    // The resumed run re-proposes the tool: permission is satisfied, so the
    // extension converges on the routed authoring directive instead of pausing.
    await expect(
      harness.getToolCallHandler()({
        toolName: 'write',
        input: { path: 'src/main.ts', content: 'console.log("hi")' },
      }),
    ).resolves.toEqual({
      route: { id: 'editing', model: 'tencent/hy3', authorFinalArgs: true, reasonOverResult: false },
    })
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

  it('emits a routed authoring directive for mutations in allow-all mode', async () => {
    const harness = createExtensionHarness()
    createToolPermissionRequestExtension({
      toolNames: ['bash', 'read', 'write'],
      getPermissionMode: () => 'allow-all',
    })(harness.pi as never)

    // Read surfaces its route for post-execution reasoning (seed reads the file).
    await expect(
      harness.getToolCallHandler()({
        toolName: 'read',
        input: { path: 'src/main.ts' },
      }),
    ).resolves.toEqual({
      route: {
        id: 'read',
        model: 'bytedance-seed/seed-2.0-mini',
        authorFinalArgs: false,
        reasonOverResult: true,
      },
    })

    // Write is a routed mutation → authoring directive even without permission.
    await expect(
      harness.getToolCallHandler()({
        toolName: 'write',
        input: { path: 'src/main.ts', content: 'x' },
      }),
    ).resolves.toEqual({
      route: { id: 'editing', model: 'tencent/hy3', authorFinalArgs: true, reasonOverResult: false },
    })
  })

  it('only intercepts code-editing tools when ask-edit mode is active', async () => {
    const harness = createExtensionHarness()
    createToolPermissionRequestExtension({
      toolNames: ['bash', 'read', 'write', 'edit', 'patch', 'multiedit'],
      getPermissionMode: () => 'ask-edit',
    })(harness.pi as never)

    await expect(
      harness.getToolCallHandler()({
        toolName: 'bash',
        input: { command: 'ls -la' },
      }),
    ).resolves.toBeUndefined()

    const result = (await harness.getToolCallHandler()({
      toolName: 'write',
      input: { path: 'src/main.ts', content: 'console.log("hi")' },
    })) as Record<string, unknown>

    expect(result).toEqual(
      expect.objectContaining({
        terminate: true,
        request: expect.objectContaining({
          model: 'tencent/hy3',
        }),
      }),
    )
  })

  it('does not gate read for permission in ask-edit mode but still routes reasoning', async () => {
    const harness = createExtensionHarness()
    createToolPermissionRequestExtension({
      toolNames: ['bash', 'read', 'write', 'edit', 'patch', 'multiedit'],
      getPermissionMode: () => 'ask-edit',
    })(harness.pi as never)

    // ask-edit does not require permission for read, but the read route still asks
    // the runtime to run post-execution reasoning on seed.
    await expect(
      harness.getToolCallHandler()({
        toolName: 'read',
        input: { path: 'src/main.ts' },
      }),
    ).resolves.toEqual({
      route: {
        id: 'read',
        model: 'bytedance-seed/seed-2.0-mini',
        authorFinalArgs: false,
        reasonOverResult: true,
      },
    })
  })

  it('intercepts edit aliases when edit-family tools are guarded', async () => {
    const harness = createExtensionHarness()
    createToolPermissionRequestExtension({
      toolNames: ['edit', 'write', 'patch', 'multiedit'],
      getPermissionMode: () => 'ask',
    })(harness.pi as never)

    const result = (await harness.getToolCallHandler()({
      toolName: 'write-file',
      input: { path: 'src/main.ts', content: 'console.log("hi")' },
    })) as Record<string, unknown>

    expect(result).toEqual(
      expect.objectContaining({
        terminate: true,
        request: expect.objectContaining({
          model: 'tencent/hy3',
          permission: expect.objectContaining({
            toolName: 'write-file',
          }),
        }),
      }),
    )
  })
})
