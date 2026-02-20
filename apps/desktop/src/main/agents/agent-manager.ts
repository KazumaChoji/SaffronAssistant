/**
 * Agent Manager - Manage multiple agent sessions
 */

import { EventEmitter } from 'events';
import { BrowserWindow } from 'electron';
import type {
  AgentSessionConfig,
  StreamEvent,
} from './types';
import type { AgentInfo } from '@app/api';
import { AgentSession } from './agent-session';
import { getProfile } from './profiles';
import type { DatabaseService } from '../services/database.service';
import type { ClaudeAPIService } from '../services/claude-api.service';
import type { ScreenCaptureService } from '../services/screen-capture.service';
import { AppConfig } from '../config/app-config';

export class AgentManager extends EventEmitter {
  private activeAgents: Map<string, AgentSession> = new Map();
  private apiService: ClaudeAPIService;
  private mainWindow: BrowserWindow;
  private database: DatabaseService;
  private screenCapture?: ScreenCaptureService;
  private maxConcurrentAgents: number = AppConfig.agents.maxConcurrent;
  private initialized = false;

  constructor(
    mainWindow: BrowserWindow,
    database: DatabaseService,
    claudeAPI: ClaudeAPIService,
    screenCapture?: ScreenCaptureService,
  ) {
    super();
    this.mainWindow = mainWindow;
    this.database = database;
    this.apiService = claudeAPI;
    this.screenCapture = screenCapture;
  }

  initialize(apiKey: string): void {
    this.apiService.initialize(apiKey);
    this.initialized = true;
  }

  isInitialized(): boolean {
    return this.initialized;
  }

  /**
   * Create a new agent session
   */
  async createAgent(
    profileId: string = 'general',
    config?: Partial<AgentSessionConfig>
  ): Promise<string> {
    if (!this.initialized) {
      throw new Error('AgentManager not initialized. Call initialize() first.');
    }

    if (this.activeAgents.size >= this.maxConcurrentAgents) {
      throw new Error(`Maximum concurrent agents (${this.maxConcurrentAgents}) reached`);
    }

    const profile = getProfile(profileId);

    const sessionConfig: AgentSessionConfig = {
      profile,
      working_directory: config?.working_directory,
      max_iterations: config?.max_iterations,
    };

    const session = new AgentSession(sessionConfig, this.mainWindow, this.apiService, this.screenCapture);

    this.activeAgents.set(session.id, session);

    this.emit('agent:created', {
      id: session.id,
      profile_id: profileId,
      profile_name: profile.name,
    });

    return session.id;
  }

  /**
   * Send a message to an agent with streaming
   */
  async *sendMessageStreaming(
    agentId: string,
    message: string,
    images?: string[]
  ): AsyncIterable<StreamEvent> {
    const agent = this.activeAgents.get(agentId);
    if (!agent) {
      yield {
        type: 'error',
        error: `Agent ${agentId} not found`,
      };
      return;
    }

    agent.status = 'thinking';
    this.emit('agent:status-change', {
      id: agentId,
      status: 'thinking',
    });

    try {
      // Stream all events from the agent
      for await (const event of agent.executeTurnStreaming(message, images)) {
        yield event;
      }

      agent.status = 'idle';
      this.emit('agent:status-change', {
        id: agentId,
        status: 'idle',
      });

      // Save session to database
      await this.saveSession(agentId);
    } catch (error: any) {
      agent.status = 'idle';
      this.emit('agent:status-change', {
        id: agentId,
        status: 'idle',
      });
      this.emit('agent:error', {
        id: agentId,
        error: error.message,
      });
      yield {
        type: 'error',
        error: error.message,
      };
    }
  }

  /**
   * Set auto-approve for an agent
   */
  setAutoApproveSafe(agentId: string, enabled: boolean): void {
    const agent = this.activeAgents.get(agentId);
    if (!agent) {
      throw new Error(`Agent ${agentId} not found`);
    }

    agent.setAutoApproveSafe(enabled);
  }

  /**
   * Terminate an agent session
   */
  async terminateAgent(agentId: string): Promise<void> {
    const agent = this.activeAgents.get(agentId);
    if (!agent) {
      return;
    }

    // Save final state
    await this.saveSession(agentId);

    this.activeAgents.delete(agentId);

    this.emit('agent:terminated', {
      id: agentId,
    });
  }

  /**
   * Get all active agents
   */
  getActiveAgents(): AgentInfo[] {
    return Array.from(this.activeAgents.values()).map(agent => {
      const context = agent.getSessionContext();
      return {
        id: agent.id,
        profile_id: agent.profile.id,
        profile_name: agent.profile.name,
        status: agent.status,
        created_at: agent.createdAt,
        turn_count: context.turn_count,
        total_tokens: context.total_tokens,
        total_cost: context.total_cost,
      };
    });
  }

  /**
   * Get agent info by ID
   */
  getAgent(agentId: string): AgentInfo | null {
    const agent = this.activeAgents.get(agentId);
    if (!agent) return null;

    const context = agent.getSessionContext();
    return {
      id: agent.id,
      profile_id: agent.profile.id,
      profile_name: agent.profile.name,
      status: agent.status,
      created_at: agent.createdAt,
      turn_count: context.turn_count,
      total_tokens: context.total_tokens,
      total_cost: context.total_cost,
    };
  }

  /**
   * Get conversation history for an agent
   */
  getConversationHistory(agentId: string) {
    const agent = this.activeAgents.get(agentId);
    if (!agent) {
      throw new Error(`Agent ${agentId} not found`);
    }

    return agent.getConversationHistory();
  }

  /**
   * Save agent session to database
   */
  private async saveSession(agentId: string): Promise<void> {
    const agent = this.activeAgents.get(agentId);
    if (!agent) return;

    const context = agent.getSessionContext();
    const history = agent.getConversationHistory();

    // Convert agent messages to domain message format
    // Filter out 'tool' messages as database only stores user/assistant
    const domainMessages = history
      .filter(msg => msg.role === 'user' || msg.role === 'assistant')
      .map((msg, index) => ({
        id: `${agentId}-msg-${index}`,
        role: msg.role as 'user' | 'assistant',
        content: msg.content || '', // Ensure content is never null/undefined
        timestamp: msg.timestamp || Date.now(),
      }));

    // Save conversation with agent metadata in title
    await this.database.saveConversation({
      id: agentId,
      title: `Agent Session (${agent.profile.name}) - ${context.turn_count} turns, $${context.total_cost.toFixed(4)}`,
      messages: domainMessages,
      createdAt: Date.now(),
      updatedAt: Date.now(),
    });
  }

  /**
   * Terminate all agents
   */
  async terminateAll(): Promise<void> {
    const agentIds = Array.from(this.activeAgents.keys());
    await Promise.all(agentIds.map(id => this.terminateAgent(id)));
  }
}
