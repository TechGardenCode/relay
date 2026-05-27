// Minimal in-memory stand-in for the `vscode` module the VS Code host injects
// at runtime. Vitest aliases `vscode` to this file (see vitest.config.ts and
// the repo-root vitest.config.ts) because `vscode` is NOT an installable npm
// package — only `@types/vscode` is present; the real module is provided by the
// extension host. This shim covers the surface the sessions tree view (7C-tree)
// and its node commands touch, plus light stubs so sibling modules import
// cleanly. Keep it behavioral, not exhaustive: add to it only when a spec needs
// a new symbol.

export enum TreeItemCollapsibleState {
  None = 0,
  Collapsed = 1,
  Expanded = 2,
}

export enum StatusBarAlignment {
  Left = 1,
  Right = 2,
}

export class ThemeColor {
  constructor(readonly id: string) {}
}

export class ThemeIcon {
  constructor(
    readonly id: string,
    readonly color?: ThemeColor,
  ) {}
}

export class TreeItem {
  label?: string;
  collapsibleState: TreeItemCollapsibleState;
  description?: string | boolean;
  tooltip?: string;
  iconPath?: unknown;
  contextValue?: string;
  command?: { command: string; title: string; arguments?: unknown[] };
  id?: string;

  constructor(
    label?: string,
    collapsibleState: TreeItemCollapsibleState = TreeItemCollapsibleState.None,
  ) {
    this.label = label;
    this.collapsibleState = collapsibleState;
  }
}

export class Disposable {
  constructor(private readonly callback?: () => void) {}
  dispose(): void {
    this.callback?.();
  }
}

export type Event<T> = (listener: (e: T) => unknown) => Disposable;

export class EventEmitter<T> {
  private readonly listeners = new Set<(e: T) => unknown>();

  readonly event: Event<T> = (listener) => {
    this.listeners.add(listener);
    return new Disposable(() => this.listeners.delete(listener));
  };

  fire(data: T): void {
    for (const listener of [...this.listeners]) listener(data);
  }

  dispose(): void {
    this.listeners.clear();
  }
}

export interface Terminal {
  name?: string;
  show(): void;
  dispose(): void;
}

interface TerminalOptions {
  name?: string;
  shellPath?: string;
  shellArgs?: string[];
  env?: Record<string, string>;
  isTransient?: boolean;
}

const createdTerminals: Terminal[] = [];
const onDidCloseTerminalEmitter = new EventEmitter<Terminal>();
const commandRegistry = new Map<string, (...args: unknown[]) => unknown>();

export const window = {
  createTreeView<T>(): {
    visible: boolean;
    onDidChangeVisibility: Event<{ visible: boolean }>;
    reveal: (element: T) => Promise<void>;
    dispose: () => void;
  } {
    const visibility = new EventEmitter<{ visible: boolean }>();
    return {
      visible: true,
      onDidChangeVisibility: visibility.event,
      reveal: () => Promise.resolve(),
      dispose: () => visibility.dispose(),
    };
  },

  registerTreeDataProvider(): Disposable {
    return new Disposable();
  },

  createTerminal(options?: TerminalOptions): Terminal {
    const terminal: Terminal = {
      name: options?.name,
      show: () => {},
      dispose: () => onDidCloseTerminalEmitter.fire(terminal),
    };
    createdTerminals.push(terminal);
    return terminal;
  },

  onDidCloseTerminal: onDidCloseTerminalEmitter.event,

  // Reassignable so specs can vi.spyOn / replace and assert calls. Declared
  // arg-less; vi.spyOn still records the actual call arguments.
  showInformationMessage: (): Promise<undefined> => Promise.resolve(undefined),
  showWarningMessage: (): Promise<undefined> => Promise.resolve(undefined),
  showErrorMessage: (): Promise<undefined> => Promise.resolve(undefined),

  createStatusBarItem: () => ({
    text: '',
    tooltip: '',
    command: '',
    name: '',
    show: () => {},
    hide: () => {},
    dispose: () => {},
  }),

  activeTextEditor: undefined as unknown,
  onDidChangeActiveTextEditor: new EventEmitter<unknown>().event,
  registerUriHandler: (): Disposable => new Disposable(),
};

export const commands = {
  registerCommand(command: string, callback: (...args: unknown[]) => unknown): Disposable {
    commandRegistry.set(command, callback);
    return new Disposable(() => commandRegistry.delete(command));
  },
  executeCommand(command: string, ...args: unknown[]): Promise<unknown> {
    const callback = commandRegistry.get(command);
    return Promise.resolve(callback?.(...args));
  },
};

export const workspace = {
  workspaceFolders: undefined as unknown,
  getWorkspaceFolder: (): undefined => undefined,
  onDidChangeWorkspaceFolders: new EventEmitter<unknown>().event,
  getConfiguration: () => ({ get: (): undefined => undefined }),
};

export const Uri = {
  parse: (value: string) => ({ toString: () => value }),
};

// Test-only handles. Not part of the real vscode surface; specs use these to
// drive terminal lifecycle and reset module-level state between cases.
export const __test = {
  createdTerminals,
  reset(): void {
    createdTerminals.length = 0;
    commandRegistry.clear();
  },
  fireTerminalClose(terminal: Terminal): void {
    onDidCloseTerminalEmitter.fire(terminal);
  },
  getCommand(command: string): ((...args: unknown[]) => unknown) | undefined {
    return commandRegistry.get(command);
  },
};
