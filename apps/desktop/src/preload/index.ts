import { contextBridge, ipcRenderer } from 'electron';
import type {
  ScreenCapability,
  SettingsCapability,
  SystemCapability,
  AgentCapability,
  NotesCapability,
  TodosCapability,
  TrackerCapability,
  ElectronAPI,
} from '@app/api';

/**
 * Preload script that exposes a safe API to the renderer
 * Uses contextBridge to isolate the renderer from Node.js/Electron APIs
 */

// Screen API
const screenAPI: ScreenCapability = {
  captureScreen: () => ipcRenderer.invoke('screen:capture'),
};

// Settings API - API keys are read from .env, only booleans cross to renderer
const settingsAPI: SettingsCapability = {
  hasApiKey: (service) => ipcRenderer.invoke('settings:hasApiKey', service),
  getApiKeyStatuses: () => ipcRenderer.invoke('settings:getApiKeyStatuses'),
  getSettings: () => ipcRenderer.invoke('settings:getSettings'),
  updateSettings: (settings) =>
    ipcRenderer.invoke('settings:updateSettings', settings),
};

// System API
const systemAPI: SystemCapability = {
  getAppVersion: () => ipcRenderer.invoke('system:getAppVersion'),
  showWindow: () => ipcRenderer.invoke('system:showWindow'),
  hideWindow: () => ipcRenderer.invoke('system:hideWindow'),
  toggleWindow: () => ipcRenderer.invoke('system:toggleWindow'),
  quit: () => ipcRenderer.invoke('system:quit'),
  uninstall: () => ipcRenderer.invoke('system:uninstall'),
  isWindowVisible: () => ipcRenderer.invoke('system:isWindowVisible'),
  onWindowShown: (callback: () => void) => {
    ipcRenderer.on('window:shown', callback);
    return () => ipcRenderer.removeListener('window:shown', callback);
  },
  onScreenshotCapture: (callback: () => void) => {
    ipcRenderer.on('screenshot:capture', callback);
    return () => ipcRenderer.removeListener('screenshot:capture', callback);
  },
  setOpacity: (opacity: number) => ipcRenderer.invoke('system:setOpacity', opacity),
  getOpacity: () => ipcRenderer.invoke('system:getOpacity'),
  toggleTransparency: () => ipcRenderer.invoke('system:toggleTransparency'),
  onOpacityChanged: (callback: (opacity: number) => void) => {
    const handler = (_event: any, opacity: number) => callback(opacity);
    ipcRenderer.on('system:opacity-changed', handler);
    return () => ipcRenderer.removeListener('system:opacity-changed', handler);
  },
  setFgOpacity: (opacity: number) => ipcRenderer.invoke('system:setFgOpacity', opacity),
  getFgOpacity: () => ipcRenderer.invoke('system:getFgOpacity'),
  onFgOpacityChanged: (callback: (opacity: number) => void) => {
    const handler = (_event: any, opacity: number) => callback(opacity);
    ipcRenderer.on('system:fg-opacity-changed', handler);
    return () => ipcRenderer.removeListener('system:fg-opacity-changed', handler);
  },
  setPosition: (position: 'top' | 'bottom' | 'left' | 'right') => ipcRenderer.invoke('system:setPosition', position),
  getPosition: () => ipcRenderer.invoke('system:getPosition'),
  onAnimateIn: (callback: (position: 'top' | 'bottom' | 'left' | 'right', durationMs: number) => void) => {
    const handler = (_event: any, position: 'top' | 'bottom' | 'left' | 'right', durationMs: number) => callback(position, durationMs);
    ipcRenderer.on('window:animate-in', handler);
    return () => ipcRenderer.removeListener('window:animate-in', handler);
  },
  onAnimateOut: (callback: (position: 'top' | 'bottom' | 'left' | 'right', durationMs: number) => void) => {
    const handler = (_event: any, position: 'top' | 'bottom' | 'left' | 'right', durationMs: number) => callback(position, durationMs);
    ipcRenderer.on('window:animate-out', handler);
    return () => ipcRenderer.removeListener('window:animate-out', handler);
  },
  getScreenRecordingStatus: () => ipcRenderer.invoke('system:getScreenRecordingStatus'),
  openScreenRecordingPrefs: () => ipcRenderer.invoke('system:openScreenRecordingPrefs'),
};

