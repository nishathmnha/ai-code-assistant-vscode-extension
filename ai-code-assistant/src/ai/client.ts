import { ProviderConfig } from './providerConfig';

export interface AIRequest {
  prompt: string;
  selectedText: string;
  fullText: string;
  fileName: string;
  languageId: string;
}

export interface AIClient {
  send(request: AIRequest): Promise<string>;
}

export class PlaceholderAIClient implements AIClient {
  constructor(private readonly config: ProviderConfig) {}

  async send(request: AIRequest): Promise<string> {
    return Promise.resolve(
      [
        `Provider: ${this.config.provider}`,
        `Model: ${this.config.model ?? 'not configured'}`,
        `Language: ${request.languageId}`,
        `File: ${request.fileName}`,
      ].join('\n')
    );
  }
}
