import { resolveWaggleConfigForPrompt } from '@openwaggle/waggle-core'
import { SupportedModelId } from '@shared/types/brand'
import { isInheritedWaggleModelBinding, type WaggleConfig } from '@shared/types/waggle'

function resolveWaggleRuntimeModel(input: {
  readonly model: WaggleConfig['agents'][number]['model']
  readonly inheritedModel: SupportedModelId
}): SupportedModelId {
  return isInheritedWaggleModelBinding(input.model)
    ? input.inheritedModel
    : SupportedModelId(input.model)
}

export function resolveWaggleRuntimeConfig(input: {
  readonly config: WaggleConfig
  readonly inheritedModel: SupportedModelId
  readonly userPrompt: string
}): WaggleConfig {
  const resolvedConfig = {
    ...input.config,
    agents: input.config.agents.map((agent) => ({
      ...agent,
      model: resolveWaggleRuntimeModel({
        model: agent.model,
        inheritedModel: input.inheritedModel,
      }),
    })),
  }

  return resolveWaggleConfigForPrompt(resolvedConfig, input.userPrompt) as WaggleConfig
}
