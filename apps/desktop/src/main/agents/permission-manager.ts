/**
 * Permission Manager - Handle tool execution permissions
 * Three-level permission system: 'always' | 'ask' | 'never'
 */

import { BrowserWindow, ipcMain } from 'electron';
import type {
  ToolCall,
  ToolDefinition,
  PendingToolApproval,
  ApprovalResponse,
  AgentProfile,
} from './types';
import type { ToolRegistry } from './tool-registry';
import { AppConfig } from '../config/app-config';

export class PermissionManager {
  private profile: AgentProfile;
  private mainWindow: BrowserWindow;
  private registry: ToolRegistry;
  private pendingApprovals: Map<string, PendingToolApproval> = new Map();
  private autoApproveSafe: boolean = false;

  constructor(profile: AgentProfile, mainWindow: BrowserWindow, registry: ToolRegistry) {
    this.profile = profile;
    this.mainWindow = mainWindow;
    this.registry = registry;
  }

  /**
   * Set whether to auto-approve safe tools
   */
  setAutoApproveSafe(enabled: boolean): void {
    this.autoApproveSafe = enabled;
  }

  /**
   * Check if a tool call needs permission
   * Returns 'allowed', 'denied', or waits for user response
   */
  async checkPermission(toolCall: ToolCall): Promise<'allowed' | 'denied'> {
    // Get permission level from profile
    const permissionLevel = this.profile.tool_permissions[toolCall.name] || 'ask';

    // Check permission level
    if (permissionLevel === 'always') {
      return 'allowed';
    }

    if (permissionLevel === 'never') {
      console.log(`Tool ${toolCall.name} is disabled for profile ${this.profile.id}`);
      return 'denied';
    }

    // Permission level is 'ask' -- check if we should auto-approve
    const toolPerm = this.registry.has(toolCall.name)
      ? this.registry.getPermission(toolCall.name)
      : undefined;
    const riskLevel = toolPerm?.risk_level || 'moderate';

    if (this.autoApproveSafe && riskLevel === 'safe') {
      return 'allowed';
    }

    // Need to ask user
    const toolDef = this.getToolDefinition(toolCall.name);
    return await this.promptUser(toolCall, toolDef, riskLevel);
  }

  /**
   * Prompt user for approval via IPC
   */
  private async promptUser(
    toolCall: ToolCall,
    toolDef: ToolDefinition,
    riskLevel: string
  ): Promise<'allowed' | 'denied'> {
    const approval: PendingToolApproval = {
      id: toolCall.id,
      tool_call: toolCall,
      tool_definition: toolDef,
      risk_level: riskLevel as any,
      timestamp: Date.now(),
    };

    this.pendingApprovals.set(toolCall.id, approval);

    // Send to renderer
    this.mainWindow.webContents.send('agent:tool-approval-request', approval);

    // Wait for response
    return new Promise((resolve) => {
      const listener = (_event: any, response: ApprovalResponse & { approval_id: string }) => {
        if (response.approval_id === toolCall.id) {
          ipcMain.off('agent:tool-approval-response', listener);
          this.pendingApprovals.delete(toolCall.id);

          if (response.type === 'approved') {
            resolve('allowed');
          } else if (response.type === 'denied') {
            resolve('denied');
          } else if (response.type === 'modified') {
            toolCall.input = response.modified_input;
            resolve('allowed');
          } else {
            console.warn(`Unexpected approval response type: ${(response as any).type}`);
            resolve('denied');
          }
        }
      };

      ipcMain.on('agent:tool-approval-response', listener);

      setTimeout(() => {
        if (this.pendingApprovals.has(toolCall.id)) {
          ipcMain.off('agent:tool-approval-response', listener);
          this.pendingApprovals.delete(toolCall.id);
          console.log(`Tool approval timeout for ${toolCall.name}`);
          resolve('denied');
        }
      }, AppConfig.tools.userResponseTimeoutMs);
    });
  }

  /**
   * Get tool definition by name
   */
  private getToolDefinition(toolName: string): ToolDefinition {
    const tool = this.registry.get(toolName);
    if (!tool) {
      throw new Error(`Unknown tool: ${toolName}`);
    }
    return { name: tool.name, description: tool.description, input_schema: tool.input_schema };
  }

  /**
   * Get pending approvals (for debugging)
   */
  getPendingApprovals(): PendingToolApproval[] {
    return Array.from(this.pendingApprovals.values());
  }
}
