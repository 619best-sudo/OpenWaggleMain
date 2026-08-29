import { parseJsonUnknown, safeDecodeUnknown } from '@shared/schema'
import { type MachineExecutionState, machineExecutionStateSchema } from '@shared/types/machine'
import { isRecord } from '@shared/utils/validation'

export function parseMachineExecutionState(
  uiStateJson: string | null | undefined,
): MachineExecutionState | null {
  if (!uiStateJson) {
    return null
  }

  try {
    const parsed = parseJsonUnknown(uiStateJson)
    if (!isRecord(parsed) || !('machine' in parsed)) {
      return null
    }

    const decoded = safeDecodeUnknown(machineExecutionStateSchema, parsed.machine)
    return decoded.success ? (decoded.data as MachineExecutionState) : null
  } catch {
    return null
  }
}
