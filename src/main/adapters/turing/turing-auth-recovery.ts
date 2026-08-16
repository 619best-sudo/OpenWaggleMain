/**
 * Recovering a run that the backend rejected as unauthorized.
 *
 * Runs outlive tokens. The backend credential is the signed-in user's JWT (~15
 * minute TTL) and an agent run is routinely longer than that — a single `read`
 * whose comprehension escalates to a bigger model has been measured at sixteen
 * minutes on its own. When the token lapses mid-run the next completion request
 * comes back 401 and the harness ends the loop, discarding an hour of tool
 * results and finishing with no summary.
 *
 * Refreshing on a timer is not enough on its own, because the timer lives in the
 * renderer: `window.setTimeout` is throttled in a backgrounded window and does
 * not run at all while the machine is asleep, which is exactly when a long run
 * is most likely to be the only thing still working. So this module treats the
 * backend's own 401 as the trigger — the most reliable signal available, since
 * it comes from the party that decides — and drives a refresh from there.
 *
 * Main cannot mint a token itself: the refresh token is held by the renderer's
 * auth store. So the sequence is ask, then wait for the answer to land in the
 * credential slot that {@link resolveBackendToken} reads.
 */

import { BrowserWindow } from 'electron'
import { createLogger } from '../../logger'
import { isDirectOpenRouterEnabled, resolveBackendToken } from './turing-llm-config'

const logger = createLogger('turing-auth-recovery')

/**
 * What the agent is told once its session has been renewed.
 *
 * Deliberately not the original task restated. The harness session still holds
 * the full transcript, so repeating the request invites the model to start over
 * and redo work whose results are already sitting in its context. This says only
 * that the interruption was infrastructural and that the work itself stands.
 */
export const AUTH_RECOVERY_CONTINUATION_PROMPT =
  'Your previous turn was cut short by an expired authentication token, not by anything wrong with the work. ' +
  'The session has been renewed. Continue exactly where you left off, using the tool results already in this ' +
  'conversation rather than repeating work you have already done. If the task was in fact complete, just ' +
  'summarise what you did.'

/**
 * The continuation for a run whose approved plan was already part-executed.
 *
 * Names the plan explicitly. Without that the model, now running as one flat
 * work loop rather than step-by-step, tends to treat the transcript as finished
 * work and summarise instead of picking the next step up.
 */
export const AUTH_RECOVERY_PLAN_CONTINUATION_PROMPT =
  'Your previous turn was cut short by an expired authentication token, not by anything wrong with the work. ' +
  'The session has been renewed and the plan you were given is still the plan — it does not need revisiting. ' +
  'Work out from this conversation which steps are already done, then carry on with the remaining ones in order, ' +
  'reusing the tool results already here rather than repeating them. If every step is in fact complete, just ' +
  'summarise what you did.'

/**
 * How to re-enter the chain once the session has been renewed.
 *
 * The whole point is that the user should not be able to tell the interruption
 * happened, so the one thing this must never do is re-run a planning turn whose
 * outcome the user already accepted — that would put a second approval card in
 * front of them, for a freshly decomposed plan that need not even match the one
 * they approved and edited.
 */
export function resolveAuthRecoveryContinuation(input: {
  /** Whether the user approved a plan before the run was cut short. */
  readonly planApproved: boolean
  /** Whether the original run was started in plan mode. */
  readonly planMode: boolean
}): { readonly prompt: string; readonly planMode: boolean } {
  // Approved: the plan and its part-executed steps are in the transcript, so the
  // continuation is plain execution of what is left.
  if (input.planApproved) {
    return { prompt: AUTH_RECOVERY_PLAN_CONTINUATION_PROMPT, planMode: false }
  }
  // Nothing approved — the run died at or before planning. There is no decision
  // to preserve, so normal plan mode is exactly right and the user sees the card
  // once, as they would have anyway.
  return { prompt: AUTH_RECOVERY_CONTINUATION_PROMPT, planMode: input.planMode }
}

/** How long to wait for the renderer to complete a refresh round trip. */
const REFRESH_TIMEOUT_MS = 20_000
/** Poll interval while waiting for the new token to reach the credential slot. */
const REFRESH_POLL_INTERVAL_MS = 250

/**
 * Whether a terminal run error is the backend refusing our credential.
 *
 * Matched on text because that is all the harness surfaces — it reports failures
 * as `OpenRouter stream failed (401)` regardless of which endpoint `baseUrl`
 * actually points at, so the string names OpenRouter even when the 401 came from
 * our own `/turing-machine` mount.
 */
export function isBackendAuthError(error: string | undefined): boolean {
  if (!error) return false
  return /\b(401|403)\b/.test(error) || /unauthorized|forbidden|invalid api key/i.test(error)
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms))
}

/**
 * Ask the renderer to renew the backend session, and resolve once a different
 * token has actually landed in the credential slot.
 *
 * Returns `false` when no replacement arrived — no window to ask, the refresh
 * token itself expired (the user is genuinely signed out), or the round trip
 * timed out. The caller must treat that as "stay failed" rather than retrying,
 * or a signed-out user turns into a silent retry loop against the backend.
 */
export async function refreshBackendTokenAfterAuthFailure(): Promise<boolean> {
  // The direct-to-OpenRouter path authenticates with a user-supplied key that
  // never expires and that we have no way to reissue. A 401 there means the key
  // is wrong, and asking the renderer to refresh a session it is not using would
  // be pure noise.
  if (isDirectOpenRouterEnabled()) return false

  const staleToken = resolveBackendToken()
  const windows = BrowserWindow.getAllWindows()
  if (windows.length === 0) {
    logger.warn('Cannot refresh backend token: no renderer window to ask')
    return false
  }

  for (const window of windows) {
    window.webContents.send('app-auth:refresh-required', { reason: 'run-unauthorized' })
  }

  const deadline = Date.now() + REFRESH_TIMEOUT_MS
  while (Date.now() < deadline) {
    await sleep(REFRESH_POLL_INTERVAL_MS)
    const current = resolveBackendToken()
    // An empty slot means the renderer cleared the session (the refresh token
    // was rejected too). That is a sign-out, not a transient failure.
    if (!current) {
      logger.warn('Backend token was cleared during refresh; the session is signed out')
      return false
    }
    if (current !== staleToken) {
      logger.info('Backend token refreshed after an unauthorized run')
      return true
    }
  }

  logger.warn('Timed out waiting for the renderer to refresh the backend token', {
    timeoutMs: REFRESH_TIMEOUT_MS,
  })
  return false
}