// Agent API - fixed: use per-handler removeListener instead of removeAllListeners
const agentAPI: AgentCapability = {
  // Agent lifecycle
  create: (profileId) => ipcRenderer.invoke('agent:create', profileId),
  sendMessageStreaming: (agentId, message, images) =>
    ipcRenderer.invoke('agent:send-message-streaming', agentId, message, images),
  setAutoApprove: (agentId, enabled) =>
    ipcRenderer.invoke('agent:set-auto-approve', agentId, enabled),
  terminate: (agentId) => ipcRenderer.invoke('agent:terminate', agentId),
  terminateAll: () => ipcRenderer.invoke('agent:terminate-all'),

  // Agent queries
  getAll: () => ipcRenderer.invoke('agent:get-all'),
  get: (agentId) => ipcRenderer.invoke('agent:get', agentId),
  getHistory: (agentId) => ipcRenderer.invoke('agent:get-history', agentId),

  // Event listeners
  onCreated: (callback) => {
    const handler = (_event: any, data: any) => callback(data);
    ipcRenderer.on('agent:created', handler);
    return () => ipcRenderer.removeListener('agent:created', handler);
  },
  onStatusChange: (callback) => {
    const handler = (_event: any, data: any) => callback(data);
    ipcRenderer.on('agent:status-change', handler);
    return () => ipcRenderer.removeListener('agent:status-change', handler);
  },
  onError: (callback) => {
    const handler = (_event: any, data: any) => callback(data);
    ipcRenderer.on('agent:error', handler);
    return () => ipcRenderer.removeListener('agent:error', handler);
  },
  onTerminated: (callback) => {
    const handler = (_event: any, data: any) => callback(data);
    ipcRenderer.on('agent:terminated', handler);
    return () => ipcRenderer.removeListener('agent:terminated', handler);
  },
  onStreamEvent: (callback) => {
    const handler = (_event: any, data: any) => callback(data);
    ipcRenderer.on('agent:stream-event', handler);
    return () => ipcRenderer.removeListener('agent:stream-event', handler);
  },

  // Tool approval
  onToolApprovalRequest: (callback) => {
    const handler = (_event: any, approval: any) => callback(approval);
    ipcRenderer.on('agent:tool-approval-request', handler);
    return () => ipcRenderer.removeListener('agent:tool-approval-request', handler);
  },
  respondToToolApproval: (approvalId, response) => {
    ipcRenderer.send('agent:tool-approval-response', {
      approval_id: approvalId,
      ...response,
    });
  },

};

// Notes API
const notesAPI: NotesCapability = {
  getContent: (noteId) => ipcRenderer.invoke('notes:getContent', noteId),
  saveContent: (content, noteId) => ipcRenderer.invoke('notes:saveContent', content, noteId),
  addImage: (dataUrl) => ipcRenderer.invoke('notes:addImage', dataUrl),
  getImages: () => ipcRenderer.invoke('notes:getImages'),
  pushVersion: (content, noteId) => ipcRenderer.invoke('notes:pushVersion', content, noteId),
  getVersions: (noteId) => ipcRenderer.invoke('notes:getVersions', noteId),
};

// Todos API
const todosAPI: TodosCapability = {
  getAll: () => ipcRenderer.invoke('todos:getAll'),
  add: (text) => ipcRenderer.invoke('todos:add', text),
  update: (id, done) => ipcRenderer.invoke('todos:update', id, done),
  delete: (id) => ipcRenderer.invoke('todos:delete', id),
};

// Tracker API
const trackerAPI: TrackerCapability = {
  getDays: () => ipcRenderer.invoke('tracker:getDays'),
  toggleDay: (date) => ipcRenderer.invoke('tracker:toggleDay', date),
  getTitle: () => ipcRenderer.invoke('tracker:getTitle'),
  setTitle: (title) => ipcRenderer.invoke('tracker:setTitle', title),
};

// Expose the complete API to renderer
const api = {
  screen: screenAPI,
  settings: settingsAPI,
  system: systemAPI,
  agent: agentAPI,
  notes: notesAPI,
  todos: todosAPI,
  tracker: trackerAPI,
} satisfies ElectronAPI;

contextBridge.exposeInMainWorld('api', api);

