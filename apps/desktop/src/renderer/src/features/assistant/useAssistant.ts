import { create } from 'zustand';
import type {
  AgentInfo,
  PendingToolApproval,
  StreamEvent,
} from '@app/api';

export interface TextSegment {
  type: 'text';
  content: string;
}

export interface ToolSegment {
  type: 'tool';
  toolCall: { id: string; name: string; input: any };
  result?: { success: boolean; output?: string; images?: string[]; error?: string };
}

export type MessageSegment = TextSegment | ToolSegment;

export interface Message {
  id: string;
  role: 'user' | 'assistant';
  segments: MessageSegment[];
  timestamp: number;
  imageBase64?: string;
  screenshots?: string[];
  thinking?: string;
  thinkingExpanded?: boolean;
}

interface PendingScreenshot {
  id: string;
  base64: string;
}

interface AssistantStore {
  // Current agent
  currentAgentId: string | null;
  agentInfo: AgentInfo | null;

  // State
  messages: Message[];
  streamingMessage: {
    id: string;
    segments: MessageSegment[];
    thinking: string;
    currentText: string;
  } | null;
  isLoading: boolean;
  error: string | null;

  // Screenshots
  pendingScreenshots: PendingScreenshot[];

  // Approvals
  pendingApproval: PendingToolApproval | null;

  // Settings
  autoApproveSafe: boolean;

  // Actions
  sendMessage: (message: string, imageBase64?: string) => Promise<void>;
  clearChat: () => Promise<void>;
  setAutoApproveSafe: (enabled: boolean) => Promise<void>;
  addScreenshot: () => Promise<void>;
  removeScreenshot: (id: string) => void;

  // Approval responses
  approveToolUse: () => void;
  denyToolUse: () => void;
  modifyToolUse: (modifiedInput: Record<string, any>) => void;

  // Internal
  handleToolApprovalRequest: (approval: PendingToolApproval) => void;
  handleStatusChange: (data: { status: string }) => void;
  handleError: (data: { error: string }) => void;
  handleStreamEvent: (data: { agent_id: string; event: StreamEvent }) => void;
  toggleThinking: (messageId: string) => void;
}

const MAX_PENDING_SCREENSHOTS = 3; // matches AppConfig.screenshot.maxPending (main process)

function generateId(): string {
  return `${Date.now()}-${Math.random().toString(36).substring(2, 9)}`;
}

/**
 * Lazily create an agent if one doesn't exist yet.
 * Returns the agent ID or null on failure (sets error state).
 */
async function ensureAgent(
  get: () => AssistantStore,
  set: (state: Partial<AssistantStore>) => void
): Promise<string | null> {
  const { currentAgentId } = get();
  if (currentAgentId) return currentAgentId;

  set({ isLoading: true, error: null });

  try {
    const response = await window.api.agent.create('helper');

    if (response.success && response.agent_id) {
      set({ currentAgentId: response.agent_id });

      const infoResponse = await window.api.agent.get(response.agent_id);
      if (infoResponse.success && infoResponse.agent) {
        set({ agentInfo: infoResponse.agent });
      }

      await window.api.agent.setAutoApprove(
        response.agent_id,
        get().autoApproveSafe
      );

      return response.agent_id;
    } else {
      set({ error: response.error || 'Failed to create agent', isLoading: false });
      return null;
    }
  } catch (error: any) {
    set({ error: error.message || 'Failed to create agent', isLoading: false });
    return null;
  }
}

