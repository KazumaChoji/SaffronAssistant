/**
 * Agent System - Main exports
 */

export { AgentManager } from './agent-manager';
export { AgentSession } from './agent-session';
export { PermissionManager } from './permission-manager';
export { ToolExecutor } from './tool-executor';
export { registerAgentHandlers } from './agent-handlers';

export { AGENT_PROFILES, getProfile, listProfiles } from './profiles';
export { createToolRegistry } from './tools';
export { ToolRegistry } from './tool-registry';

export type {
  AgentProfile,
  AgentSessionConfig,
  Message,
  UserMessage,
  AssistantMessage,
  ToolMessage,
  ToolCall,
  ToolResult,
  ToolDefinition,
  PermissionLevel,
  RiskLevel,
  ToolPermission,
  PendingToolApproval,
  ApprovalResponse,
  SessionContext,
} from './types';

export type { AgentInfo } from '@app/api';
