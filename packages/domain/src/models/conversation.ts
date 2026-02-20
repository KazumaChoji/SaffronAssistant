import type { Message } from './message.js';

/**
 * Represents a conversation with multiple messages
 */
export interface Conversation {
  /** Unique identifier for the conversation */
  id: string;

  /** Human-readable title for the conversation */
  title: string;

  /** Array of messages in chronological order */
  messages: Message[];

  /** Unix timestamp (milliseconds) when the conversation was created */
  createdAt: number;

  /** Unix timestamp (milliseconds) when the conversation was last updated */
  updatedAt: number;
}

/**
 * Creates a new empty conversation
 */
export function createConversation(
  id: string,
  title: string,
  timestamp: number
): Conversation {
  return {
    id,
    title,
    messages: [],
    createdAt: timestamp,
    updatedAt: timestamp,
  };
}

/**
 * Generates a title from the first user message
 * Truncates to 50 characters and adds ellipsis if needed
 */
export function generateConversationTitle(firstMessage: string): string {
  const maxLength = 50;
  const cleaned = firstMessage.trim();

  if (cleaned.length <= maxLength) {
    return cleaned;
  }

  return cleaned.substring(0, maxLength).trim() + '...';
}
