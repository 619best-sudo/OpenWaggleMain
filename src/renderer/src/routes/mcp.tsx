import { createFileRoute } from '@tanstack/react-router'
import { McpRouteSurface } from './-mcp-route-surface'

export const Route = createFileRoute('/mcp')({
  component: McpRouteSurface,
})
