import { useSessionStore } from '@/features/sessions/state'

/**
 * The open repo root for the active session, sourced from the session
 * workspace. Used to relativize file paths shown in the transcript so users
 * see `src/main/foo.ts` instead of `/Users/.../OpenWaggleMain/src/main/foo.ts`.
 *
 * Kept in its own module (separate from the pure `relativeToProject` helper) so
 * tests of the pure helper don't have to load the session store / IPC graph.
 */
export function useActiveProjectPath(): string | null {
  return useSessionStore((state) => state.activeWorkspace?.tree.session.projectPath ?? null)
}
