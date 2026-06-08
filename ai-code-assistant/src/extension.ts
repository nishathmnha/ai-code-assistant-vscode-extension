import * as vscode from 'vscode';
import { registerAskAICommand } from './commands/askAI';
import { ChatPanel } from './webview/chatPanel';

export function activate(context: vscode.ExtensionContext) {
  const chatPanel = new ChatPanel(context);

  context.subscriptions.push(
    vscode.window.registerWebviewViewProvider(ChatPanel.viewType, chatPanel)
  );

  registerAskAICommand(context, chatPanel);
}

export function deactivate() {}
