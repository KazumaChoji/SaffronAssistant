import Anthropic from '@anthropic-ai/sdk';
import type { StreamEvent } from '../agents/types';
import { AppConfig } from '../config/app-config';

/**
 * Claude API service
 * Handles communication with Anthropic's Claude API
 */
export class ClaudeAPIService {
  private client: Anthropic | null = null;

  /**
   * Initializes the Claude API client with an API key
   */
  initialize(apiKey: string): void {
    this.client = new Anthropic({
      apiKey,
    });
  }

  /**
   * Checks if the service is initialized
   */
  isInitialized(): boolean {
    return this.client !== null;
  }

  /**
   * Streams a message with tool support
   * Yields structured StreamEvent objects for text, thinking, tool calls, etc.
   */
  async *streamWithTools(
    messages: Anthropic.MessageParam[],
    tools: Anthropic.Tool[],
    model: string,
    systemInstructions?: string,
    signal?: AbortSignal
  ): AsyncIterable<StreamEvent> {
    if (!this.client) {
      throw new Error('Claude API client not initialized. Please set an API key.');
    }

    // Track content blocks as they're being built
    interface ContentBlockState {
      index: number;
      type: 'text' | 'tool_use' | 'thinking';
      id?: string;
      name?: string;
      accumulatedInput?: string;
      accumulatedText?: string;
      accumulatedThinking?: string;
    }

    const contentBlocks: Map<number, ContentBlockState> = new Map();

    try {
      console.log('[api] Sending to model:', model, '| tools:', tools.map(t => t.name));

      // Check if already aborted before starting
      if (signal?.aborted) {
        return;
      }

      // Stream response
      const stream = this.client.messages.stream({
        model,
        max_tokens: AppConfig.ai.maxTokens,
        messages,
        tools: tools.length > 0 ? tools : undefined,
        system: systemInstructions,
      }, { signal });

      for await (const event of stream) {
        if (event.type === 'content_block_start') {
          const block: ContentBlockState = {
            index: event.index,
            type: event.content_block.type as 'text' | 'tool_use' | 'thinking',
          };

          if (event.content_block.type === 'tool_use') {
            block.id = event.content_block.id;
            block.name = event.content_block.name;
            block.accumulatedInput = '';
          } else if (event.content_block.type === 'text') {
            block.accumulatedText = '';
          }

          contentBlocks.set(event.index, block);
        } else if (event.type === 'content_block_delta') {
          const block = contentBlocks.get(event.index);
          if (!block) continue;

          if (event.delta.type === 'text_delta') {
            // Stream text immediately
            block.accumulatedText = (block.accumulatedText || '') + event.delta.text;
            yield {
              type: 'text',
              content: event.delta.text,
            };
          } else if (event.delta.type === 'input_json_delta') {
            // Accumulate tool input (partial JSON)
            block.accumulatedInput = (block.accumulatedInput || '') + event.delta.partial_json;
          }
        } else if (event.type === 'content_block_stop') {
          const block = contentBlocks.get(event.index);
          if (!block) continue;

          if (block.type === 'tool_use' && block.id && block.name) {
            // Parse complete tool call (accumulatedInput may be empty for no-param tools)
            try {
              const input = block.accumulatedInput ? JSON.parse(block.accumulatedInput) : {};
              // Emit tool call event
              yield {
                type: 'tool_call',
                tool_call: { id: block.id, name: block.name, input },
              };
            } catch (parseError) {
              console.error('Failed to parse tool input JSON:', parseError);
              yield {
                type: 'error',
                error: `Failed to parse tool input for ${block.name}`,
              };
            }
          }
        } else if (event.type === 'message_stop') {
          // Message complete - emit usage stats
          const finalMessage = await stream.finalMessage();
          yield {
            type: 'usage',
            usage: {
              input_tokens: finalMessage.usage.input_tokens,
              output_tokens: finalMessage.usage.output_tokens,
            },
          };
        }
      }
    } catch (error: any) {
      // Don't emit error for intentional aborts
      if (signal?.aborted) {
        return;
      }
      yield {
        type: 'error',
        error: error.message || 'Streaming failed',
      };
    }
  }
}
