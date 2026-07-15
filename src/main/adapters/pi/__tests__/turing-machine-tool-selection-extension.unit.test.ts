import { AuthStorage, type ToolInfo } from '@mariozechner/pi-coding-agent'
import { afterEach, describe, expect, it, vi } from 'vitest'
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
        },
      ),
    ).resolves.toEqual(
      expect.objectContaining({
        model: 'turing-machine/turing-machine',
      }),
    )
  })

  it('does not override the provider payload model (routing happens per tool call)', async () => {
    // The orchestrator turn is never re-routed here anymore. Tool-model routing
    // is applied per tool call by the runtime's routed-authoring step, so this
    // hook must leave the payload model untouched even when the session contains
    // an approved tool-permission resolution.
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
            messages: [{ role: 'user', content: 'Edit the file.' }],
            tools: [],
          },
        },
        {
          getModel: () => ({ provider: 'turing-machine', id: 'turing-machine' }),
          getAllTools: () => [],
        },
      ),
    ).resolves.toEqual(
      expect.objectContaining({
        model: 'turing-machine',
      }),
    )
  })
})
