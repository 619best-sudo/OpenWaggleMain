import type { AgentPhaseId } from './phase'

interface AgentPhaseTitleOptions {
  readonly retryReason?: 'failed_verification'
}

const PHASE_TITLE_VARIANTS = {
  prepare: [
    'Understood! Let me understand the codebase for implementation',
    'Got it! Let me understand the project structure before I implement anything',
    'Sounds good! Let me understand the relevant code before I make changes',
    'All right! Let me understand the existing setup for implementation',
    'Makes sense! Let me understand the codebase and surrounding context first',
    'Clear enough! Let me understand the current implementation before proceeding',
    'Good call! Let me understand the directory and related files first',
    'Absolutely! Let me understand the system before I implement the request',
    'Noted! Let me understand the existing code before making updates',
    'Okay! Let me understand the code paths and dependencies for implementation',
  ],
  plan: [
    'Understood! Let me plan the implementation before I start',
    'Got it! Let me map out the implementation approach first',
    'Sounds good! Let me plan the changes before writing code',
    'All right! Let me turn the context into an implementation plan',
    'Makes sense! Let me outline the implementation steps first',
    'Clear enough! Let me plan the work before I begin coding',
    'Good call! Let me break the implementation into clear steps',
    'Absolutely! Let me prepare an implementation plan before proceeding',
    'Noted! Let me organize the implementation strategy first',
    'Okay! Let me plan the implementation path before I make changes',
  ],
  perform: [
    'Understood! Let me implement the requested changes',
    'Got it! Let me start implementing the solution',
    'Sounds good! Let me make the code changes now',
    'All right! Let me implement the plan step by step',
    'Makes sense! Let me apply the implementation changes',
    'Clear enough! Let me update the code accordingly',
    'Good call! Let me put the implementation into place',
    'Absolutely! Let me make the requested implementation updates',
    'Noted! Let me work through the implementation now',
    'Okay! Let me implement the changes carefully',
  ],
  perfect: [
    'Understood! Let me verify the implementation end to end',
    'Got it! Let me verify the changes before wrapping up',
    'Sounds good! Let me validate the implementation now',
    'All right! Let me check the implementation for correctness',
    'Makes sense! Let me verify everything works as intended',
    'Clear enough! Let me confirm the implementation is correct',
    'Good call! Let me review and verify the final changes',
    'Absolutely! Let me test the implementation before finishing',
    'Noted! Let me verify the updated behavior now',
    'Okay! Let me confirm the implementation is complete',
  ],
  working: [
    'Understood! Let me work through the request carefully',
    'Got it! Let me process the request step by step',
    'Sounds good! Let me work through the request before responding',
    'All right! Let me process the request carefully first',
    'Makes sense! Let me work through the details now',
    'Clear enough! Let me think through the request before I continue',
    'Good call! Let me process the request from the current context',
    'Absolutely! Let me work through the request and next steps',
    'Noted! Let me process the request before moving forward',
    'Okay! Let me work through the request and prepare the response',
  ],
} satisfies Record<AgentPhaseId, readonly string[]>

const PERFORM_FAILED_VERIFICATION_TITLE_VARIANTS = [
  'Understood! Let me address the verification issues in the implementation',
  'Got it! Let me fix what verification found in the implementation',
  'Sounds good! Let me update the implementation based on the verification feedback',
  'All right! Let me correct the implementation issues that verification surfaced',
  'Makes sense! Let me revise the implementation to resolve the verification failure',
  'Clear enough! Let me fix the implementation gaps that blocked verification',
  'Good call! Let me update the implementation to satisfy the verification checks',
  'Absolutely! Let me work through the verification feedback and adjust the implementation',
  'Noted! Let me address the failed verification findings in the implementation',
  'Okay! Let me refine the implementation so the verification can pass',
] as const

export function getAgentPhaseTitle(
  phaseId: AgentPhaseId,
  occurrenceIndex = 0,
  options?: AgentPhaseTitleOptions,
) {
  const variants =
    phaseId === 'perform' && options?.retryReason === 'failed_verification'
      ? PERFORM_FAILED_VERIFICATION_TITLE_VARIANTS
      : PHASE_TITLE_VARIANTS[phaseId]
  return variants[occurrenceIndex % variants.length] ?? variants[0]
}
