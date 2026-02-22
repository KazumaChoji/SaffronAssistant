/**
 * AgentSession - Core agent execution system
 * Turn-based agentic loop: user input -> LLM -> tool execution -> repeat
 */

import Anthropic from '@anthropic-ai/sdk';
import type {
  AgentProfile,
  AgentSessionConfig,
  Message,
  UserMessage,
  AssistantMessage,
  ToolMessage,
  ToolCall,
  ToolResult,
  SessionContext,
  StreamEvent,
} from './types';
import { createToolRegistry } from './tools/index';
import type { ToolRegistry } from './tool-registry';
import { PermissionManager } from './permission-manager';
import { ToolExecutor } from './tool-executor';
import { ClaudeAPIService } from '../services/claude-api.service';
import { ipcMain, type BrowserWindow } from 'electron';
import type { ScreenCaptureService } from '../services/screen-capture.service';
import type { DatabaseService } from '../services/database.service';
import type { ClockStatus } from '@app/api';
import { AppConfig } from '../config/app-config';

export type AgentStatus = 'idle' | 'thinking' | 'executing_tools' | 'waiting_approval';

export class AgentSession {
  public readonly id: string;
  public readonly profile: AgentProfile;
  public readonly createdAt: number = Date.now();
  public status: AgentStatus = 'idle';

  private conversationHistory: Message[] = [];
  private turnCount: number = 0;
  private totalTokens: number = 0;
  private totalCost: number = 0;
  private maxIterations: number;
  private workingDirectory: string;
  private permissionManager: PermissionManager;
  private toolExecutor: ToolExecutor;
  private registry: ToolRegistry;
  private apiService: ClaudeAPIService;
  private abortController: AbortController | null = null;

  constructor(
    config: AgentSessionConfig,
    mainWindow: BrowserWindow,
    apiService: ClaudeAPIService,
    screenCapture?: ScreenCaptureService,
    database?: DatabaseService,
  ) {
    this.id = this.generateId();
    this.profile = config.profile;
    this.maxIterations = config.max_iterations || config.profile.max_iterations;
    this.workingDirectory = config.working_directory || process.cwd();

    const getClockStatus = (): Promise<ClockStatus> =>
      new Promise((resolve) => {
        const requestId = `clk-${Date.now()}-${Math.random().toString(36).slice(2)}`;
        const fallback: ClockStatus = {
          timer: { state: 'stopped', remainingMs: 0 },
          stopwatch: { state: 'stopped', elapsedMs: 0, lapCount: 0 },
        };
        const timeout = setTimeout(() => {
          ipcMain.removeListener('clock:statusResponse', handler);
          resolve(fallback);
        }, 2000);
        const handler = (_event: any, id: string, status: ClockStatus) => {
          if (id !== requestId) return;
          clearTimeout(timeout);
          ipcMain.removeListener('clock:statusResponse', handler);
          resolve(status);
        };
        ipcMain.on('clock:statusResponse', handler);
        mainWindow.webContents.send('clock:statusRequest', requestId);
      });

    this.registry = createToolRegistry({
      screenCapture,
      database,
      notifyNoteChanged: database
        ? (noteId) => mainWindow.webContents.send('notes:content-changed', noteId)
        : undefined,
      notifyTodosChanged: database
        ? () => mainWindow.webContents.send('todos:changed')
        : undefined,
      sendClockCommand: (cmd) => mainWindow.webContents.send('clock:command', cmd),
      getClockStatus,
    });
    this.permissionManager = new PermissionManager(this.profile, mainWindow, this.registry);
    this.toolExecutor = new ToolExecutor(this.registry);
    this.apiService = apiService;
  }

