import type { ProjectedSessionNodeInput } from '../../ports/session-repository'
import { STRUCTURAL_SESSION_NODE_CUSTOM_TYPES } from '@shared/types/structural-nodes'
import { deriveBranchForHead } from './branch-head'
import {
  buildChildCounts,
  createdOrderByNodeId,
  findEarliestLeafDescendant,
  getPathIds,
  isActiveSelectableBranch,
  isDescendantOrSame,
  mainBranchId,
  uniqueHeadIds,
} from './branch-utils'
import { EMPTY_INDEX, MAIN_BRANCH_NAME } from './constants'
import type { DerivedSessionBranch, SessionBranchRow } from './types'

function isStructuralArtifactNode(node: ProjectedSessionNodeInput) {
  if (node.kind !== 'custom') {
    return false
  }

  try {
    const parsed = JSON.parse(node.contentJson) as { customType?: unknown }
    return (
      typeof parsed.customType === 'string' &&
      STRUCTURAL_SESSION_NODE_CUSTOM_TYPES.has(parsed.customType)
    )
  } catch {
    return false
  }
}

/**
 * Drop structural artifact nodes from the tree used for branch derivation while
 * keeping the conversational chain connected. Simply filtering them out is unsafe
 * when a structural node sits BETWEEN two conversational nodes (e.g. the turing
 * bridge-status node persisted between the user turn and the appended assistant
 * messages): the surviving child would keep pointing at a now-missing parent, so
 * `buildChildCounts` would read both the orphaned child and its former parent as
 * leaves and derive a phantom extra branch. Re-link each survivor to its nearest
 * non-structural ancestor so the chain stays linear regardless of where the
 * artifact nodes were interleaved.
 */
function derivationNodesWithoutStructural(nodes: readonly ProjectedSessionNodeInput[]) {
  const nodeById = new Map(nodes.map((node) => [node.id, node]))
  const isStructuralId = (id: string | null) => {
    const node = id ? nodeById.get(id) : undefined
    return node ? isStructuralArtifactNode(node) : false
  }
  const nearestSurvivingAncestor = (parentId: string | null) => {
    let currentId = parentId
    while (currentId && isStructuralId(currentId)) {
      currentId = nodeById.get(currentId)?.parentId ?? null
    }
    return currentId
  }

  return nodes
    .filter((node) => !isStructuralArtifactNode(node))
    .map((node) =>
      isStructuralId(node.parentId)
        ? { ...node, parentId: nearestSurvivingAncestor(node.parentId) }
        : node,
    )
}

function resolveMainHeadId(input: {
  readonly activeHeadId: string | null
  readonly leafIds: readonly string[]
  readonly previousMainHeadId: string | null
  readonly nodeById: ReadonlyMap<string, ProjectedSessionNodeInput>
  readonly orderById: ReadonlyMap<string, number>
}) {
  if (!input.previousMainHeadId) {
    const heads = uniqueHeadIds([input.activeHeadId, ...input.leafIds])
    heads.sort(
      (left, right) => (input.orderById.get(left) ?? 0) - (input.orderById.get(right) ?? 0),
    )
    return heads[0] ?? null
  }

  if (isDescendantOrSame(input.nodeById, input.activeHeadId, input.previousMainHeadId)) {
    return input.activeHeadId
  }

  return findEarliestLeafDescendant({
    leafIds: input.leafIds,
    existingHeadId: input.previousMainHeadId,
    nodeById: input.nodeById,
    orderById: input.orderById,
  })
}

function emptyBranchResult(sessionId: string, mainBranchRow: SessionBranchRow | undefined) {
  const mainId = mainBranchId(sessionId)
  return {
    activeBranchId: mainId,
    activeNodeId: null,
    branches: [
      {
        id: mainId,
        sourceNodeId: null,
        headNodeId: null,
        name: MAIN_BRANCH_NAME,
        isMain: true,
        archivedAt: mainBranchRow?.archived_at ?? null,
        createdAt: mainBranchRow?.created_at ?? Date.now(),
      },
    ],
  }
}

