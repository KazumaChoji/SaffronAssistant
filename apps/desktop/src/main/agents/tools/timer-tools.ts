import type { Tool } from '../types';
import type { ClockCommand, ClockStatus } from '@app/api';

function msToReadable(ms: number): string {
  const totalSeconds = Math.ceil(ms / 1000);
  const h = Math.floor(totalSeconds / 3600);
  const m = Math.floor((totalSeconds % 3600) / 60);
  const s = totalSeconds % 60;
  const parts: string[] = [];
  if (h > 0) parts.push(`${h}h`);
  if (m > 0) parts.push(`${m}m`);
  if (s > 0 || parts.length === 0) parts.push(`${s}s`);
  return parts.join(' ');
}

export function createClockTools(
  sendCommand: (cmd: ClockCommand) => void,
  getStatus: () => Promise<ClockStatus>
): Tool[] {
  const setTimer: Tool = {
    name: 'set_timer',
    description:
      'Start a new countdown timer with a specific duration. Replaces any currently running timer. When the timer finishes, the app flashes red and beeps.',
    input_schema: {
      type: 'object',
      properties: {
        hours:   { type: 'number', description: 'Hours component (default 0)' },
        minutes: { type: 'number', description: 'Minutes component (default 0)' },
        seconds: { type: 'number', description: 'Seconds component (default 0)' },
      },
    },
    permission: { permission: 'always', risk_level: 'safe' },
    async execute(input: { hours?: number; minutes?: number; seconds?: number }) {
      const h = Math.max(0, Math.floor(input.hours ?? 0));
      const m = Math.max(0, Math.floor(input.minutes ?? 0));
      const s = Math.max(0, Math.floor(input.seconds ?? 0));
      if (h === 0 && m === 0 && s === 0) return 'Error: duration must be greater than 0.';
      sendCommand({ target: 'timer', action: 'start', hours: h, minutes: m, seconds: s });
      return `Timer started: ${msToReadable((h * 3600 + m * 60 + s) * 1000)}.`;
    },
  };

  const pauseTimer: Tool = {
    name: 'pause_timer',
    description: 'Pause the currently running countdown timer.',
    input_schema: { type: 'object', properties: {} },
    permission: { permission: 'always', risk_level: 'safe' },
    async execute() {
      sendCommand({ target: 'timer', action: 'pause' });
      return 'Timer paused.';
    },
  };

  const resumeTimer: Tool = {
    name: 'resume_timer',
    description: 'Resume a paused countdown timer.',
    input_schema: { type: 'object', properties: {} },
    permission: { permission: 'always', risk_level: 'safe' },
    async execute() {
      sendCommand({ target: 'timer', action: 'resume' });
      return 'Timer resumed.';
    },
  };

  const resetTimer: Tool = {
    name: 'reset_timer',
    description: 'Cancel and reset the countdown timer.',
    input_schema: { type: 'object', properties: {} },
    permission: { permission: 'always', risk_level: 'safe' },
    async execute() {
      sendCommand({ target: 'timer', action: 'reset' });
      return 'Timer reset.';
    },
  };

  const startStopwatch: Tool = {
    name: 'start_stopwatch',
    description: 'Start the stopwatch (or resume if paused).',
    input_schema: { type: 'object', properties: {} },
    permission: { permission: 'always', risk_level: 'safe' },
    async execute() {
      sendCommand({ target: 'stopwatch', action: 'start' });
      return 'Stopwatch started.';
    },
  };

  const pauseStopwatch: Tool = {
    name: 'pause_stopwatch',
    description: 'Pause the running stopwatch.',
    input_schema: { type: 'object', properties: {} },
    permission: { permission: 'always', risk_level: 'safe' },
    async execute() {
      sendCommand({ target: 'stopwatch', action: 'pause' });
      return 'Stopwatch paused.';
    },
  };

  const resetStopwatch: Tool = {
    name: 'reset_stopwatch',
    description: 'Reset the stopwatch to zero and clear all laps.',
    input_schema: { type: 'object', properties: {} },
    permission: { permission: 'always', risk_level: 'safe' },
    async execute() {
      sendCommand({ target: 'stopwatch', action: 'reset' });
      return 'Stopwatch reset.';
    },
  };

  const lapStopwatch: Tool = {
    name: 'lap_stopwatch',
    description: 'Record a lap on the running stopwatch.',
    input_schema: { type: 'object', properties: {} },
    permission: { permission: 'always', risk_level: 'safe' },
    async execute() {
      sendCommand({ target: 'stopwatch', action: 'lap' });
      return 'Lap recorded.';
    },
  };

  const getClockStatus: Tool = {
    name: 'get_clock_status',
    description: 'Get the current state of both the countdown timer and the stopwatch.',
    input_schema: { type: 'object', properties: {} },
    permission: { permission: 'always', risk_level: 'safe' },
    async execute() {
      const status = await getStatus();
      const timerLine = `Timer: ${status.timer.state}${
        status.timer.remainingMs > 0 ? `, ${msToReadable(status.timer.remainingMs)} remaining` : ''
      }`;
      const swLine = `Stopwatch: ${status.stopwatch.state}, elapsed ${msToReadable(status.stopwatch.elapsedMs)}, ${status.stopwatch.lapCount} lap(s)`;
      return `${timerLine}\n${swLine}`;
    },
  };

  return [setTimer, pauseTimer, resumeTimer, resetTimer, startStopwatch, pauseStopwatch, resetStopwatch, lapStopwatch, getClockStatus];
}
