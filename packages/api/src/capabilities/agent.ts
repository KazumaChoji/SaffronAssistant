/**
 * Agent capability - Agentic AI operations
 */

export interface AgentInfo {
  id: string;
  profile_id: string;
  profile_name: string;
  status: 'idle' | 'thinking' | 'executing_tools' | 'waiting_approval';
  created_at: number;
  turn_count: number;
  total_tokens: number;
  total_cost: number;
}

export interface PendingToolApproval {
  id: string;
  tool_call: {
    id: string;
    name: string;
    input: Record<string, any>;
  };
  tool_definition: {
    name: string;
    description: string;
  };
  risk_level: 'safe' | 'moderate' | 'dangerous';
  timestamp: number;
}

/**
 * Stream events for real-time updates
 */
export interface TextStreamEvent {
  type: 'text';
  content: string;
}

export interface ThinkingStreamEvent {
  type: 'thinking';
  content: string;
}

export interface ToolCallStreamEvent {
  type: 'tool_call';
  tool_call: {
    id: string;
    name: string;
    input: Record<string, any>;
  };
}

export interface ToolResultStreamEvent {
  type: 'tool_result';
  tool_call_id: string;
  tool_name: string;
  result: {
    tool_call_id: string;
    success: boolean;
    output?: string;
    error?: string;
  };
}

export interface ErrorStreamEvent {
  type: 'error';
  error: string;
}

export interface UsageStreamEvent {
  type: 'usage';
  usage: {
    input_tokens: number;
    output_tokens: number;
  };
}

export type StreamEvent =
  | TextStreamEvent
  | ThinkingStreamEvent
  | ToolCallStreamEvent
  | ToolResultStreamEvent
  | ErrorStreamEvent
  | UsageStreamEvent;

/**
 * Agent capability interface
 */
export interface AgentCapability {
  // Agent lifecycle
  create: (profileId?: string) => Promise<{ success: boolean; agent_id?: string; error?: string }>;
  sendMessageStreaming: (
    agentId: string,
    message: string,
    imageBase64?: string,
    images?: string[]
  ) => Promise<{ success: boolean; error?: string }>;
  setAutoApprove: (
    agentId: string,
    enabled: boolean
  ) => Promise<{ success: boolean; error?: string }>;
  terminate: (agentId: string) => Promise<{ success: boolean; error?: string }>;
  terminateAll: () => Promise<{ success: boolean; error?: string }>;

  // Agent queries
  getAll: () => Promise<{ success: boolean; agents?: AgentInfo[]; error?: string }>;
  get: (agentId: string) => Promise<{ success: boolean; agent?: AgentInfo; error?: string }>;
  getHistory: (
    agentId: string
  ) => Promise<{ success: boolean; history?: any[]; error?: string }>;

  // Event listeners
  onCreated: (callback: (data: { id: string; profile_id: string; profile_name: string }) => void) => () => void;
  onStatusChange: (callback: (data: { id: string; status: string }) => void) => () => void;
  onError: (callback: (data: { id: string; error: string }) => void) => () => void;
  onTerminated: (callback: (data: { id: string }) => void) => () => void;
  onStreamEvent: (callback: (data: { agent_id: string; event: StreamEvent }) => void) => () => void;

  // Tool approval (UI must respond)
  onToolApprovalRequest: (callback: (approval: PendingToolApproval) => void) => () => void;
  respondToToolApproval: (approvalId: string, response: {
    type: 'approved' | 'denied' | 'modified';
    modified_input?: Record<string, any>;
  }) => void;

}
