import * as SqlClient from '@effect/sql/SqlClient'
import type { SessionBranchId, SessionId } from '@shared/types/brand'
import * as Effect from 'effect/Effect'
import { runStoreEffect } from '../store-runtime'

export async function updateSessionBranchUiState(
  sessionId: SessionId,
  branchId: SessionBranchId,
  uiStateJson: string,
) {
  await runStoreEffect(
    Effect.gen(function* () {
      const sql = yield* SqlClient.SqlClient
      const now = Date.now()

      yield* sql`
        UPDATE session_branch_state
        SET ui_state_json = ${uiStateJson},
            last_active_at = ${now}
        WHERE branch_id = ${branchId}
          AND EXISTS (
            SELECT 1
            FROM session_branches
            WHERE id = ${branchId}
              AND session_id = ${sessionId}
          )
      `

      yield* sql`
        UPDATE sessions
        SET updated_at = ${now}
        WHERE id = ${sessionId}
      `
    }),
  )
}