  /**
   * Execute a conversation turn with streaming
   * Follows Mistral CLI's turn-based execution pattern:
   * 1. Accept user input
   * 2. Loop: Send to LLM → Execute tools → Send results back
   * 3. Stop when no more tool calls or max iterations reached
   *
   * Yields StreamEvent objects for real-time UI updates
   */
  async *executeTurnStreaming(
    userInput: string,
    images?: string[]
  ): AsyncIterable<StreamEvent> {
    // 1. Create user message
    const userMessage: UserMessage = {
      role: 'user',
      content: userInput,
      images: images,
      timestamp: Date.now(),
    };

    this.conversationHistory.push(userMessage);

    this.turnCount++;

    // Create abort controller for this turn
    this.abortController = new AbortController();
    const signal = this.abortController.signal;

    // 2. Execute the agentic loop with streaming
    let hasToolCalls = true;
    let iterations = 0;
    let totalInputTokens = 0;
    let totalOutputTokens = 0;

    while (hasToolCalls && iterations < this.maxIterations) {
      // Check abort before each iteration
      if (signal.aborted) return;

      // 3. Build model request
      const request = this.buildModelRequest();

      // 4. Stream Claude API response
      const toolCalls: ToolCall[] = [];
      let turnText = '';

      for await (const event of this.apiService.streamWithTools(
        request.messages,
        request.tools,
        request.model,
        this.profile.system_instructions,
        signal
      )) {
        if (signal.aborted) return;
        if (event.type === 'text') {
          turnText += event.content;
          yield event;
        } else if (event.type === 'thinking') {
          yield event;
        } else if (event.type === 'tool_call') {
          console.log('[agent] Tool call received:', event.tool_call.name, event.tool_call.id);
          toolCalls.push(event.tool_call);
          yield event;
        } else if (event.type === 'usage') {
          totalInputTokens += event.usage.input_tokens;
          totalOutputTokens += event.usage.output_tokens;
        } else if (event.type === 'error') {
          console.error('[agent] Stream error:', event.error);
          yield event;
        }
      }
      console.log('[agent] Stream complete. Tool calls:', toolCalls.length);

      // Update total cost
      this.totalTokens += totalInputTokens + totalOutputTokens;
      this.totalCost += this.calculateCost({
        input_tokens: totalInputTokens,
        output_tokens: totalOutputTokens,
      });

      // 5. Check for tool calls
      if (toolCalls.length > 0) {
        hasToolCalls = true;
        console.log('[agent] Processing', toolCalls.length, 'tool call(s):', toolCalls.map(t => t.name));

        // Store assistant message with tool calls
        const assistantMessage: AssistantMessage = {
          role: 'assistant',
          content: turnText,
          tool_calls: toolCalls,
          timestamp: Date.now(),
        };
        this.conversationHistory.push(assistantMessage);

        // Check abort before tool execution
        if (signal.aborted) return;

        // 6. Check permissions for all tool calls (sequential, may prompt user)
        const approvedCalls: ToolCall[] = [];
        const deniedResults: { toolCall: ToolCall; result: ToolResult }[] = [];

        for (const toolCall of toolCalls) {
          if (signal.aborted) return;
          console.log('[agent] Checking permission for:', toolCall.name);
          const permission = await this.permissionManager.checkPermission(toolCall);
          console.log('[agent] Permission result:', toolCall.name, '→', permission);

          if (permission === 'denied') {
            deniedResults.push({
              toolCall,
              result: {
                tool_call_id: toolCall.id,
                success: false,
                error: 'Permission denied by user',
              },
            });
          } else {
            approvedCalls.push(toolCall);
          }
        }

        // Execute approved tool calls in parallel
        console.log('[agent] Executing', approvedCalls.length, 'approved tool(s)');
        const executedResults = approvedCalls.length > 0
          ? await this.toolExecutor.executeParallel(approvedCalls)
          : [];
        console.log('[agent] Execution complete. Results:', executedResults.map(r => ({ id: r.tool_call_id, success: r.success, error: r.error })));

        // Build ordered results map
        const resultMap = new Map<string, ToolResult>();
        for (const { toolCall, result } of deniedResults) {
          resultMap.set(toolCall.id, result);
        }
        for (const result of executedResults) {
          resultMap.set(result.tool_call_id, result);
        }

        // Emit results in original order
        const toolResults: ToolResult[] = [];
        for (const toolCall of toolCalls) {
          const result = resultMap.get(toolCall.id)!;
          toolResults.push(result);
          yield {
            type: 'tool_result',
            tool_call_id: toolCall.id,
            tool_name: toolCall.name,
            result,
          };
        }

        // 7. Store tool results
        const toolMessage: ToolMessage = {
          role: 'tool',
          tool_results: toolResults,
          timestamp: Date.now(),
        };
        this.conversationHistory.push(toolMessage);

        iterations++;
      } else {
        // No more tool calls - we have the final response
        hasToolCalls = false;

        const assistantMessage: AssistantMessage = {
          role: 'assistant',
          content: turnText,
          timestamp: Date.now(),
        };
        this.conversationHistory.push(assistantMessage);

        // Return final summary via a usage event (reusing the type)
        yield {
          type: 'usage',
          usage: {
            input_tokens: totalInputTokens,
            output_tokens: totalOutputTokens,
          },
        };

        this.abortController = null;
        return;
      }
    }

    this.abortController = null;

    // Max iterations reached
    yield {
      type: 'error',
      error: `Max iterations (${this.maxIterations}) reached without completion`,
    };
  }

  /**
   * Parse a base64 data URI into its media type and raw data
   */
  private parseBase64Image(dataUri: string): {
    mediaType: 'image/jpeg' | 'image/png' | 'image/gif' | 'image/webp';
    data: string;
  } {
    const mediaTypeMatch = dataUri.match(/^data:image\/(\w+);base64,/);
    const mediaType = mediaTypeMatch
      ? `image/${mediaTypeMatch[1]}`
      : 'image/png';
    const data = dataUri.replace(/^data:image\/\w+;base64,/, '');
    return {
      mediaType: mediaType as 'image/jpeg' | 'image/png' | 'image/gif' | 'image/webp',
      data,
    };
  }

