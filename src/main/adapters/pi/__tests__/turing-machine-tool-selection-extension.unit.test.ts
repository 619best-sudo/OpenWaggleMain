import { AuthStorage, type ToolInfo } from '@mariozechner/pi-coding-agent'
import { TOOL_PERMISSION_CUSTOM_TYPE } from '@shared/types/tool-permission'
import { afterEach, describe, expect, it, vi } from 'vitest'
import {
  clearApprovedToolExecutionModels,
  registerApprovedToolExecutionModel,
} from '../tool-execution-model-state'
import {
  annotateTuringMachineTools,
  buildToolSelectionCacheKey,
  createTuringMachineToolSelectionExtension,
  extractLatestUserMessageText,
} from '../turing-machine-tool-selection-extension'

type BeforeProviderRequestHandler = (
  event: { payload: unknown },
  ctx: {
    getModel: () => { provider: string; id: string } | undefined
    getAllTools: () => ToolInfo[]
    sessionManager?: {
      getEntries: () => readonly unknown[]
    }
  },
) => Promise<unknown>

function createToolInfo(
  name: string,
  sourceInfo: ToolInfo['sourceInfo'],
  description = `${name} description`,
): ToolInfo {
  return {
    name,
    description,
    parameters: { type: 'object', properties: {} },
    sourceInfo,
  }
}

function createExtensionHarness() {
  const handlers = new Map<string, BeforeProviderRequestHandler>()
  return {
    pi: {
      on: (event: string, handler: BeforeProviderRequestHandler) => {
        handlers.set(event, handler)
      },
    },
    getBeforeProviderRequestHandler() {
      const handler = handlers.get('before_provider_request')
      if (!handler) {
        throw new Error('before_provider_request handler was not registered')
      }
      return handler
    },
  }
}

afterEach(() => {
  vi.unstubAllGlobals()
  clearApprovedToolExecutionModels()
})

describe('turing-machine tool selection extension helpers', () => {
  it('extracts the latest user message text from string and part-based content', () => {
    expect(
      extractLatestUserMessageText([
        { role: 'user', content: 'First request' },
        {
          role: 'assistant',
          content: 'Working...',
        },
        {
          role: 'user',
          content: [
            { type: 'text', text: 'Please use ' },
            { type: 'text', text: 'Remotion.' },
          ],
        },
      ]),
    ).toBe('Please use \nRemotion.')
  })

  it('builds a stable cache key from the latest user message and annotated tools', () => {
    const tools = [
      {
        type: 'function',
        function: { name: 'Read' },
        metadata: { origin: 'builtin' },
      },
      {
        type: 'function',
        function: { name: 'mcp' },
        metadata: { origin: 'external', categories: ['remotion', 'mcp'] },
      },
    ]

    expect(
      buildToolSelectionCacheKey({
        latestUserMessage: 'Create an intro video',
        tools,
      }),
    ).toContain('Create an intro video')
  })

  it('annotates built-in and MCP tools with routing metadata', () => {
    const annotated = annotateTuringMachineTools({
      tools: [
        { type: 'function', function: { name: 'Read' } },
        { type: 'function', function: { name: 'mcp' } },
      ],
      allTools: [
        createToolInfo('Read', {
          path: '<builtin:Read>',
          source: 'builtin',
          scope: 'temporary',
          origin: 'top-level',
        }),
        createToolInfo('mcp', {
          path: '/tmp/node_modules/pi-mcp-adapter/index.ts',
          source: 'settings',
          scope: 'project',
          origin: 'package',
        }),
      ],
      mcpServerNames: ['remotion', 'figma'],
    })

    expect(annotated).toEqual([
      expect.objectContaining({
        metadata: expect.objectContaining({
          origin: 'builtin',
        }),
      }),
      expect.objectContaining({
        metadata: expect.objectContaining({
          origin: 'external',
          kind: 'mcp',
          categories: expect.arrayContaining(['mcp', 'remotion', 'figma']),
        }),
      }),
    ])
  })
})

