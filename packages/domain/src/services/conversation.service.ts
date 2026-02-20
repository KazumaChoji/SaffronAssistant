import type { Conversation } from '../models/conversation.js';
import type { Message } from '../models/message.js';
import { generateConversationTitle } from '../models/conversation.js';

/**
 * Pure business logic for conversation management
 * No platform dependencies - fully testable
 */
export class ConversationService {
  /**
   * Adds a message to a conversation
   * Returns a new conversation object (immutable)
   */
  addMessage(conversation: Conversation, message: Message): Conversation {
    return {
      ...conversation,
      messages: [...conversation.messages, message],
      updatedAt: Date.now(),
    };
  }

  /**
   * Gets the last N messages from a conversation
   */
  getLastNMessages(conversation: Conversation, n: number): Message[] {
    return conversation.messages.slice(-n);
  }

  /**
   * Updates the conversation title
   * If title is not provided, generates one from the first user message
   */
  updateTitle(conversation: Conversation, title?: string): Conversation {
    if (title) {
      return {
        ...conversation,
        title,
        updatedAt: Date.now(),
      };
    }

    // Generate title from first user message
    const firstUserMessage = conversation.messages.find(
      (msg) => msg.role === 'user'
    );

    if (!firstUserMessage) {
      return conversation;
    }

    return {
      ...conversation,
      title: generateConversationTitle(firstUserMessage.content),
      updatedAt: Date.now(),
    };
  }

  /**
   * Checks if a conversation is empty
   */
  isEmpty(conversation: Conversation): boolean {
    return conversation.messages.length === 0;
  }

  /**
   * Gets the total number of tokens (rough estimate)
   * Estimates ~4 characters per token
   */
  estimateTokenCount(conversation: Conversation): number {
    const totalChars = conversation.messages.reduce(
      (sum, msg) => sum + msg.content.length,
      0
    );
    return Math.ceil(totalChars / 4);
  }

  /**
   * Truncates conversation history to fit within a token limit
   * Keeps the most recent messages
   */
  truncateToTokenLimit(
    conversation: Conversation,
    maxTokens: number
  ): Message[] {
    const messages = [...conversation.messages];
    const truncated: Message[] = [];
    let currentTokens = 0;

    // Work backwards from most recent
    for (let i = messages.length - 1; i >= 0; i--) {
      const msg = messages[i];
      const msgTokens = Math.ceil(msg.content.length / 4);

      if (currentTokens + msgTokens > maxTokens) {
        break;
      }

      truncated.unshift(msg);
      currentTokens += msgTokens;
    }

    return truncated;
  }
}

/**
 * Singleton instance for convenience
 */
export const conversationService = new ConversationService();
