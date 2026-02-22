import type { Tool } from '../types';
import type { DatabaseService } from '../../services/database.service';

function formatTodos(todos: Array<{ id: number; text: string; done: boolean }>): string {
  if (todos.length === 0) return '(no todos)';
  const active = todos.filter((t) => !t.done);
  const done = todos.filter((t) => t.done);
  const lines: string[] = [];
  if (active.length > 0) {
    lines.push('Active:');
    for (const t of active) lines.push(`  [${t.id}] ${t.text}`);
  }
  if (done.length > 0) {
    lines.push('Completed:');
    for (const t of done) lines.push(`  [${t.id}] ~~${t.text}~~`);
  }
  return lines.join('\n');
}

export function createTodoTools(
  database: DatabaseService,
  notifyChanged: () => void
): Tool[] {
  const listTodos: Tool = {
    name: 'list_todos',
    description: 'List all current todo items with their IDs, text, and completion status. Call this first to get IDs before using complete_todo or delete_todo.',
    input_schema: { type: 'object', properties: {} },
    permission: { permission: 'always', risk_level: 'safe' },
    async execute() {
      const todos = database.getTodos();
      return formatTodos(todos);
    },
  };

  const addTodo: Tool = {
    name: 'add_todo',
    description: 'Add a new todo item.',
    input_schema: {
      type: 'object',
      properties: {
        text: { type: 'string', description: 'The text of the todo item (max 1000 characters)' },
      },
      required: ['text'],
    },
    permission: { permission: 'ask', risk_level: 'moderate' },
    async execute(input: { text: string }) {
      if (!input.text || input.text.length > 1000) {
        return 'Error: text must be a non-empty string of at most 1000 characters.';
      }
      const todo = database.addTodo(input.text);
      notifyChanged();
      return `Added todo [${todo.id}]: "${todo.text}"`;
    },
  };

  const completeTodo: Tool = {
    name: 'complete_todo',
    description: 'Mark a todo as done or undone by its ID. Call list_todos first to get IDs.',
    input_schema: {
      type: 'object',
      properties: {
        id: { type: 'number', description: 'The ID of the todo item' },
        done: { type: 'boolean', description: 'true to mark done, false to mark undone' },
      },
      required: ['id', 'done'],
    },
    permission: { permission: 'ask', risk_level: 'moderate' },
    async execute(input: { id: number; done: boolean }) {
      database.updateTodo(input.id, input.done);
      notifyChanged();
      return `Todo [${input.id}] marked as ${input.done ? 'done' : 'undone'}.`;
    },
  };

  const deleteTodo: Tool = {
    name: 'delete_todo',
    description: 'Delete a todo item by its ID. Call list_todos first to get IDs.',
    input_schema: {
      type: 'object',
      properties: {
        id: { type: 'number', description: 'The ID of the todo item to delete' },
      },
      required: ['id'],
    },
    permission: { permission: 'ask', risk_level: 'moderate' },
    async execute(input: { id: number }) {
      database.deleteTodo(input.id);
      notifyChanged();
      return `Todo [${input.id}] deleted.`;
    },
  };

  return [listTodos, addTodo, completeTodo, deleteTodo];
}
