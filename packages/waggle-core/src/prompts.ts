import type { WaggleConfig } from './config'
import { getWaggleTurn } from './turn-policy'

const FIRST_TURN_NUMBER = 0
const NEXT_AGENT_OFFSET = 1

function collaborationSummary(config: WaggleConfig, currentAgentIndex: number) {
  const collaborators = config.agents.filter((_, index) => index !== currentAgentIndex)
  if (collaborators.length === 0) {
    return 'You are collaborating solo.'
  }
  if (collaborators.length === 1) {
    const [otherAgent] = collaborators
    return `You are collaborating with "${otherAgent.label}" (${otherAgent.roleDescription}).`
  }

  const collaboratorSummary = collaborators
    .map((agent) => `"${agent.label}" (${agent.roleDescription})`)
    .join(', ')
  return `You are collaborating with ${String(collaborators.length)} other agents: ${collaboratorSummary}.`
}

export interface BuildWaggleTurnPromptInput {
  readonly config: WaggleConfig
  readonly turnNumber: number
  readonly userPrompt: string
}

export function buildWaggleTurnPrompt(input: BuildWaggleTurnPromptInput) {
  const turn = getWaggleTurn(input.config, input.turnNumber)
  const agent = turn.agent
  const lines = [
    `You are "${agent.label}". ${agent.roleDescription}`,
    '',
    collaborationSummary(input.config, turn.agentIndex),
    `This is turn ${String(input.turnNumber + NEXT_AGENT_OFFSET)} of the collaboration.`,
    '',
    'Guidelines:',
    '- Use tools to inspect real files and project state before making claims.',
    '- Build on previous contributions rather than repeating them.',
    '- If you agree with the other agent, say so explicitly and briefly.',
    '- If you disagree, explain your reasoning with references to actual code.',
    '- Focus on adding new value each turn.',
    '- End your turn with a concise, direct summary of your findings and position.',
  ]

  if (input.config.loopContract) {
    lines.push('', 'Shared loop contract:')
    if (input.config.loopContract.placeholderPolicy === 'prefer-placeholders-over-blocking') {
      lines.push(
        '- If assets, media, or generation APIs fail, prefer placeholders over blocking the cycle.',
      )
    }
    if ((input.config.loopContract.firstQaGate?.length ?? 0) > 0) {
      lines.push('- First QA gate requires:')
      for (const requirement of input.config.loopContract.firstQaGate ?? []) {
        lines.push(`  - ${requirement}`)
      }
    }
    if ((input.config.loopContract.failureCategories?.length ?? 0) > 0) {
      lines.push(
        `- When reporting failures, classify them using: ${input.config.loopContract.failureCategories?.join(', ')}.`,
      )
    }
  }

  if ((agent.outputContract?.requiredSections.length ?? 0) > 0) {
    lines.push(
      '',
      'Output contract:',
      '- End your response with these exact labels as plain text keys followed by a colon.',
      '- Use `none` when a section is intentionally empty.',
    )
    for (const section of agent.outputContract?.requiredSections ?? []) {
      lines.push(`- ${section}:`)
    }
  }

  if (input.turnNumber > FIRST_TURN_NUMBER) {
    lines.push(
      '',
      'Review the session above and continue the collaboration.',
      'If the other agent made claims about the code, verify them by reading relevant files.',
      'Focus on your role and perspective.',
    )
  }

  return `${lines.join('\n')}\n\n---\n\nUser request:\n${input.userPrompt}`
}
