import { evaluate } from 'mathjs';
import type { Tool } from '../types';

export const calculatorTool: Tool<{ expression: string }> = {
  name: 'calculator',
  description:
    'Evaluate a mathematical expression safely. Supports arithmetic, math functions (sqrt, sin, cos, log, etc.), and constants (pi, e). Use this for any calculation instead of doing mental math.',
  input_schema: {
    type: 'object',
    properties: {
      expression: {
        type: 'string',
        description:
          'A math expression to evaluate, e.g. "2^10", "sqrt(144)", "log(1000, 10)"',
      },
    },
    required: ['expression'],
  },
  permission: { permission: 'always', risk_level: 'safe' },

  async execute(input) {
    try {
      const result = evaluate(input.expression);
      return String(result);
    } catch (error) {
      return `Error: ${error instanceof Error ? error.message : 'Invalid expression'}`;
    }
  },
};
