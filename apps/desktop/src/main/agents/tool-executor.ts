/**
 * Tool Executor - Execute tool calls via ToolRegistry
 */

import type { ToolCall, ToolResult } from './types';
import type { ToolRegistry } from './tool-registry';

export class ToolExecutor {
  constructor(private registry: ToolRegistry) {}

  async executeToolCall(toolCall: ToolCall): Promise<ToolResult> {
    try {
      const output = await this.registry.execute(toolCall.name, toolCall.input);
      if (typeof output === 'string') {
        return { tool_call_id: toolCall.id, success: true, output };
      }
      return {
        tool_call_id: toolCall.id,
        success: true,
        output: output.text,
        images: output.images,
      };
    } catch (error: any) {
      return { tool_call_id: toolCall.id, success: false, error: error.message || 'Unknown error' };
    }
  }

  async executeParallel(toolCalls: ToolCall[]): Promise<ToolResult[]> {
    const settled = await Promise.allSettled(
      toolCalls.map(tc => this.executeToolCall(tc))
    );
    return settled.map((result, index) =>
      result.status === 'fulfilled'
        ? result.value
        : { tool_call_id: toolCalls[index].id, success: false, error: 'Execution failed' }
    );
  }
}
