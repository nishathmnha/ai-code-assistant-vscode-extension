import * as vscode from 'vscode';

export const providerOptions = [
  {
    id: 'openai',
    label: 'OpenAI',
    models: ['gpt-4o-mini', 'gpt-4.1-mini', 'gpt-5-mini'],
  },
  {
    id: 'groq',
    label: 'Groq',
    models: ['llama-3.3-70b-versatile', 'llama-3.1-8b-instant'],
  },
  {
    id: 'ollama',
    label: 'Ollama',
    models: ['qwen2.5-coder', 'codellama', 'deepseek-coder'],
  },
  {
    id: 'anthropic',
    label: 'Anthropic',
    models: ['claude-sonnet-4-5', 'claude-haiku-4-5'],
  },
  {
    id: 'google',
    label: 'Google',
    models: ['gemini-2.5-pro', 'gemini-2.5-flash'],
  },
  {
    id: 'deepseek',
    label: 'DeepSeek',
    models: ['deepseek-chat', 'deepseek-reasoner'],
  },
  {
    id: 'openrouter',
    label: 'OpenRouter',
    models: ['openai/gpt-4o-mini', 'anthropic/claude-sonnet-4-5'],
  },
  {
    id: 'custom',
    label: 'Custom',
    models: ['custom-model'],
  },
] as const;

export type SupportedProvider = (typeof providerOptions)[number]['id'];

export interface ProviderConfig {
  provider: SupportedProvider;
  model: string;
  ollamaBaseUrl: string;
  customBaseUrl: string;
}

export const defaultProviderConfig: ProviderConfig = {
  provider: 'openai',
  model: 'gpt-4o-mini',
  ollamaBaseUrl: 'http://localhost:11434/v1',
  customBaseUrl: '',
};

export const secretKeyByProvider: Partial<Record<SupportedProvider, string>> = {
  openai: 'aiCodeAssistant.openaiApiKey',
  groq: 'aiCodeAssistant.groqApiKey',
  anthropic: 'aiCodeAssistant.anthropicApiKey',
  google: 'aiCodeAssistant.googleApiKey',
  deepseek: 'aiCodeAssistant.deepseekApiKey',
  openrouter: 'aiCodeAssistant.openrouterApiKey',
  custom: 'aiCodeAssistant.customApiKey',
};

export function isSupportedProvider(
  provider: string
): provider is SupportedProvider {
  return providerOptions.some((option) => option.id === provider);
}

export function getProviderLabel(provider: SupportedProvider): string {
  return (
    providerOptions.find((option) => option.id === provider)?.label ?? provider
  );
}

export function getModelOptions(provider: SupportedProvider): readonly string[] {
  return (
    providerOptions.find((option) => option.id === provider)?.models ??
    providerOptions[0].models
  );
}

export function getDefaultModel(provider: SupportedProvider): string {
  return getModelOptions(provider)[0];
}

export function getProviderConfig(): ProviderConfig {
  const config = vscode.workspace.getConfiguration('aiCodeAssistant');
  const providerSetting = config.get<string>(
    'provider',
    defaultProviderConfig.provider
  );
  const provider = isSupportedProvider(providerSetting)
    ? providerSetting
    : defaultProviderConfig.provider;
  const model =
    config.get<string>('model', getDefaultModel(provider)).trim() ||
    getDefaultModel(provider);

  return {
    provider,
    model,
    ollamaBaseUrl: config.get<string>(
      'ollamaBaseUrl',
      defaultProviderConfig.ollamaBaseUrl
    ),
    customBaseUrl: config.get<string>(
      'customBaseUrl',
      defaultProviderConfig.customBaseUrl
    ),
  };
}

export async function updateProvider(provider: SupportedProvider) {
  const config = vscode.workspace.getConfiguration('aiCodeAssistant');

  await config.update(
    'provider',
    provider,
    vscode.ConfigurationTarget.Global
  );
  await config.update(
    'model',
    getDefaultModel(provider),
    vscode.ConfigurationTarget.Global
  );
}

export async function updateModel(model: string) {
  await vscode.workspace
    .getConfiguration('aiCodeAssistant')
    .update('model', model, vscode.ConfigurationTarget.Global);
}