describe('createTuringMachineToolSelectionExtension', () => {
  it('starts selector fetch on the first request and injects selected categories on the later loop call', async () => {
    const fetchMock = vi.fn().mockResolvedValue(
      new Response(
        JSON.stringify({
          selectedExternalCategories: ['remotion'],
        }),
        {
          status: 200,
          headers: { 'Content-Type': 'application/json' },
        },
      ),
    )
    vi.stubGlobal('fetch', fetchMock)

    const authStorage = AuthStorage.inMemory({
      'turing-machine': {
        type: 'api_key',
        key: 'secret-token',
      },
    })
    const harness = createExtensionHarness()
    const factory = createTuringMachineToolSelectionExtension({
      authStorage,
      baseUrl: 'https://backend.example.com/turing-machine',
      mcpServerNames: ['remotion'],
    })
    factory(harness.pi as never)

    const handler = harness.getBeforeProviderRequestHandler()
    const ctx = {
      getModel: () => ({ provider: 'turing-machine', id: 'turing-machine' }),
      getAllTools: () =>
        [
          createToolInfo('Read', {
            path: '<builtin:Read>',
            source: 'builtin',
            scope: 'temporary',
            origin: 'top-level',
          }),
          createToolInfo('mcp', {
            path: '/tmp/node_modules/pi-mcp-adapter/index.ts',
            source: 'settings',
            scope: 'project',
            origin: 'package',
          }),
        ] satisfies ToolInfo[],
      sessionManager: {
        getEntries: () => [],
      },
    }
    const payload = {
      model: 'turing-machine',
      messages: [{ role: 'user', content: 'Create a remotion intro animation.' }],
      tools: [
        { type: 'function', function: { name: 'Read' } },
        { type: 'function', function: { name: 'mcp' } },
      ],
    }

    const firstResult = (await handler({ payload }, ctx)) as Record<string, unknown>

    expect(firstResult.metadata).toBeUndefined()
    expect(firstResult.tools).toEqual([
      expect.objectContaining({
        metadata: expect.objectContaining({ origin: 'builtin' }),
      }),
      expect.objectContaining({
        metadata: expect.objectContaining({
          origin: 'external',
          kind: 'mcp',
          categories: expect.arrayContaining(['mcp', 'remotion']),
        }),
      }),
    ])

    await Promise.resolve()

    const selectorCall = fetchMock.mock.calls.find(
      ([url]) => url === 'https://backend.example.com/turing-machine/tool-selection',
    )
    expect(selectorCall).toBeDefined()
    expect(selectorCall?.[1]).toEqual(
      expect.objectContaining({
        method: 'POST',
        headers: expect.objectContaining({
          Authorization: 'Bearer secret-token',
          'Content-Type': 'application/json',
        }),
      }),
    )
    const selectorRequest = selectorCall?.[1]
    expect(typeof selectorRequest?.body).toBe('string')
    expect(JSON.parse(selectorRequest.body as string)).toEqual(
      expect.objectContaining({
        tools: [
          expect.objectContaining({
            function: expect.objectContaining({ name: 'mcp' }),
            metadata: expect.objectContaining({
              origin: 'external',
              kind: 'mcp',
            }),
          }),
        ],
      }),
    )

    const secondResult = (await handler({ payload }, ctx)) as Record<string, unknown>

    expect(secondResult.metadata).toEqual(
      expect.objectContaining({
        selectedExternalToolCategories: ['remotion'],
        toolSelection: expect.objectContaining({
          selectedExternalToolCategories: ['remotion'],
          categories: ['remotion'],
        }),
      }),
    )
  })

  it('leaves non-Turing Machine requests untouched', async () => {
    vi.stubGlobal('fetch', vi.fn())

    const authStorage = AuthStorage.inMemory()
    const harness = createExtensionHarness()
    createTuringMachineToolSelectionExtension({
      authStorage,
      baseUrl: 'https://backend.example.com/turing-machine',
    })(harness.pi as never)

    const handler = harness.getBeforeProviderRequestHandler()
    const payload = {
      model: 'gpt-5.5',
      messages: [{ role: 'user', content: 'Hello' }],
      tools: [{ type: 'function', function: { name: 'Read' } }],
    }

    await expect(
      handler(
        { payload },
        {
          getModel: () => ({ provider: 'openai', id: 'gpt-5.5' }),
          getAllTools: () => [],
          sessionManager: {
            getEntries: () => [],
          },
        },
      ),
    ).resolves.toBe(payload)
  })

  it('handles full turing-machine model refs in provider payloads', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue({
        ok: true,
        json: vi.fn().mockResolvedValue({ selectedExternalCategories: [] }),
      }),
    )

    const authStorage = AuthStorage.inMemory()
    const harness = createExtensionHarness()
    createTuringMachineToolSelectionExtension({
      authStorage,
      baseUrl: 'https://backend.example.com/turing-machine',
    })(harness.pi as never)

    const handler = harness.getBeforeProviderRequestHandler()
    await expect(
      handler(
        {
          payload: {
            model: 'turing-machine/turing-machine',
            messages: [],
            tools: [],
          },
        },
        {
          getModel: () => undefined,
          getAllTools: () => [],
          sessionManager: {
            getEntries: () => [],
          },
        },
      ),
    ).resolves.toEqual(
      expect.objectContaining({
        model: 'turing-machine/turing-machine',
      }),
    )
  })

  it('overrides the provider payload model for approved tool permission resumes', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue({
        ok: true,
        json: vi.fn().mockResolvedValue({ selectedExternalCategories: [] }),
      }),
    )

    const authStorage = AuthStorage.inMemory()
    const harness = createExtensionHarness()
    createTuringMachineToolSelectionExtension({
      authStorage,
      baseUrl: 'https://backend.example.com/turing-machine',
    })(harness.pi as never)

    const handler = harness.getBeforeProviderRequestHandler()
    const payload = {
      model: 'turing-machine',
      messages: [],
      tools: [],
    }

    await expect(
      handler(
        { payload },
        {
          getModel: () => ({ provider: 'turing-machine', id: 'turing-machine' }),
          getAllTools: () => [],
          sessionManager: {
            getEntries: () => [
              {
                type: 'custom',
                customType: TOOL_PERMISSION_CUSTOM_TYPE,
                details: {
                  kind: 'tool-permission-resolution',
                  decision: 'approved',
                  model: 'tencent/hy3',
                },
              },
            ],
          },
        },
      ),
    ).resolves.toEqual(
      expect.objectContaining({
        model: 'tencent/hy3',
      }),
    )
  })

  it('accepts requestedToolModel from the hidden permission-resolution entry', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue({
        ok: true,
        json: vi.fn().mockResolvedValue({ selectedExternalCategories: [] }),
      }),
    )

    const authStorage = AuthStorage.inMemory()
    const harness = createExtensionHarness()
    createTuringMachineToolSelectionExtension({
      authStorage,
      baseUrl: 'https://backend.example.com/turing-machine',
    })(harness.pi as never)

    const handler = harness.getBeforeProviderRequestHandler()
    await expect(
      handler(
        {
          payload: {
            model: 'turing-machine',
            messages: [],
            tools: [],
          },
        },
        {
          getModel: () => ({ provider: 'turing-machine', id: 'turing-machine' }),
          getAllTools: () => [],
          sessionManager: {
            getEntries: () => [
              {
                type: 'custom',
                customType: TOOL_PERMISSION_CUSTOM_TYPE,
                details: {
                  kind: 'tool-permission-resolution',
                  decision: 'approved',
                  requestedToolModel: 'bytedance-seed/seed-2.0-mini',
                },
              },
            ],
          },
        },
      ),
    ).resolves.toEqual(
      expect.objectContaining({
        model: 'bytedance-seed/seed-2.0-mini',
      }),
    )
  })

  it('uses a queued approved tool model override before falling back to session entries', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue({
        ok: true,
        json: vi.fn().mockResolvedValue({ selectedExternalCategories: [] }),
      }),
    )

    registerApprovedToolExecutionModel('bytedance-seed/seed-2.0-mini')

    const authStorage = AuthStorage.inMemory()
    const harness = createExtensionHarness()
    createTuringMachineToolSelectionExtension({
      authStorage,
      baseUrl: 'https://backend.example.com/turing-machine',
    })(harness.pi as never)

    const handler = harness.getBeforeProviderRequestHandler()
    await expect(
      handler(
        {
          payload: {
            model: 'turing-machine',
            messages: [],
            tools: [],
          },
        },
        {
          getModel: () => ({ provider: 'turing-machine', id: 'turing-machine' }),
          getAllTools: () => [],
          sessionManager: {
            getEntries: () => [],
          },
        },
      ),
    ).resolves.toEqual(
      expect.objectContaining({
        model: 'bytedance-seed/seed-2.0-mini',
      }),
    )
  })
})