interface BranchDerivationContext {
  readonly activeHeadId: string | null
  readonly childCounts: ReadonlyMap<string, number>
  readonly leafIds: readonly string[]
  readonly mainHeadId: string | null
  readonly nodeById: ReadonlyMap<string, ProjectedSessionNodeInput>
}

function resolveDerivationActiveHeadId(input: {
  readonly allNodes: readonly ProjectedSessionNodeInput[]
  readonly derivationNodeById: ReadonlyMap<string, ProjectedSessionNodeInput>
  readonly requestedActiveNodeId: string | null
}) {
  if (!input.requestedActiveNodeId) {
    return input.allNodes[input.allNodes.length - 1]?.id ?? null
  }

  const allNodeById = new Map(input.allNodes.map((node) => [node.id, node]))
  let currentId: string | null = input.requestedActiveNodeId

  while (currentId) {
    if (input.derivationNodeById.has(currentId)) {
      return currentId
    }
    currentId = allNodeById.get(currentId)?.parentId ?? null
  }

  return input.allNodes[input.allNodes.length - 1]?.id ?? null
}

function leafIdsForNodes(
  nodes: readonly ProjectedSessionNodeInput[],
  childCounts: ReadonlyMap<string, number>,
) {
  return nodes.filter((node) => (childCounts.get(node.id) ?? 0) === 0).map((node) => node.id)
}

function buildBranchDerivationContext(input: {
  readonly nodes: readonly ProjectedSessionNodeInput[]
  readonly allNodes: readonly ProjectedSessionNodeInput[]
  readonly activeNodeId: string | null
  readonly mainBranchRow: SessionBranchRow | undefined
}) {
  const childCounts = buildChildCounts(input.nodes)
  const nodeById = new Map(input.nodes.map((node) => [node.id, node]))
  const leafIds = leafIdsForNodes(input.nodes, childCounts)
  const activeHeadId = resolveDerivationActiveHeadId({
    allNodes: input.allNodes,
    derivationNodeById: nodeById,
    requestedActiveNodeId: input.activeNodeId,
  })

  return {
    activeHeadId,
    childCounts,
    leafIds,
    mainHeadId: resolveMainHeadId({
      activeHeadId,
      leafIds,
      previousMainHeadId: input.mainBranchRow?.head_node_id ?? null,
      nodeById,
      orderById: createdOrderByNodeId(input.nodes),
    }),
    nodeById,
  }
}

function deriveBranchesForHeads(input: {
  readonly sessionId: string
  readonly existingBranches: readonly SessionBranchRow[]
  readonly mainBranchRow: SessionBranchRow | undefined
  readonly context: BranchDerivationContext
}) {
  return uniqueHeadIds([
    input.context.mainHeadId,
    input.context.activeHeadId,
    ...input.context.leafIds,
  ]).map((headId, index) =>
    deriveBranchForHead({
      sessionId: input.sessionId,
      headId,
      index,
      mainHeadId: input.context.mainHeadId,
      mainBranchRow: input.mainBranchRow,
      existingBranches: input.existingBranches,
      nodeById: input.context.nodeById,
      childCounts: input.context.childCounts,
    }),
  )
}

function selectActiveBranch(input: {
  readonly branches: readonly DerivedSessionBranch[]
  readonly activeHeadId: string | null
  readonly sessionId: string
}) {
  return (
    input.branches.find(
      (branch) => branch.headNodeId === input.activeHeadId && isActiveSelectableBranch(branch),
    ) ??
    input.branches.find(
      (branch) => branch.id === mainBranchId(input.sessionId) && isActiveSelectableBranch(branch),
    ) ??
    input.branches.find(isActiveSelectableBranch) ??
    input.branches[EMPTY_INDEX]
  )
}

