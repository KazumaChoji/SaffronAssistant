import { execFile } from 'child_process';
import type { Tool } from '../types';
import { AppConfig } from '../../config/app-config';

function exec(cmd: string, args: string[], timeout: number): Promise<string> {
  return new Promise((resolve, reject) => {
    execFile(cmd, args, { timeout, maxBuffer: AppConfig.tools.maxBufferBytes }, (error, stdout, stderr) => {
      if (error && !stdout && !stderr) {
        reject(error);
        return;
      }
      const output = [stdout, stderr].filter(Boolean).join('\n').trim();
      resolve(output || 'Done (no output)');
    });
  });
}

export const executeCodeTool: Tool<{ code: string; lang: 'applescript' | 'shell' }> = {
  name: 'execute_code',
  description:
    'Execute code on the user\'s Mac. Use "applescript" to control apps (Spotify, Finder, Safari, System Events, etc.) and "shell" for terminal commands (ls, open, brew, git, python, etc.).',
  input_schema: {
    type: 'object',
    properties: {
      code: {
        type: 'string',
        description: 'The code to execute',
      },
      lang: {
        type: 'string',
        enum: ['applescript', 'shell'],
        description: 'Language: "applescript" for app control, "shell" for terminal commands',
      },
    },
    required: ['code', 'lang'],
  },
  permission: { permission: 'ask', risk_level: 'dangerous' },

  async execute(input) {
    if (!input.code || input.code.length > AppConfig.tools.maxCodeLength) {
      return `Error: Code must be non-empty and under ${AppConfig.tools.maxCodeLength} characters`;
    }

    const timeout = AppConfig.tools.commandTimeoutMs;

    try {
      if (input.lang === 'applescript') {
        return await exec('osascript', ['-e', input.code], timeout);
      } else {
        return await exec('/bin/zsh', ['-c', input.code], timeout);
      }
    } catch (error) {
      const msg = error instanceof Error ? error.message : String(error);
      return `Error: ${msg}`;
    }
  },
};
