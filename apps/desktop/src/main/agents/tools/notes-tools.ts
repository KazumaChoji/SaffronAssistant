import TurndownService from 'turndown';
import { marked } from 'marked';
import type { Tool } from '../types';
import type { DatabaseService } from '../../services/database.service';

function resolveNoteId(panel: string): string {
  return panel === 'right' ? 'right' : 'default';
}

export function createNoteTools(
  database: DatabaseService,
  notifyChanged: (noteId: string) => void
): Tool[] {
  const turndown = new TurndownService({ headingStyle: 'atx', codeBlockStyle: 'fenced' });

  function htmlToMarkdown(html: string): string {
    return turndown.turndown(html || '');
  }

  async function markdownToHtml(md: string): Promise<string> {
    return String(await marked.parse(md));
  }

  const readNote: Tool = {
    name: 'read_note',
    description:
      'Read the current contents of a notes panel as Markdown. Use panel "left" for the left panel or "right" for the right panel.',
    input_schema: {
      type: 'object',
      properties: {
        panel: {
          type: 'string',
          enum: ['left', 'right'],
          description: 'Which notes panel to read',
        },
      },
      required: ['panel'],
    },
    permission: { permission: 'always', risk_level: 'safe' },
    async execute(input: { panel: string }) {
      const noteId = resolveNoteId(input.panel);
      const html = database.getNotesContent(noteId);
      const markdown = htmlToMarkdown(html);
      return markdown || '(empty)';
    },
  };

  const writeNote: Tool = {
    name: 'write_note',
    description:
      'Replace the entire contents of a notes panel with new Markdown content. The previous content is automatically saved to version history so it can be undone. Use panel "left" or "right".',
    input_schema: {
      type: 'object',
      properties: {
        panel: {
          type: 'string',
          enum: ['left', 'right'],
          description: 'Which notes panel to write to',
        },
        content: {
          type: 'string',
          description: 'The new Markdown content for the note',
        },
      },
      required: ['panel', 'content'],
    },
    permission: { permission: 'ask', risk_level: 'moderate' },
    async execute(input: { panel: string; content: string }) {
      const noteId = resolveNoteId(input.panel);
      const current = database.getNotesContent(noteId);
      if (current) {
        database.pushNoteVersion(current, noteId);
      }
      const html = await markdownToHtml(input.content);
      database.saveNotesContent(html, noteId);
      notifyChanged(noteId);
      return `Note (${input.panel}) updated.`;
    },
  };

  const appendNote: Tool = {
    name: 'append_note',
    description:
      'Append Markdown content to the end of a notes panel without replacing existing content. Use panel "left" or "right".',
    input_schema: {
      type: 'object',
      properties: {
        panel: {
          type: 'string',
          enum: ['left', 'right'],
          description: 'Which notes panel to append to',
        },
        content: {
          type: 'string',
          description: 'The Markdown content to append',
        },
      },
      required: ['panel', 'content'],
    },
    permission: { permission: 'ask', risk_level: 'moderate' },
    async execute(input: { panel: string; content: string }) {
      const noteId = resolveNoteId(input.panel);
      const currentHtml = database.getNotesContent(noteId);
      if (currentHtml) {
        database.pushNoteVersion(currentHtml, noteId);
      }
      const appendHtml = await markdownToHtml(input.content);
      const newHtml = currentHtml ? currentHtml + appendHtml : appendHtml;
      database.saveNotesContent(newHtml, noteId);
      notifyChanged(noteId);
      return `Content appended to note (${input.panel}).`;
    },
  };

  return [readNote, writeNote, appendNote];
}