  /**
   * Build the request to send to Claude
   */
  private buildModelRequest(): {
    model: string;
    messages: Anthropic.MessageParam[];
    tools: Anthropic.Tool[];
    max_tokens: number;
    temperature: number;
  } {
    // Convert our message format to Anthropic's format
    const messages: Anthropic.MessageParam[] = [];

    for (const msg of this.conversationHistory) {
      if (msg.role === 'user') {
        const content: Anthropic.MessageParam['content'] = [];

        // Add text
        content.push({
          type: 'text',
          text: msg.content,
        });

        // Add images
        for (const imageDataUri of msg.images || []) {
          const { mediaType, data } = this.parseBase64Image(imageDataUri);
          content.push({
            type: 'image',
            source: { type: 'base64', media_type: mediaType, data },
          });
        }

        messages.push({
          role: 'user',
          content,
        });
      } else if (msg.role === 'assistant') {
        // Build assistant message content
        const assistantContent: Anthropic.ContentBlock[] = [];

        // Add text if present
        if (msg.content) {
          assistantContent.push({
            type: 'text',
            text: msg.content,
          });
        }

        // Add tool calls if present
        if (msg.tool_calls) {
          for (const toolCall of msg.tool_calls) {
            assistantContent.push({
              type: 'tool_use',
              id: toolCall.id,
              name: toolCall.name,
              input: toolCall.input,
            });
          }
        }

        messages.push({
          role: 'assistant',
          content: assistantContent,
        });
      } else if (msg.role === 'tool') {
        // Tool results must be sent as user message with tool_result blocks
        const toolResultContent: Anthropic.ToolResultBlockParam[] = msg.tool_results.map(
          (result) => {
            // If the result has images, send them as content blocks so Claude can see them
            if (result.success && result.images && result.images.length > 0) {
              const contentBlocks: Array<Anthropic.TextBlockParam | Anthropic.ImageBlockParam> = [];
              if (result.output) {
                contentBlocks.push({ type: 'text', text: result.output });
              }
              for (const imageDataUri of result.images) {
                const { mediaType, data } = this.parseBase64Image(imageDataUri);
                contentBlocks.push({
                  type: 'image',
                  source: { type: 'base64', media_type: mediaType, data },
                });
              }
              return {
                type: 'tool_result' as const,
                tool_use_id: result.tool_call_id,
                content: contentBlocks,
                is_error: false,
              };
            }
            return {
              type: 'tool_result' as const,
              tool_use_id: result.tool_call_id,
              content: result.success
                ? result.output || 'Success'
                : `Error: ${result.error}`,
              is_error: !result.success,
            };
          }
        );

        messages.push({
          role: 'user',
          content: toolResultContent,
        });
      }
    }

    return {
      model: this.profile.model,
      messages,
      tools: this.getEnabledTools(),
      max_tokens: AppConfig.ai.maxTokens,
      temperature: AppConfig.ai.temperature,
    };
  }

  /**
   * Get enabled tools for this agent's profile.
   * Custom tools come from the registry; Anthropic built-in tools are appended directly.
   */
  private getEnabledTools(): any[] {
    const custom = this.registry.getDefinitions(
      (tool) => this.profile.tool_permissions[tool.name] !== 'never'
    );
    return [
      ...custom,
      // Anthropic's built-in web search — executed server-side, no local handler needed
      { type: 'web_search_20250305', name: 'web_search' },
    ];
  }

  /**
   * Calculate cost based on token usage
   * Pricing: https://www.anthropic.com/pricing
   */
  private calculateCost(usage: { input_tokens: number; output_tokens: number }): number {
    const inputCost = (usage.input_tokens / 1_000_000) * AppConfig.ai.pricing.inputPer1M;
    const outputCost = (usage.output_tokens / 1_000_000) * AppConfig.ai.pricing.outputPer1M;

    return inputCost + outputCost;
  }

  /**
   * Generate unique session ID
   */
  private generateId(): string {
    return `session_${Date.now()}_${Math.random().toString(36).substring(2, 9)}`;
  }

  // ===== Public getters =====

  public getConversationHistory(): Message[] {
    return [...this.conversationHistory];
  }

  public getSessionContext(): SessionContext {
    return {
      working_directory: this.workingDirectory,
      session_id: this.id,
      turn_count: this.turnCount,
      total_tokens: this.totalTokens,
      total_cost: this.totalCost,
    };
  }

  public getTotalCost(): number {
    return this.totalCost;
  }

  public getTotalTokens(): number {
    return this.totalTokens;
  }

  public setAutoApproveSafe(enabled: boolean): void {
    this.permissionManager.setAutoApproveSafe(enabled);
  }

  /**
   * Abort the current turn — cancels the API stream and rejects pending approvals
   */
  public abort(): void {
    if (this.abortController) {
      this.abortController.abort();
      this.abortController = null;
    }
    this.permissionManager.abortAll();
    this.status = 'idle';
  }
}
