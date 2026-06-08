import * as vscode from 'vscode';
import { createAIClient } from '../ai/providerFactory';
import {
  getDefaultModel,
  getProviderConfig,
  getProviderLabel,
  isSupportedProvider,
  providerOptions,
  secretKeyByProvider,
  updateModel,
  updateProvider,
} from '../ai/providerConfig';
import { EditorContext, getEditorContext } from '../utils/editorContext';

export class ChatPanel implements vscode.WebviewViewProvider {
  static readonly viewType = 'aiCodeAssistant.chatView';

  private view: vscode.WebviewView | undefined;
  private editorContext: EditorContext | null = null;
  private readonly viewDisposables: vscode.Disposable[] = [];

  constructor(private readonly context: vscode.ExtensionContext) {}

  resolveWebviewView(webviewView: vscode.WebviewView) {
    this.disposeViewListeners();
    this.view = webviewView;
    webviewView.webview.options = {
      enableScripts: true,
    };
    webviewView.webview.html = getChatHtml();

    this.viewDisposables.push(
      webviewView.webview.onDidReceiveMessage((message) =>
        this.handleMessage(message)
      ),
      webviewView.onDidDispose(() => {
        this.view = undefined;
        this.disposeViewListeners();
      })
    );
  }

  async show(editorContext: EditorContext | null) {
    this.editorContext = editorContext;
    await vscode.commands.executeCommand(`${ChatPanel.viewType}.focus`);
    await this.postState();
  }

  private disposeViewListeners() {
    while (this.viewDisposables.length > 0) {
      this.viewDisposables.pop()?.dispose();
    }
  }

  private async handleMessage(message: WebviewMessage) {
    if (!message || typeof message.type !== 'string') {
      return;
    }

    if (message.type === 'ready') {
      await this.postState();
      return;
    }

    if (message.type === 'updateProvider') {
      await this.handleProviderUpdate(message.provider);
      return;
    }

    if (message.type === 'updateModel') {
      await this.handleModelUpdate(message.model);
      return;
    }

    if (message.type === 'saveApiKey') {
      await this.saveApiKey();
      return;
    }

    if (message.type === 'sendPrompt') {
      await this.sendPrompt(message.text);
    }
  }

  private async handleProviderUpdate(provider: unknown) {
    if (typeof provider !== 'string' || !isSupportedProvider(provider)) {
      await this.postError('Unsupported provider selected.');
      return;
    }

    await updateProvider(provider);
    await this.postState();
  }

  private async handleModelUpdate(model: unknown) {
    if (typeof model !== 'string' || !model.trim()) {
      await this.postError('Model name is required.');
      return;
    }

    await updateModel(model.trim());
    await this.postState();
  }

  private async saveApiKey() {
    const config = getProviderConfig();
    const secretKey = secretKeyByProvider[config.provider];

    if (!secretKey) {
      vscode.window.showInformationMessage(
        `${getProviderLabel(config.provider)} does not need an API key here.`
      );
      await this.postState();
      return;
    }

    const apiKey = await vscode.window.showInputBox({
      prompt: `Enter API key for ${getProviderLabel(config.provider)}`,
      password: true,
      ignoreFocusOut: true,
    });

    if (!apiKey?.trim()) {
      return;
    }

    await this.context.secrets.store(secretKey, apiKey.trim());
    vscode.window.showInformationMessage(
      `${getProviderLabel(config.provider)} API key saved securely.`
    );
    await this.postState();
  }

  private async sendPrompt(text: unknown) {
    if (typeof text !== 'string' || !text.trim()) {
      return;
    }

    this.editorContext = getEditorContext() ?? this.editorContext;

    const config = getProviderConfig();
    const client = createAIClient(config);
    const editorContext = this.editorContext ?? {
      selectedText: '',
      fullText: '',
      fileName: 'No active editor',
      languageId: 'plaintext',
    };
    const response = await client.send({
      prompt: text.trim(),
      ...editorContext,
    });

    await this.view?.webview.postMessage({
      type: 'assistantResponse',
      text: response,
    });
    await this.postState();
  }

  private async postState() {
    if (!this.view) {
      return;
    }

    const config = getProviderConfig();
    const secretKey = secretKeyByProvider[config.provider];
    const hasApiKey = secretKey
      ? Boolean(await this.context.secrets.get(secretKey))
      : false;

    await this.view.webview.postMessage({
      type: 'state',
      state: {
        config,
        providerOptions: providerOptions.map((option) => ({
          id: option.id,
          label: option.label,
          models: [...option.models],
        })),
        editorContext: this.editorContext,
        apiKeyRequired: Boolean(secretKey),
        hasApiKey,
        defaultModel: getDefaultModel(config.provider),
      },
    });
  }

  private async postError(message: string) {
    await this.view?.webview.postMessage({
      type: 'error',
      message,
    });
  }
}

type WebviewMessage =
  | { type: 'ready' }
  | { type: 'updateProvider'; provider: unknown }
  | { type: 'updateModel'; model: unknown }
  | { type: 'saveApiKey' }
  | { type: 'sendPrompt'; text: unknown };

