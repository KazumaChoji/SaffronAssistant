/**
 * Core types for the agent system
 * Based on Mistral CLI architecture adapted for Electron
 */

// ===== Tool Definitions =====

export interface ToolDefinition {
  name: string;
  description: string;
  input_schema: {
    type: 'object';
    properties: Record<string, any>;
    required?: string[];
  };
}

export interface Tool<TInput = Record<string, any>> {
  name: string;
  description: string;
  input_schema: {
    type: 'object';
    properties: Record<string, any>;
    required?: string[];
  };
  permission: ToolPermission;
  execute: (input: TInput) => Promise<ToolOutput>;
}

export interface ToolCall {
  id: string;
  name: string;
  input: Record<string, any>;
}

export interface ToolResult {
  tool_call_id: string;
  success: boolean;
  output?: string;
  images?: string[]; // base64 data URIs to send back to Claude as vision input
  error?: string;
}

export type ToolOutput = string | { text: string; images?: string[] };

// ===== Permission System =====

export type PermissionLevel = 'always' | 'ask' | 'never';
export type RiskLevel = 'safe' | 'moderate' | 'dangerous';

export interface ToolPermission {
  permission: PermissionLevel;
  risk_level: RiskLevel;
}

export interface PendingToolApproval {
  id: string;
  tool_call: ToolCall;
  tool_definition: ToolDefinition;
  risk_level: RiskLevel;
  timestamp: number;
}

export type ApprovalResponse =
  | { type: 'approved' }
  | { type: 'denied'; reason?: string }
  | { type: 'modified'; modified_input: Record<string, any> };

// ===== Messages =====

export interface UserMessage {
  role: 'user';
  content: string;
  image_base64?: string; // For backward compatibility
  images?: string[]; // Multiple images
  timestamp: number;
}

export interface AssistantMessage {
  role: 'assistant';
  content: string;
  tool_calls?: ToolCall[];
  timestamp: number;
}

export interface ToolMessage {
  role: 'tool';
  tool_results: ToolResult[];
  timestamp: number;
}

export type Message = UserMessage | AssistantMessage | ToolMessage;

// ===== Agent Profiles =====

export interface AgentProfile {
  id: string;
  name: string;
  description: string;
  system_instructions: string;
  model: string;
  tool_permissions: Record<string, PermissionLevel>;
  max_iterations: number;
}

// ===== Session State =====

export interface AgentSessionConfig {
  profile: AgentProfile;
  working_directory?: string;
  max_iterations?: number;
}

export interface SessionContext {
  working_directory: string;
  session_id: string;
  turn_count: number;
  total_tokens: number;
  total_cost: number;
}

// ===== Streaming Events =====

export interface TextEvent {
  type: 'text';
  content: string;
}

export interface ThinkingEvent {
  type: 'thinking';
  content: string;
}

export interface ToolCallEvent {
  type: 'tool_call';
  tool_call: ToolCall;
}

export interface ToolResultEvent {
  type: 'tool_result';
  tool_call_id: string;
  tool_name: string;
  result: ToolResult;
}

export interface ErrorEvent {
  type: 'error';
  error: string;
}

export interface UsageEvent {
  type: 'usage';
  usage: {
    input_tokens: number;
    output_tokens: number;
  };
}

export type StreamEvent =
  | TextEvent
  | ThinkingEvent
  | ToolCallEvent
  | ToolResultEvent
  | ErrorEvent
  | UsageEvent;
