import type { WaggleAgentSlot, WaggleConfig } from './config'

const NEXT_TURN_INCREMENT = 1

export interface WaggleTurn {
  readonly turnNumber: number
  readonly agentIndex: number
  readonly agent: WaggleAgentSlot
}

export type WaggleStopReason = 'turn-limit' | 'consensus' | 'user-stop' | 'terminal-error'

export interface WaggleTurnCompletion {
  readonly turnNumber: number
  readonly consensusReached?: boolean
  readonly terminalError?: string
}

export interface WaggleTurnDecision {
  readonly continue: boolean
  readonly reason?: WaggleStopReason
  readonly nextTurn?: WaggleTurn
}

export function getWaggleTurnAgentIndex(config: Pick<WaggleConfig, 'agents'>, turnNumber: number) {
  return turnNumber % config.agents.length
}

export function getWaggleTurn(config: WaggleConfig, turnNumber: number): WaggleTurn {
  const agentIndex = getWaggleTurnAgentIndex(config, turnNumber)
  const agent = config.agents[agentIndex]
  if (!agent) {
    throw new Error(`Missing Waggle agent at index ${String(agentIndex)}`)
  }
  return { turnNumber, agentIndex, agent }
}

function completedTurnCount(turnNumber: number) {
  return turnNumber + NEXT_TURN_INCREMENT
}

export function decideNextWaggleTurn(
  config: WaggleConfig,
  completion: WaggleTurnCompletion,
): WaggleTurnDecision {
  if (completion.terminalError) {
    return { continue: false, reason: 'terminal-error' }
  }

  if (completion.consensusReached) {
    return { continue: false, reason: 'consensus' }
  }

  if (completedTurnCount(completion.turnNumber) >= config.stop.maxTurnsSafety) {
    return { continue: false, reason: 'turn-limit' }
  }

  return {
    continue: true,
    nextTurn: getWaggleTurn(config, completion.turnNumber + NEXT_TURN_INCREMENT),
  }
}
