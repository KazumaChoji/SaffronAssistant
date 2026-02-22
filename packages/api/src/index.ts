// Re-export domain models for convenience
export type { Message, Conversation } from '@app/domain';

// Re-export capabilities
export type { ScreenCapability, CapturedImage } from './capabilities/screen.js';
export type {
  SettingsCapability,
  AppSettings,
  KeyboardShortcuts,
  ApiKeyService,
} from './capabilities/settings.js';
export type { SystemCapability } from './capabilities/system.js';
export type {
  AgentCapability,
  AgentInfo,
  PendingToolApproval,
  StreamEvent,
  TextStreamEvent,
  ThinkingStreamEvent,
  ToolCallStreamEvent,
  ToolResultStreamEvent,
  ErrorStreamEvent,
  UsageStreamEvent,
  HistoryMessage,
  HistoryUserMessage,
  HistoryAssistantMessage,
  HistoryToolMessage,
} from './capabilities/agent.js';

// Types
export type { Result, PartialBy, RequiredBy } from './types/index.js';

/**
 * Complete API surface exposed to renderer via contextBridge
 */
export interface NoteVersion {
  id: number;
  content: string;
  createdAt: number;
}

export interface NotesCapability {
  getContent(noteId?: string): Promise<string>;
  saveContent(content: string, noteId?: string): Promise<void>;
  addImage(dataUrl: string): Promise<number>;
  getImages(): Promise<Array<{ id: number; dataUrl: string }>>;
  pushVersion(content: string, noteId?: string): Promise<void>;
  getVersions(noteId?: string): Promise<NoteVersion[]>;
  onContentChanged(callback: (noteId: string) => void): () => void;
}

export interface TodoItem {
  id: number;
  text: string;
  done: boolean;
  createdAt: number;
  completedAt: number | null;
}

export interface TodosCapability {
  getAll(): Promise<TodoItem[]>;
  add(text: string): Promise<TodoItem>;
  update(id: number, done: boolean): Promise<void>;
  delete(id: number): Promise<void>;
  onTodosChanged(callback: () => void): () => void;
}

export interface TrackerCapability {
  getDays(): Promise<string[]>;
  toggleDay(date: string): Promise<boolean>;
  getTitle(): Promise<string>;
  setTitle(title: string): Promise<void>;
}

export interface WorkSession {
  id: number;
  clockIn: number;
  clockOut: number | null;
}

export interface WorkClockCapability {
  clockIn(): Promise<WorkSession>;
  clockOut(id: number): Promise<WorkSession | null>;
  getSessions(since?: number): Promise<WorkSession[]>;
  deleteSession(id: number): Promise<void>;
}

export type ClockCommand =
  | { target: 'timer'; action: 'start'; hours: number; minutes: number; seconds: number }
  | { target: 'timer'; action: 'pause' }
  | { target: 'timer'; action: 'resume' }
  | { target: 'timer'; action: 'reset' }
  | { target: 'stopwatch'; action: 'start' }
  | { target: 'stopwatch'; action: 'pause' }
  | { target: 'stopwatch'; action: 'reset' }
  | { target: 'stopwatch'; action: 'lap' };

export interface ClockStatus {
  timer: {
    state: 'running' | 'paused' | 'stopped' | 'finished';
    remainingMs: number;
  };
  stopwatch: {
    state: 'running' | 'stopped';
    elapsedMs: number;
    lapCount: number;
  };
}

export interface ClockCapability {
  onCommand(callback: (cmd: ClockCommand) => void): () => void;
  onStatusRequest(callback: (requestId: string) => void): () => void;
  sendStatus(requestId: string, status: ClockStatus): void;
}

export interface ElectronAPI {
  screen: import('./capabilities/screen.js').ScreenCapability;
  settings: import('./capabilities/settings.js').SettingsCapability;
  system: import('./capabilities/system.js').SystemCapability;
  agent: import('./capabilities/agent.js').AgentCapability;
  notes: NotesCapability;
  todos: TodosCapability;
  tracker: TrackerCapability;
  work: WorkClockCapability;
  clock: ClockCapability;
}

/**
 * Global window interface augmentation
 * This allows TypeScript to recognize window.api in renderer
 */
declare global {
  interface Window {
    api: ElectronAPI;
  }
}
