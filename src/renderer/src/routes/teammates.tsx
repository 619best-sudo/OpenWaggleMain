import { createFileRoute } from '@tanstack/react-router'
import { TeammatesRouteSurface } from './-teammates-route-surface'

export const Route = createFileRoute('/teammates')({
  component: TeammatesRouteSurface,
})