export const useAssistant = create<AssistantStore>((set, get) => ({
  // Initial state
  currentAgentId: null,
  agentInfo: null,
  messages: [],
  streamingMessage: null,
  isLoading: false,
  error: null,
  pendingScreenshots: [],
  pendingApproval: null,
  autoApproveSafe: false,

  // Add screenshot
  addScreenshot: async () => {
    const { pendingScreenshots } = get();

    if (pendingScreenshots.length >= MAX_PENDING_SCREENSHOTS) {
      return;
    }

    try {
      const image = await window.api.screen.captureScreen();
      const screenshot: PendingScreenshot = {
        id: generateId(),
        base64: image.base64,
      };
      set({ pendingScreenshots: [...pendingScreenshots, screenshot] });
    } catch (error) {
      console.error('Failed to capture screenshot:', error);
      set({ error: 'Failed to capture screenshot' });
    }
  },

  // Remove screenshot
  removeScreenshot: (id: string) => {
    set({
      pendingScreenshots: get().pendingScreenshots.filter((s) => s.id !== id),
    });
  },

  // Send a message
  sendMessage: async (message: string, imageBase64?: string) => {
    if (!message.trim()) return;

    const { pendingScreenshots } = get();
    const screenshots = pendingScreenshots.map(s => s.base64);

    // Combine all images into a single array
    const images: string[] = [];
    if (imageBase64) images.push(imageBase64);
    for (const s of screenshots) {
      if (s !== imageBase64) images.push(s);
    }

    const agentId = await ensureAgent(get, set);
    if (!agentId) return;

    // Add user message
    const userMessage: Message = {
      id: generateId(),
      role: 'user',
      segments: [{ type: 'text', content: message }],
      timestamp: Date.now(),
      imageBase64: images[0],
      screenshots: images.length > 0 ? images : undefined,
    };

    set({
      messages: [...get().messages, userMessage],
      isLoading: true,
      error: null,
      pendingScreenshots: [], // Clear screenshots after sending
      streamingMessage: {
        id: generateId(),
        segments: [],
        thinking: '',
        currentText: '',
      },
    });

    try {
      const response = await window.api.agent.sendMessageStreaming(
        agentId,
        message,
        images.length > 0 ? images : undefined
      );

      if (!response.success) {
        set({
          error: response.error || 'Failed to send message',
          isLoading: false,
          streamingMessage: null,
        });
      }
    } catch (error: any) {
      set({
        error: error.message || 'Failed to send message',
        isLoading: false,
        streamingMessage: null,
      });
    }
  },

  // Clear chat - reset everything
  clearChat: async () => {
    const { currentAgentId } = get();

    // Terminate agent if exists
    if (currentAgentId) {
      try {
        await window.api.agent.terminate(currentAgentId);
      } catch (error) {
        console.error('Failed to terminate agent:', error);
      }
    }

    // Reset all state
    set({
      currentAgentId: null,
      agentInfo: null,
      messages: [],
      streamingMessage: null,
      isLoading: false,
      error: null,
      pendingScreenshots: [],
      pendingApproval: null,
    });
  },

  // Toggle auto-approve
  setAutoApproveSafe: async (enabled: boolean) => {
    const { currentAgentId } = get();

    set({ autoApproveSafe: enabled });

    if (currentAgentId) {
      await window.api.agent.setAutoApprove(currentAgentId, enabled);
    }
  },

  // Tool approval handlers
  approveToolUse: () => {
    const { pendingApproval } = get();
    if (!pendingApproval) return;

    window.api.agent.respondToToolApproval(pendingApproval.id, {
      type: 'approved',
    });

    set({ pendingApproval: null });
  },

  denyToolUse: () => {
    const { pendingApproval } = get();
    if (!pendingApproval) return;

    window.api.agent.respondToToolApproval(pendingApproval.id, {
      type: 'denied',
    });

    set({ pendingApproval: null });
  },

  modifyToolUse: (modifiedInput: Record<string, any>) => {
    const { pendingApproval } = get();
    if (!pendingApproval) return;

    window.api.agent.respondToToolApproval(pendingApproval.id, {
      type: 'modified',
      modified_input: modifiedInput,
    });

    set({ pendingApproval: null });
  },

  // Event handlers
  handleToolApprovalRequest: (approval: PendingToolApproval) => {
    set({ pendingApproval: approval });
  },

  handleStatusChange: (data: { status: string }) => {
    set({ isLoading: data.status !== 'idle' });
  },

  handleError: (data: { error: string }) => {
    set({ error: data.error, isLoading: false });
  },

  // Handle streaming events
  handleStreamEvent: (data: { agent_id: string; event: StreamEvent }) => {
    const { streamingMessage, messages } = get();

    if (!streamingMessage) return;

    const event = data.event;

    switch (event.type) {
      case 'text':
        set({
          streamingMessage: {
            ...streamingMessage,
            currentText: streamingMessage.currentText + event.content,
          },
        });
        break;

      case 'thinking':
        set({
          streamingMessage: {
            ...streamingMessage,
            thinking: streamingMessage.thinking + event.content,
          },
        });
        break;

      case 'tool_call': {
        const updatedSegments = [...streamingMessage.segments];
        if (streamingMessage.currentText) {
          updatedSegments.push({ type: 'text', content: streamingMessage.currentText });
        }
        updatedSegments.push({
          type: 'tool',
          toolCall: event.tool_call,
        });
        set({
          streamingMessage: {
            ...streamingMessage,
            segments: updatedSegments,
            currentText: '',
          },
        });
        break;
      }

      case 'tool_result': {
        const segmentsWithResult = streamingMessage.segments.map((seg) =>
          seg.type === 'tool' && seg.toolCall.id === event.tool_call_id
            ? { ...seg, result: event.result }
            : seg
        );
        set({
          streamingMessage: {
            ...streamingMessage,
            segments: segmentsWithResult,
          },
        });
        break;
      }

      case 'usage': {
        // Streaming complete - finalize message
        const finalSegments = [...streamingMessage.segments];
        if (streamingMessage.currentText) {
          finalSegments.push({ type: 'text' as const, content: streamingMessage.currentText });
        }

        const finalMessage: Message = {
          id: streamingMessage.id,
          role: 'assistant',
          segments: finalSegments,
          thinking: streamingMessage.thinking || undefined,
          thinkingExpanded: false,
          timestamp: Date.now(),
        };

        set({
          messages: [...messages, finalMessage],
          streamingMessage: null,
          isLoading: false,
        });

        // Update agent info
        const { currentAgentId } = get();
        if (currentAgentId) {
          window.api.agent.get(currentAgentId).then((response) => {
            if (response.success && response.agent) {
              set({ agentInfo: response.agent });
            }
          });
        }
        break;
      }

      case 'error':
        set({
          error: event.error,
          streamingMessage: null,
          isLoading: false,
        });
        break;
    }
  },

  // Toggle thinking expansion
  toggleThinking: (messageId: string) => {
    set({
      messages: get().messages.map((msg) =>
        msg.id === messageId
          ? { ...msg, thinkingExpanded: !msg.thinkingExpanded }
          : msg
      ),
    });
  },
}));

// Setup event listeners
if (typeof window !== 'undefined' && window.api?.agent) {
  window.api.agent.onToolApprovalRequest((approval) => {
    useAssistant.getState().handleToolApprovalRequest(approval);
  });

  window.api.agent.onStatusChange((data) => {
    useAssistant.getState().handleStatusChange(data);
  });

  window.api.agent.onError((data) => {
    useAssistant.getState().handleError(data);
  });

  window.api.agent.onStreamEvent((data) => {
    useAssistant.getState().handleStreamEvent(data);
  });
}