function deriveSessionBranches(input: {
  readonly sessionId: string
  readonly nodes: readonly ProjectedSessionNodeInput[]
  readonly activeNodeId: string | null
  readonly existingBranches: readonly SessionBranchRow[]
}) {
  const mainBranchRow = input.existingBranches.find((branch) => branch.is_main === 1)
  const derivationNodes = derivationNodesWithoutStructural(input.nodes)

  if (derivationNodes.length === 0) {
    return emptyBranchResult(input.sessionId, mainBranchRow)
  }

  const context = buildBranchDerivationContext({
    nodes: derivationNodes,
    allNodes: input.nodes,
    activeNodeId: input.activeNodeId,
    mainBranchRow,
  })
  const branches = deriveBranchesForHeads({
    sessionId: input.sessionId,
    existingBranches: input.existingBranches,
    mainBranchRow,
    context,
  })
  const activeBranch = selectActiveBranch({
    branches,
    activeHeadId: context.activeHeadId,
    sessionId: input.sessionId,
  })

  return {
    branches,
    activeBranchId: activeBranch?.id ?? mainBranchId(input.sessionId),
    activeNodeId: activeBranch?.headNodeId ?? null,
  }
}

function emptyDerivedMainBranch(sessionId: string): DerivedSessionBranch {
  return {
    id: mainBranchId(sessionId),
    sourceNodeId: null,
    headNodeId: null,
    name: MAIN_BRANCH_NAME,
    isMain: true,
    archivedAt: null,
    createdAt: Date.now(),
  }
}

function ensureMainBranch(branches: readonly DerivedSessionBranch[], sessionId: string) {
  return branches.some((branch) => branch.isMain)
    ? branches
    : [
        {
          ...emptyDerivedMainBranch(sessionId),
          headNodeId: branches[EMPTY_INDEX]?.headNodeId ?? null,
        },
        ...branches,
      ]
}

function normalizeDerivedBranches(input: {
  readonly branches: readonly DerivedSessionBranch[]
  readonly sessionId: string
  readonly activeBranchId: string
  readonly requestedActiveNodeId: string | null
  readonly nodes: readonly ProjectedSessionNodeInput[]
}) {
  const branches = ensureMainBranch(input.branches, input.sessionId)
  const activeBranchId = branches.some(
    (branch) => branch.id === input.activeBranchId && isActiveSelectableBranch(branch),
  )
    ? input.activeBranchId
    : mainBranchId(input.sessionId)
  const activeBranch = branches.find((branch) => branch.id === activeBranchId)
  const nodeIds = new Set(input.nodes.map((node) => node.id))
  const activeNodeId =
    input.requestedActiveNodeId && nodeIds.has(input.requestedActiveNodeId)
      ? input.requestedActiveNodeId
      : activeBranch?.headNodeId ?? null
  return { branches, activeBranchId, activeNodeId }
}

export function deriveSessionBranchesForSnapshot(input: {
  readonly sessionId: string
  readonly nodes: readonly ProjectedSessionNodeInput[]
  readonly activeNodeId: string | null
  readonly existingBranches: readonly SessionBranchRow[]
}) {
  return normalizeDerivedBranches({
    ...deriveSessionBranches(input),
    sessionId: input.sessionId,
    requestedActiveNodeId: input.activeNodeId,
    nodes: input.nodes,
  })
}

export function deriveBranchHints(input: {
  readonly branches: readonly DerivedSessionBranch[]
  readonly nodes: readonly ProjectedSessionNodeInput[]
  readonly activeBranchId: string
}) {
  const nodeById = new Map(input.nodes.map((node) => [node.id, node]))
  const activeBranch = input.branches.find((branch) => branch.id === input.activeBranchId)
  const activePathIds = new Set(getPathIds(nodeById, activeBranch?.headNodeId ?? null))
  const branchHintByNodeId = new Map<string, string>()

  for (const nodeId of activePathIds) branchHintByNodeId.set(nodeId, input.activeBranchId)
  for (const branch of input.branches) {
    if (branch.id === input.activeBranchId) continue
    const pathIds = getPathIds(nodeById, branch.headNodeId)
    for (const nodeId of pathIds) {
      if (!activePathIds.has(nodeId)) branchHintByNodeId.set(nodeId, branch.id)
    }
  }

  for (const node of input.nodes) {
    if (branchHintByNodeId.has(node.id)) {
      continue
    }

    let parentId = node.parentId
    while (parentId) {
      const inheritedBranchId = branchHintByNodeId.get(parentId)
      if (inheritedBranchId) {
        branchHintByNodeId.set(node.id, inheritedBranchId)
        break
      }
      parentId = nodeById.get(parentId)?.parentId ?? null
    }
  }

  return branchHintByNodeId
}
