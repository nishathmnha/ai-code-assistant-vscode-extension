import * as vscode from 'vscode';

export function activate(context: vscode.ExtensionContext) {
  const disposable = vscode.commands.registerCommand(
    'aiCodeAssistant.askAI',
    async () => {
      vscode.window.showInformationMessage('AI Code Assistant is working.');
    }
  );

  context.subscriptions.push(disposable);
}

export function deactivate() {}