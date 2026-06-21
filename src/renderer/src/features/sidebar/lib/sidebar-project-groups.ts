import type { SessionSummary } from '@shared/types/session'

const EMPTY_UPDATED_AT = 0
const EMPTY_CREATED_AT = 0

export type SidebarSessionSortMode = 'recent' | 'oldest' | 'name'

export interface SidebarProjectGroup {
  readonly projectPath: string
  readonly sessions: readonly SessionSummary[]
  readonly firstSessionCreatedAt: number
  readonly latestUpdatedAt: number
}

export interface SidebarProjectGroups {
  readonly projects: readonly SidebarProjectGroup[]
}

interface BuildSidebarProjectGroupsInput {
  readonly sessions: readonly SessionSummary[]
  readonly currentProjectPath: string | null
  readonly recentProjects: readonly string[]
  readonly sortMode: SidebarSessionSortMode
}

function normalizedProjectPath(path: string | null) {
  const trimmed = path?.trim()
  return trimmed ? trimmed : null
}

function sortSessions(sessions: readonly SessionSummary[], sortMode: SidebarSessionSortMode) {
  const next = [...sessions]
  next.sort((left, right) => {
    if (sortMode === 'oldest') {
      return left.updatedAt - right.updatedAt
    }
    if (sortMode === 'name') {
      return left.title.localeCompare(right.title)
    }
    return right.updatedAt - left.updatedAt
  })
  return next
}

function latestUpdatedAt(sessions: readonly SessionSummary[]) {
  return sessions.reduce((latest, session) => Math.max(latest, session.updatedAt), EMPTY_UPDATED_AT)
}

function firstSessionCreatedAt(sessions: readonly SessionSummary[]) {
  if (sessions.length === 0) {
    return EMPTY_CREATED_AT
  }
  return sessions.reduce(
    (earliest, session) => Math.min(earliest, session.createdAt),
    Number.MAX_SAFE_INTEGER,
  )
}

function addUniqueProjectPath(paths: string[], path: string | null) {
  const normalized = normalizedProjectPath(path)
  if (!normalized || paths.includes(normalized)) {
    return false
  }
  paths.push(normalized)
  return true
}

function compareProjectRecency(
  left: string,
  right: string,
  sessionsByProject: ReadonlyMap<string, readonly SessionSummary[]>,
) {
  const leftSessions = sessionsByProject.get(left) ?? []
  const rightSessions = sessionsByProject.get(right) ?? []
  const latestUpdatedDifference = latestUpdatedAt(rightSessions) - latestUpdatedAt(leftSessions)
  if (latestUpdatedDifference !== 0) {
    return latestUpdatedDifference
  }

  const firstCreatedDifference = firstSessionCreatedAt(rightSessions) - firstSessionCreatedAt(leftSessions)
  if (firstCreatedDifference !== 0) {
    return firstCreatedDifference
  }

  return left.localeCompare(right)
}

export function buildSidebarProjectGroups({
  sessions,
  currentProjectPath,
  recentProjects,
  sortMode,
}: BuildSidebarProjectGroupsInput): SidebarProjectGroups {
  const sessionsByProject = new Map<string, SessionSummary[]>()

  for (const session of sessions) {
    const projectPath = normalizedProjectPath(session.projectPath)
    if (!projectPath) {
      continue
    }

    const projectSessions = sessionsByProject.get(projectPath) ?? []
    projectSessions.push(session)
    sessionsByProject.set(projectPath, projectSessions)
  }

  const normalizedCurrentProjectPath = normalizedProjectPath(currentProjectPath)
  const sessionProjectPaths = [...sessionsByProject.keys()].sort((left, right) => {
    if (left === normalizedCurrentProjectPath) {
      return -1
    }
    if (right === normalizedCurrentProjectPath) {
      return 1
    }
    return compareProjectRecency(left, right, sessionsByProject)
  })

  const sessionlessProjectPaths: string[] = []
  for (const projectPath of recentProjects) {
    if (!sessionsByProject.has(projectPath)) {
      addUniqueProjectPath(sessionlessProjectPaths, projectPath)
    }
  }
  if (normalizedCurrentProjectPath && !sessionsByProject.has(normalizedCurrentProjectPath)) {
    addUniqueProjectPath(sessionlessProjectPaths, normalizedCurrentProjectPath)
  }

  const projectPaths =
    normalizedCurrentProjectPath && sessionlessProjectPaths.includes(normalizedCurrentProjectPath)
      ? [
          normalizedCurrentProjectPath,
          ...sessionProjectPaths,
          ...sessionlessProjectPaths.filter((path) => path !== normalizedCurrentProjectPath),
        ]
      : [...sessionProjectPaths, ...sessionlessProjectPaths]

  return {
    projects: projectPaths.map((projectPath) => {
      const projectSessions = sessionsByProject.get(projectPath) ?? []
      return {
        projectPath,
        sessions: sortSessions(projectSessions, sortMode),
        firstSessionCreatedAt: firstSessionCreatedAt(projectSessions),
        latestUpdatedAt: latestUpdatedAt(projectSessions),
      }
    }),
  }
}
