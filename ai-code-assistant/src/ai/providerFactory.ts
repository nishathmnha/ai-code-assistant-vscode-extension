import { AIClient, PlaceholderAIClient } from './client';
import { defaultProviderConfig, ProviderConfig } from './providerConfig';

export function createAIClient(
  config: Partial<ProviderConfig> = {}
): AIClient {
  return new PlaceholderAIClient({
    ...defaultProviderConfig,
    ...config,
  });
}
