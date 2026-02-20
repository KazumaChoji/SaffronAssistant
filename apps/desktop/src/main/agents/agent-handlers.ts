/**
 * IPC Handlers for agent operations
 * Connects the renderer process to the agent system
 */

import { ipcMain, BrowserWindow } from 'electron';
import type { AgentManager } from './agent-manager';

export function registerAgentHandlers(
  agentManager: AgentManager,
  mainWindow: BrowserWindow
): void {
  // Create a new agent session
  ipcMain.handle('agent:create', async (_event, profileId: string = 'general') => {
    try {
      const agentId = await agentManager.createAgent(profileId);
      return { success: true, agent_id: agentId };
    } catch (error: any) {
      return { success: false, error: error.message };
    }
  });

  // Send a message to an agent with streaming
  ipcMain.handle(
    'agent:send-message-streaming',
    async (_event, agentId: string, message: string, images?: string[]) => {
      try {
        // Stream events to the renderer process
        for await (const streamEvent of agentManager.sendMessageStreaming(
          agentId,
          message,
          images
        )) {
          // Send each stream event to the renderer
          mainWindow.webContents.send('agent:stream-event', {
            agent_id: agentId,
            event: streamEvent,
          });
        }

        return { success: true };
      } catch (error: any) {
        return { success: false, error: error.message };
      }
    }
  );

  // Set auto-approve for safe tools
  ipcMain.handle(
    'agent:set-auto-approve',
    async (_event, agentId: string, enabled: boolean) => {
      try {
        agentManager.setAutoApproveSafe(agentId, enabled);
        return { success: true };
      } catch (error: any) {
        return { success: false, error: error.message };
      }
    }
  );

  // Get all active agents
  ipcMain.handle('agent:get-all', async () => {
    try {
      const agents = agentManager.getActiveAgents();
      return { success: true, agents };
    } catch (error: any) {
      return { success: false, error: error.message };
    }
  });

  // Get a specific agent
  ipcMain.handle('agent:get', async (_event, agentId: string) => {
    try {
      const agent = agentManager.getAgent(agentId);
      if (!agent) {
        return { success: false, error: 'Agent not found' };
      }
      return { success: true, agent };
    } catch (error: any) {
      return { success: false, error: error.message };
    }
  });

  // Get conversation history
  ipcMain.handle('agent:get-history', async (_event, agentId: string) => {
    try {
      const history = agentManager.getConversationHistory(agentId);
      return { success: true, history };
    } catch (error: any) {
      return { success: false, error: error.message };
    }
  });

  // Terminate an agent
  ipcMain.handle('agent:terminate', async (_event, agentId: string) => {
    try {
      await agentManager.terminateAgent(agentId);
      return { success: true };
    } catch (error: any) {
      return { success: false, error: error.message };
    }
  });

  // Terminate all agents
  ipcMain.handle('agent:terminate-all', async () => {
    try {
      await agentManager.terminateAll();
      return { success: true };
    } catch (error: any) {
      return { success: false, error: error.message };
    }
  });

  // Tool approval responses and user answers are handled by
  // PermissionManager.promptUser() and ToolExecutor.askUser() respectively
  // via their own ipcMain.on() listeners.

  // Forward agent manager events to renderer
  agentManager.on('agent:created', (data) => {
    mainWindow.webContents.send('agent:created', data);
  });

  agentManager.on('agent:status-change', (data) => {
    mainWindow.webContents.send('agent:status-change', data);
  });

  agentManager.on('agent:error', (data) => {
    mainWindow.webContents.send('agent:error', data);
  });

  agentManager.on('agent:terminated', (data) => {
    mainWindow.webContents.send('agent:terminated', data);
  });

}
