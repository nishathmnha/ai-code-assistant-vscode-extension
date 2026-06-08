import * as vscode from 'vscode';

export interface EditorContext {
  selectedText: string;
  fullText: string;
  fileName: string;
  languageId: string;
}

export function getEditorContext(): EditorContext | null {
  const editor = vscode.window.activeTextEditor;

  if (!editor) {
    return null;
  }

  const document = editor.document;
  const selection = editor.selection;

  return {
    selectedText: document.getText(selection),
    fullText: document.getText(),
    fileName: document.fileName,
    languageId: document.languageId,
  };
}
