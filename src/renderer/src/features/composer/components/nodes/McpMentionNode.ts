import {
  $applyNodeReplacement,
  DecoratorNode,
  type DOMExportOutput,
  type EditorConfig,
  type NodeKey,
  type SerializedLexicalNode,
  type Spread,
} from 'lexical'
import type { ReactNode } from 'react'
import { createElement } from 'react'
import { McpMentionChip } from './McpMentionChip'

export type SerializedMcpMentionNode = Spread<{ serverName: string }, SerializedLexicalNode>

/**
 * An MCP server mention in the composer: the badge inserted when the user picks
 * a server from the "/" palette. Its text content is `/serverName` — the same
 * token the run pipeline parses out of `payload.text` to gate which MCPs attach
 * to the run (see `session-tool-selection.ts` in the main process), so the badge
 * IS the selection.
 */
export class McpMentionNode extends DecoratorNode<ReactNode> {
  __serverName: string

  static getType() {
    return 'mcp-mention'
  }

  static clone(node: McpMentionNode) {
    return new McpMentionNode(node.__serverName, node.__key)
  }

  constructor(serverName: string, key?: NodeKey) {
    super(key)
    this.__serverName = serverName
  }

  createDOM(_config: EditorConfig) {
    const span = document.createElement('span')
    span.style.display = 'inline'
    return span
  }

  updateDOM() {
    return false
  }

  exportDOM(): DOMExportOutput {
    const element = document.createElement('span')
    element.textContent = `/${this.__serverName}`
    return { element }
  }

  static importDOM() {
    return null
  }

  static importJSON(serializedNode: SerializedMcpMentionNode) {
    return $createMcpMentionNode(serializedNode.serverName)
  }

  exportJSON() {
    return {
      ...super.exportJSON(),
      serverName: this.__serverName,
      type: 'mcp-mention',
      version: 1,
    }
  }

  getTextContent() {
    return `/${this.__serverName}`
  }

  isInline() {
    return true
  }

  decorate(): ReactNode {
    return createElement(McpMentionChip, {
      serverName: this.__serverName,
    })
  }
}

export function $createMcpMentionNode(serverName: string): McpMentionNode {
  return $applyNodeReplacement(new McpMentionNode(serverName))
}
