import { create } from 'zustand'

/**
 * A request to open the diff panel and scroll to one file.
 *
 * The chat tool strips (read/write/edit headers) cannot call
 * `useDiffRouteNavigation` themselves: opening the panel is a route-search
 * navigation, which needs router context the transcript components render
 * without (and is awkward to mount inside the transcript's own tree). So a
 * click publishes here, `ChatRouteSurface` (which owns the open/close
 * callbacks) turns it into navigation, and `DiffPanel` consumes the `path`
 * once its data has loaded — scrolling to `diff-file-<path>` the same way the
 * file tree does.
 *
 * `requestId` increments per request so clicking "View file" on the SAME file
 * while the panel is already open still re-fires the scroll (the `path` alone
 * would not change, and a consumed-then-cleared target must not look like a
 * fresh request).
 */
export interface DiffViewTarget {
  /** Repo-root-relative path — `DiffPanel`'s section ids are git paths. */
  readonly path: string
  readonly requestId: number
}

interface DiffViewTargetState {
  readonly target: DiffViewTarget | null
  requestViewFile: (path: string) => void
  clearTarget: () => void
}

export const useDiffViewTargetStore = create<DiffViewTargetState>((set) => ({
  target: null,
  requestViewFile: (path) =>
    set((state) => ({
      target: { path, requestId: (state.target?.requestId ?? 0) + 1 },
    })),
  clearTarget: () => set({ target: null }),
}))
