/**
 * Convert an absolute (or nested) path to one relative to `projectRoot` when it
 * lives inside the repo. Falls back to the original string when:
 *   - the path is already relative (returned unchanged)
 *   - the path is outside the repo (returned unchanged, so users still see the
 *     real location for out-of-workspace files)
 *
 * Platform-agnostic: tolerates both `/` and `\` separators. Pure — no React or
 * store dependencies — so it is unit-testable in isolation.
 */
export function relativeToProject(projectRoot: string | null, fullPath: string): string {
  if (!projectRoot || !fullPath) return fullPath
  const root = projectRoot.replace(/[\\/]+$/, '')
  if (!root) return fullPath

  // Normalize separators for the comparison prefix check.
  const normRoot = root.replace(/\\/g, '/')
  const normPath = fullPath.replace(/\\/g, '/')

  // Exact root → '.'
  if (normPath === normRoot) return '.'

  // Inside the repo (prefix match on a path segment boundary).
  if (normPath.startsWith(`${normRoot}/`)) {
    return fullPath.slice(root.length + 1)
  }
  // Already relative — return as-is.
  if (!/^([a-zA-Z]:)?[\\/]/.test(fullPath)) return fullPath

  // Outside the repo: show the real path so users aren't misled.
  return fullPath
}
