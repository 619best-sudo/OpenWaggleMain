import type { AgentKernelRunInput } from '../../../ports/agent-kernel-service'
import { buildPiRunNewMessages } from '../pi-run-result'
import {
  createPiRunSessionRuntime,
  promptPiSession,
  runSubscribedPiOperation,
} from './run-lifecycle'
import { createSessionListener } from './session-listener'
import { resolveSessionProjectPath } from './session-manager'
import { createStuckTerminalToolWatchdog } from './stuck-terminal-tool-watchdog'

export async function runPiSession(input: AgentKernelRunInput) {
  const projectPath = resolveSessionProjectPath(input.session)
  const { model, session } = await createPiRunSessionRuntime({
    session: input.session,
    projectPath,
    modelReference: input.model,
    payload: input.payload,
    skillToggles: input.skillToggles,
  })

  const abortWarning = 'Failed to abort Pi session cleanly'
  const watchdog = createStuckTerminalToolWatchdog({
    session,
    runId: input.runId,
    emitErrorEvent: input.onEvent,
    abortWarning,
  })
  const onEvent = (event: Parameters<typeof input.onEvent>[0]) => {
    watchdog.observe(event)
    input.onEvent(event)
  }
  const unsubscribe = session.subscribe(createSessionListener({ ...input, onEvent }, input.runId))

  try {
    return await runSubscribedPiOperation({
      runInput: input,
      session,
      unsubscribe,
      abortWarning,
      preAbortWarning: 'Failed to abort pre-cancelled Pi session cleanly',
      operation: () => watchdog.watch(() => promptPiSession(session, model, input.payload)),
      buildErrorMessages: (appended) => buildPiRunNewMessages(input.payload, appended),
    })
  } finally {
    watchdog.stop()
  }
}
