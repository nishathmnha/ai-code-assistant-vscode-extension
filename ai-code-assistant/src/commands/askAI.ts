import * as vscode from 'vscode';
import { getEditorContext } from '../utils/editorContext';
import { ChatPanel } from '../webview/chatPanel';

export function registerAskAICommand(
  context: vscode.ExtensionContext,
  chatPanel: ChatPanel
) {
  const disposable = vscode.commands.registerCommand(
    'aiCodeAssistant.askAI',
    async () => {
      const editorContext = getEditorContext();
      await chatPanel.show(editorContext);
    }
  );

  context.subscriptions.push(disposable);
}
