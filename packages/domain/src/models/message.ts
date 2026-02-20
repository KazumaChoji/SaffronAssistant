/**
 * Represents a single message in a conversation
 */
export interface Message {
  /** Unique identifier for the message */
  id: string;

  /** Role of the message sender */
  role: 'user' | 'assistant';

  /** Text content of the message */
  content: string;

  /** Unix timestamp (milliseconds) when the message was created */
  timestamp: number;

  /** Optional base64-encoded JPEG image attached to the message (user messages only) */
  imageBase64?: string;
}
