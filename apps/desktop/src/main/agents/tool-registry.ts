import type { Tool, ToolDefinition, ToolPermission, ToolOutput } from './types';

export class ToolRegistry {
  private tools = new Map<string, Tool<any>>();

  register(tool: Tool<any>): void {
    if (this.tools.has(tool.name)) {
      throw new Error(`Tool "${tool.name}" is already registered`);
    }
    this.tools.set(tool.name, tool);
  }

  get(name: string): Tool<any> | undefined {
    return this.tools.get(name);
  }

  has(name: string): boolean {
    return this.tools.has(name);
  }

  getDefinitions(filter?: (tool: Tool<any>) => boolean): ToolDefinition[] {
    const tools = filter
      ? Array.from(this.tools.values()).filter(filter)
      : Array.from(this.tools.values());

    return tools.map(({ name, description, input_schema }) => ({
      name,
      description,
      input_schema,
    }));
  }

  getPermission(name: string): ToolPermission {
    const tool = this.tools.get(name);
    if (!tool) {
      throw new Error(`Unknown tool: "${name}"`);
    }
    return tool.permission;
  }

  async execute(name: string, input: Record<string, any>): Promise<ToolOutput> {
    const tool = this.tools.get(name);
    if (!tool) {
      throw new Error(`Unknown tool: "${name}"`);
    }
    return tool.execute(input);
  }
}