function getChatHtml() {
  const nonce = getNonce();

  return `<!DOCTYPE html>
<html lang="en">
  <head>
    <meta charset="UTF-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1.0" />
    <meta http-equiv="Content-Security-Policy" content="default-src 'none'; style-src 'nonce-${nonce}'; script-src 'nonce-${nonce}';" />
    <title>AI Code Assistant</title>
    <style nonce="${nonce}">
      * {
        box-sizing: border-box;
      }

      body {
        margin: 0;
        color: var(--vscode-foreground);
        background: var(--vscode-editor-background);
        font-family: var(--vscode-font-family);
        font-size: var(--vscode-font-size);
      }

      button,
      input,
      select,
      textarea {
        font: inherit;
      }

      .app {
        display: flex;
        min-height: 100vh;
        flex-direction: column;
      }

      .sidebar {
        display: flex;
        width: 100%;
        gap: 6px;
        padding: 8px 10px;
        background: var(--vscode-sideBar-background);
        border-bottom: 1px solid var(--vscode-sideBar-border);
      }

      .brand {
        display: none;
      }

      .nav-button {
        flex: 1;
        padding: 6px 8px;
        color: var(--vscode-sideBar-foreground);
        background: transparent;
        border: 1px solid transparent;
        border-radius: 4px;
        text-align: center;
        cursor: pointer;
      }

      .nav-button:hover,
      .nav-button.active {
        color: var(--vscode-list-activeSelectionForeground);
        background: var(--vscode-list-activeSelectionBackground);
      }

      .main {
        display: flex;
        min-width: 0;
        flex: 1;
        flex-direction: column;
      }

      .topbar {
        display: grid;
        gap: 4px;
        padding: 10px 12px;
        border-bottom: 1px solid var(--vscode-editorGroup-border);
      }

      .title {
        margin: 0;
        font-size: 14px;
        font-weight: 600;
      }

      .meta {
        color: var(--vscode-descriptionForeground);
        font-size: 12px;
      }

      .view {
        display: none;
        flex: 1;
        min-height: 0;
        padding: 12px;
        overflow: auto;
      }

      .view.active {
        display: block;
      }

      .stack {
        display: grid;
        gap: 12px;
        max-width: 760px;
      }

      .field {
        display: grid;
        gap: 6px;
      }

      label {
        color: var(--vscode-input-foreground);
        font-size: 12px;
        font-weight: 600;
      }

      select,
      input,
      textarea {
        width: 100%;
        color: var(--vscode-input-foreground);
        background: var(--vscode-input-background);
        border: 1px solid var(--vscode-input-border);
        border-radius: 4px;
        padding: 8px;
      }

      textarea {
        min-height: 88px;
        resize: vertical;
      }

      .button-row {
        display: flex;
        flex-wrap: wrap;
        gap: 8px;
      }

      .button-row button {
        min-width: 120px;
        flex: 1;
      }

      .primary-button,
      .secondary-button {
        border: 0;
        border-radius: 4px;
        padding: 8px 12px;
        cursor: pointer;
      }

      .primary-button {
        color: var(--vscode-button-foreground);
        background: var(--vscode-button-background);
      }

      .primary-button:hover {
        background: var(--vscode-button-hoverBackground);
      }

      .secondary-button {
        color: var(--vscode-button-secondaryForeground);
        background: var(--vscode-button-secondaryBackground);
      }

      .secondary-button:hover {
        background: var(--vscode-button-secondaryHoverBackground);
      }

      .panel {
        border: 1px solid var(--vscode-editorGroup-border);
        border-radius: 6px;
        padding: 12px;
      }

      .messages {
        display: grid;
        gap: 10px;
        min-height: 120px;
      }

      .message {
        white-space: pre-wrap;
        line-height: 1.5;
      }

      .message-role {
        margin-bottom: 4px;
        color: var(--vscode-descriptionForeground);
        font-size: 12px;
        font-weight: 600;
      }

      .status-line {
        color: var(--vscode-descriptionForeground);
        line-height: 1.5;
        white-space: pre-wrap;
      }
    </style>
  </head>
  <body>
    <div class="app">
      <aside class="sidebar">
        <div class="brand">AI Assistant</div>
        <button class="nav-button active" type="button" data-view="chat">Chat</button>
        <button class="nav-button" type="button" data-view="providers">Providers</button>
      </aside>

      <main class="main">
        <header class="topbar">
          <div>
            <h1 class="title">AI Code Assistant</h1>
            <div class="meta" id="providerSummary">Provider loading...</div>
          </div>
          <div class="meta" id="contextSummary">No editor context</div>
        </header>

        <section class="view active" id="chatView">
          <div class="stack">
            <div class="panel">
              <div class="messages" id="messages"></div>
            </div>

            <div class="field">
              <label for="prompt">Prompt</label>
              <textarea id="prompt" placeholder="Ask about the selected code..."></textarea>
            </div>

            <div class="button-row">
              <button class="primary-button" type="button" id="sendPrompt">Send</button>
            </div>
          </div>
        </section>

        <section class="view" id="providersView">
          <div class="stack">
            <div class="field">
              <label for="provider">Provider</label>
              <select id="provider"></select>
            </div>

            <div class="field">
              <label for="model">Model</label>
              <select id="model"></select>
            </div>

            <div class="field">
              <label for="customModel">Custom model</label>
              <input id="customModel" type="text" placeholder="Enter model name" />
            </div>

            <div class="button-row">
              <button class="secondary-button" type="button" id="useCustomModel">Use Custom Model</button>
              <button class="secondary-button" type="button" id="saveApiKey">Set API Key</button>
            </div>

            <div class="panel status-line" id="providerStatus"></div>
          </div>
        </section>
      </main>
    </div>

    <script nonce="${nonce}">
      const vscode = acquireVsCodeApi();

      const state = {
        config: null,
        providerOptions: [],
        editorContext: null,
        apiKeyRequired: false,
        hasApiKey: false
      };

      const providerSelect = document.getElementById('provider');
      const modelSelect = document.getElementById('model');
      const customModelInput = document.getElementById('customModel');
      const providerSummary = document.getElementById('providerSummary');
      const contextSummary = document.getElementById('contextSummary');
      const providerStatus = document.getElementById('providerStatus');
      const promptInput = document.getElementById('prompt');
      const messages = document.getElementById('messages');

      document.querySelectorAll('[data-view]').forEach((button) => {
        button.addEventListener('click', () => {
          const viewName = button.getAttribute('data-view');

          document.querySelectorAll('[data-view]').forEach((item) => {
            item.classList.toggle('active', item === button);
          });

          document.querySelectorAll('.view').forEach((view) => {
            view.classList.toggle('active', view.id === viewName + 'View');
          });
        });
      });

      providerSelect.addEventListener('change', () => {
        vscode.postMessage({
          type: 'updateProvider',
          provider: providerSelect.value
        });
      });

      modelSelect.addEventListener('change', () => {
        vscode.postMessage({
          type: 'updateModel',
          model: modelSelect.value
        });
      });

      document.getElementById('useCustomModel').addEventListener('click', () => {
        const model = customModelInput.value.trim();

        if (!model) {
          return;
        }

        vscode.postMessage({
          type: 'updateModel',
          model
        });
      });

      document.getElementById('saveApiKey').addEventListener('click', () => {
        vscode.postMessage({
          type: 'saveApiKey'
        });
      });

      document.getElementById('sendPrompt').addEventListener('click', () => {
        const text = promptInput.value.trim();

        if (!text) {
          return;
        }

        addMessage('User', text);
        promptInput.value = '';

        vscode.postMessage({
          type: 'sendPrompt',
          text
        });
      });

      window.addEventListener('message', (event) => {
        const message = event.data;

        if (message.type === 'state') {
          Object.assign(state, message.state);
          render();
        }

        if (message.type === 'assistantResponse') {
          addMessage('Assistant', message.text);
        }

        if (message.type === 'error') {
          addMessage('Error', message.message);
        }
      });

      function render() {
        if (!state.config) {
          return;
        }

        renderProviders();
        renderModels();

        providerSummary.textContent = state.config.provider + ' / ' + state.config.model;

        if (state.editorContext) {
          const selectedLength = state.editorContext.selectedText.length;
          contextSummary.textContent = selectedLength + ' selected chars, ' + state.editorContext.languageId;
        } else {
          contextSummary.textContent = 'No active editor';
        }

        const keyStatus = state.apiKeyRequired
          ? state.hasApiKey ? 'API key saved' : 'API key not saved'
          : 'API key not required';

        providerStatus.textContent =
          'Current provider: ' + state.config.provider +
          '\\nCurrent model: ' + state.config.model +
          '\\n' + keyStatus;
      }

      function renderProviders() {
        providerSelect.innerHTML = '';

        state.providerOptions.forEach((provider) => {
          const option = document.createElement('option');
          option.value = provider.id;
          option.textContent = provider.label;
          option.selected = provider.id === state.config.provider;
          providerSelect.appendChild(option);
        });
      }

      function renderModels() {
        modelSelect.innerHTML = '';

        const provider = state.providerOptions.find((item) => item.id === state.config.provider);
        const models = provider ? provider.models.slice() : [];

        if (state.config.model && !models.includes(state.config.model)) {
          models.unshift(state.config.model);
        }

        models.forEach((model) => {
          const option = document.createElement('option');
          option.value = model;
          option.textContent = model;
          option.selected = model === state.config.model;
          modelSelect.appendChild(option);
        });
      }

      function addMessage(role, text) {
        const wrapper = document.createElement('div');
        wrapper.className = 'message';

        const label = document.createElement('div');
        label.className = 'message-role';
        label.textContent = role;

        const content = document.createElement('div');
        content.textContent = text;

        wrapper.appendChild(label);
        wrapper.appendChild(content);
        messages.appendChild(wrapper);
        messages.scrollTop = messages.scrollHeight;
      }

      vscode.postMessage({
        type: 'ready'
      });
    </script>
  </body>
</html>`;
}

function getNonce() {
  const possible =
    'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';
  let text = '';

  for (let index = 0; index < 32; index++) {
    text += possible.charAt(Math.floor(Math.random() * possible.length));
  }

  return text;
}
