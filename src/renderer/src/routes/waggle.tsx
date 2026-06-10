import { createFileRoute } from '@tanstack/react-router'
import { WaggleRouteSurface } from './-waggle-route-surface'

export const Route = createFileRoute('/waggle')({
  component: WaggleRouteSurface,
})
