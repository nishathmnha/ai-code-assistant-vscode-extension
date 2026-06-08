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

      :root {
        --surface: var(--vscode-sideBar-background);
        --surface-raised: var(--vscode-editorWidget-background);
        --line: var(--vscode-editorGroup-border);
        --muted: var(--vscode-descriptionForeground);
        --accent: var(--vscode-button-background);
        --accent-foreground: var(--vscode-button-foreground);
      }

      body {
        margin: 0;
        color: var(--vscode-foreground);
        background: var(--vscode-editor-background);
        font-family: var(--vscode-font-family);
        font-size: var(--vscode-font-size);
      }

      button:focus-visible,
      input:focus-visible,
      select:focus-visible,
      textarea:focus-visible {
        outline: 1px solid var(--vscode-focusBorder);
        outline-offset: 1px;
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
        gap: 3px;
        padding: 7px;
        background: var(--surface);
        border-bottom: 1px solid var(--line);
      }

      .brand {
        display: none;
      }

      .nav-button {
        flex: 1;
        padding: 7px 8px;
        color: var(--vscode-sideBar-foreground);
        background: transparent;
        border: 1px solid transparent;
        border-radius: 5px;
        text-align: center;
        cursor: pointer;
        transition: background 120ms ease, color 120ms ease;
      }

      .nav-button:hover {
        background: var(--vscode-list-hoverBackground);
      }

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
        display: flex;
        align-items: flex-start;
        justify-content: space-between;
        gap: 10px;
        padding: 13px 12px 11px;
        border-bottom: 1px solid var(--line);
      }

      .title {
        margin: 0;
        font-size: 15px;
        font-weight: 650;
        line-height: 1.3;
      }

      .meta {
        color: var(--muted);
        font-size: 12px;
      }

      .status-badge {
        display: inline-flex;
        align-items: center;
        max-width: 100%;
        gap: 6px;
        margin-top: 5px;
        padding: 3px 7px;
        color: var(--muted);
        background: var(--surface-raised);
        border: 1px solid var(--line);
        border-radius: 999px;
        font-size: 11px;
      }

      .status-dot {
        width: 6px;
        height: 6px;
        flex: 0 0 auto;
        background: var(--vscode-testing-iconPassed);
        border-radius: 50%;
      }

      .context-badge {
        flex: 0 1 auto;
        max-width: 42%;
        padding: 4px 7px;
        color: var(--muted);
        background: var(--surface-raised);
        border: 1px solid var(--line);
        border-radius: 4px;
        overflow: hidden;
        text-overflow: ellipsis;
        white-space: nowrap;
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
        gap: 10px;
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
        border-radius: 5px;
        padding: 8px 9px;
      }

      textarea {
        min-height: 92px;
        border: 0;
        background: transparent;
        resize: vertical;
      }

      textarea:focus-visible {
        outline: 0;
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
        min-height: 30px;
        border: 1px solid transparent;
        border-radius: 5px;
        padding: 7px 11px;
        cursor: pointer;
        transition: background 120ms ease;
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
        border-color: var(--line);
      }

      .secondary-button:hover {
        background: var(--vscode-button-secondaryHoverBackground);
      }

      .panel {
        background: var(--surface-raised);
        border: 1px solid var(--line);
        border-radius: 6px;
        padding: 12px;
      }

      .messages {
        display: grid;
        gap: 10px;
        min-height: 154px;
        align-content: start;
      }

      .message {
        padding: 9px 10px;
        background: var(--surface-raised);
        border: 1px solid var(--line);
        border-radius: 6px;
        white-space: pre-wrap;
        line-height: 1.5;
      }

      .message.user {
        border-left: 2px solid var(--accent);
      }

      .message-role {
        margin-bottom: 5px;
        color: var(--muted);
        font-size: 11px;
        font-weight: 600;
        text-transform: uppercase;
      }

      .empty-state {
        display: grid;
        min-height: 130px;
        place-content: center;
        gap: 7px;
        color: var(--muted);
        text-align: center;
      }

      .empty-mark {
        width: 32px;
        height: 32px;
        margin: 0 auto;
        color: var(--accent-foreground);
        background: var(--accent);
        border-radius: 6px;
        display: grid;
        place-items: center;
        font-weight: 700;
      }

      .empty-title {
        color: var(--vscode-foreground);
        font-weight: 600;
      }

      .composer {
        overflow: hidden;
        background: var(--vscode-input-background);
        border: 1px solid var(--vscode-input-border);
        border-radius: 6px;
      }

      .composer-actions {
        display: flex;
        justify-content: flex-end;
        padding: 7px;
        border-top: 1px solid var(--line);
      }

      .composer-actions .primary-button {
        min-width: 72px;
        flex: 0;
      }

      .section-heading {
        margin: 2px 0 1px;
        font-size: 13px;
        font-weight: 600;
      }

      .status-line {
        display: grid;
        gap: 8px;
        color: var(--muted);
      }

      .status-row {
        display: flex;
        align-items: center;
        justify-content: space-between;
        gap: 12px;
      }

      .status-value {
        color: var(--vscode-foreground);
        overflow: hidden;
        text-align: right;
        text-overflow: ellipsis;
        white-space: nowrap;
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
            <div class="status-badge">
              <span class="status-dot"></span>
              <span id="providerSummary">Provider loading...</span>
            </div>
          </div>
          <div class="context-badge" id="contextSummary">No active editor</div>
        </header>

        <section class="view active" id="chatView">
          <div class="stack">
            <div class="panel">
              <div class="messages" id="messages">
                <div class="empty-state" id="emptyState">
                  <div class="empty-mark">AI</div>
                  <div class="empty-title">Ready when you are</div>
                </div>
              </div>
            </div>

            <div class="composer">
              <textarea id="prompt" placeholder="Ask about the selected code..."></textarea>
              <div class="composer-actions">
                <button class="primary-button" type="button" id="sendPrompt">Send</button>
              </div>
            </div>
          </div>
        </section>

        <section class="view" id="providersView">
          <div class="stack">
            <div>
              <h2 class="section-heading">Model configuration</h2>
            </div>

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
      const emptyState = document.getElementById('emptyState');

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
        sendPrompt();
      });

      promptInput.addEventListener('keydown', (event) => {
        if (event.key === 'Enter' && (event.ctrlKey || event.metaKey)) {
          event.preventDefault();
          sendPrompt();
        }
      });

      function sendPrompt() {
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
      }

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
          contextSummary.textContent = selectedLength
            ? selectedLength + ' selected · ' + state.editorContext.languageId
            : state.editorContext.languageId;
          contextSummary.title = state.editorContext.fileName;
        } else {
          contextSummary.textContent = 'No active editor';
          contextSummary.title = '';
        }

        const keyStatus = state.apiKeyRequired
          ? state.hasApiKey ? 'API key saved' : 'API key not saved'
          : 'API key not required';

        renderProviderStatus(keyStatus);
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
        emptyState?.remove();

        const wrapper = document.createElement('div');
        wrapper.className = 'message ' + role.toLowerCase();

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

      function renderProviderStatus(keyStatus) {
        providerStatus.innerHTML = '';

        [
          ['Provider', state.config.provider],
          ['Model', state.config.model],
          ['Credentials', keyStatus]
        ].forEach(([labelText, valueText]) => {
          const row = document.createElement('div');
          row.className = 'status-row';

          const label = document.createElement('span');
          label.textContent = labelText;

          const value = document.createElement('span');
          value.className = 'status-value';
          value.textContent = valueText;
          value.title = valueText;

          row.appendChild(label);
          row.appendChild(value);
          providerStatus.appendChild(row);
        });
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
