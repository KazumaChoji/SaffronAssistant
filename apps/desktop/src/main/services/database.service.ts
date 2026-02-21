import Database from 'better-sqlite3';
import { app } from 'electron';
import { join } from 'path';
import type { Conversation, Message } from '@app/domain';

/**
 * Database service for local storage
 * Uses SQLite via better-sqlite3
 */
export class DatabaseService {
  private db: Database.Database;

  constructor() {
    const dbPath = join(app.getPath('userData'), 'saffron.db');
    this.db = new Database(dbPath);
    this.initialize();
  }

  /**
   * Initializes the database schema
   */
  private initialize(): void {
    // Create conversations table
    this.db.exec(`
      CREATE TABLE IF NOT EXISTS conversations (
        id TEXT PRIMARY KEY,
        title TEXT NOT NULL,
        created_at INTEGER NOT NULL,
        updated_at INTEGER NOT NULL
      );
    `);

    // Create messages table
    this.db.exec(`
      CREATE TABLE IF NOT EXISTS messages (
        id TEXT PRIMARY KEY,
        conversation_id TEXT NOT NULL,
        role TEXT NOT NULL CHECK (role IN ('user', 'assistant')),
        content TEXT NOT NULL,
        image_base64 TEXT,
        timestamp INTEGER NOT NULL,
        FOREIGN KEY (conversation_id) REFERENCES conversations(id) ON DELETE CASCADE
      );
    `);

    // Create indexes
    this.db.exec(`
      CREATE INDEX IF NOT EXISTS idx_messages_conversation_id
      ON messages(conversation_id);
    `);

    this.db.exec(`
      CREATE INDEX IF NOT EXISTS idx_messages_timestamp
      ON messages(timestamp);
    `);

    // Create notes table (single row, stores markdown content)
    this.db.exec(`
      CREATE TABLE IF NOT EXISTS notes (
        id TEXT PRIMARY KEY DEFAULT 'default',
        content TEXT NOT NULL DEFAULT ''
      );
    `);

    // Seed default notes rows if missing
    this.db.exec(`
      INSERT OR IGNORE INTO notes (id, content) VALUES ('default', '');
      INSERT OR IGNORE INTO notes (id, content) VALUES ('right', '');
    `);

    // Create note images table
    this.db.exec(`
      CREATE TABLE IF NOT EXISTS note_images (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        data_url TEXT NOT NULL
      );
    `);

    // Create note versions table (undo history)
    this.db.exec(`
      CREATE TABLE IF NOT EXISTS note_versions (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        note_id TEXT NOT NULL DEFAULT 'default',
        content TEXT NOT NULL,
        created_at INTEGER NOT NULL
      );
    `);

    // Migration: add note_id column if missing (existing DBs)
    const cols = this.db.prepare("PRAGMA table_info(note_versions)").all() as Array<{ name: string }>;
    if (!cols.some((c) => c.name === 'note_id')) {
      this.db.exec("ALTER TABLE note_versions ADD COLUMN note_id TEXT NOT NULL DEFAULT 'default'");
    }

    // Create todos table
    this.db.exec(`
      CREATE TABLE IF NOT EXISTS todos (
        id INTEGER PRIMARY KEY,
        text TEXT NOT NULL,
        done INTEGER NOT NULL DEFAULT 0,
        created_at INTEGER NOT NULL
      );
    `);

    // Migration: add completed_at column
    try {
      this.db.exec(`ALTER TABLE todos ADD COLUMN completed_at INTEGER`);
    } catch {
      // Column already exists
    }

    // Backfill: any done todos missing completed_at get stamped now
    this.db.prepare('UPDATE todos SET completed_at = ? WHERE done = 1 AND completed_at IS NULL').run(Date.now());

    // Create tracker_days table
    this.db.exec(`
      CREATE TABLE IF NOT EXISTS tracker_days (
        date TEXT PRIMARY KEY
      );
    `);

    // Create tracker_config table
    this.db.exec(`
      CREATE TABLE IF NOT EXISTS tracker_config (
        key TEXT PRIMARY KEY,
        value TEXT NOT NULL
      );
    `);

    // Work sessions table (clock in / clock out)
    this.db.exec(`
      CREATE TABLE IF NOT EXISTS work_sessions (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        clock_in INTEGER NOT NULL,
        clock_out INTEGER
      );
    `);

    // Legacy secrets table (no longer used - API keys now read from .env)
    this.db.exec(`
      CREATE TABLE IF NOT EXISTS secrets (
        key TEXT PRIMARY KEY,
        value TEXT NOT NULL
      );
    `);

    console.log('Database initialized');
  }

  /**
   * Saves a conversation to the database
   * Creates or updates the conversation and its messages
   */
  saveConversation(conversation: Conversation): void {
    const tx = this.db.transaction(() => {
      // Upsert conversation
      this.db
        .prepare(
          `
        INSERT INTO conversations (id, title, created_at, updated_at)
        VALUES (?, ?, ?, ?)
        ON CONFLICT(id) DO UPDATE SET
          title = excluded.title,
          updated_at = excluded.updated_at
      `
        )
        .run(
          conversation.id,
          conversation.title,
          conversation.createdAt,
          conversation.updatedAt
        );

      // Delete existing messages (for simplicity, could be optimized)
      this.db
        .prepare('DELETE FROM messages WHERE conversation_id = ?')
        .run(conversation.id);

      // Insert all messages
      const insertMessage = this.db.prepare(`
        INSERT INTO messages (id, conversation_id, role, content, image_base64, timestamp)
        VALUES (?, ?, ?, ?, ?, ?)
      `);

      for (const message of conversation.messages) {
        insertMessage.run(
          message.id,
          conversation.id,
          message.role,
          message.content,
          message.imageBase64 || null,
          message.timestamp
        );
      }
    });

    tx();
  }

  /**
   * Retrieves all conversations, ordered by most recent first
   */
  getConversations(): Conversation[] {
    const conversations = this.db
      .prepare(
        `
      SELECT * FROM conversations
      ORDER BY updated_at DESC
    `
      )
      .all() as Array<{
      id: string;
      title: string;
      created_at: number;
      updated_at: number;
    }>;

    return conversations.map((conv) => {
      const messages = this.getMessagesForConversation(conv.id);

      return {
        id: conv.id,
        title: conv.title,
        messages,
        createdAt: conv.created_at,
        updatedAt: conv.updated_at,
      };
    });
  }

  /**
   * Retrieves a specific conversation by ID
   */
  getConversation(id: string): Conversation | null {
    const conv = this.db
      .prepare('SELECT * FROM conversations WHERE id = ?')
      .get(id) as
      | {
          id: string;
          title: string;
          created_at: number;
          updated_at: number;
        }
      | undefined;

    if (!conv) {
      return null;
    }

    const messages = this.getMessagesForConversation(conv.id);

    return {
      id: conv.id,
      title: conv.title,
      messages,
      createdAt: conv.created_at,
      updatedAt: conv.updated_at,
    };
  }

  /**
   * Retrieves messages for a conversation
   */
  private getMessagesForConversation(conversationId: string): Message[] {
    const messages = this.db
      .prepare(
        `
      SELECT * FROM messages
      WHERE conversation_id = ?
      ORDER BY timestamp ASC
    `
      )
      .all(conversationId) as Array<{
      id: string;
      conversation_id: string;
      role: string;
      content: string;
      image_base64: string | null;
      timestamp: number;
    }>;

    return messages.map((msg) => ({
      id: msg.id,
      role: msg.role as 'user' | 'assistant',
      content: msg.content,
      timestamp: msg.timestamp,
      imageBase64: msg.image_base64 || undefined,
    }));
  }

  /**
   * Deletes a conversation and all its messages
   */
  deleteConversation(id: string): void {
    this.db.prepare('DELETE FROM conversations WHERE id = ?').run(id);
    // Messages are deleted automatically via CASCADE
  }

  // ── Notes ──

  getNotesContent(noteId = 'default'): string {
    const row = this.db.prepare('SELECT content FROM notes WHERE id = ?').get(noteId) as { content: string } | undefined;
    return row?.content ?? '';
  }

  saveNotesContent(content: string, noteId = 'default'): void {
    this.db.prepare('UPDATE notes SET content = ? WHERE id = ?').run(content, noteId);
  }

  // ── Note Versions ──

  pushNoteVersion(content: string, noteId = 'default'): void {
    this.db.prepare('INSERT INTO note_versions (note_id, content, created_at) VALUES (?, ?, ?)').run(noteId, content, Date.now());
    // Keep only the latest 10 per note
    this.db.prepare(`
      DELETE FROM note_versions WHERE note_id = ? AND id NOT IN (
        SELECT id FROM note_versions WHERE note_id = ? ORDER BY id DESC LIMIT 10
      )
    `).run(noteId, noteId);
  }

  getNoteVersions(noteId = 'default'): Array<{ id: number; content: string; createdAt: number }> {
    const rows = this.db.prepare('SELECT * FROM note_versions WHERE note_id = ? ORDER BY id DESC').all(noteId) as Array<{
      id: number; content: string; created_at: number;
    }>;
    return rows.map((r) => ({ id: r.id, content: r.content, createdAt: r.created_at }));
  }

  // ── Note Images ──

  addNoteImage(dataUrl: string): number {
    const result = this.db.prepare('INSERT INTO note_images (data_url) VALUES (?)').run(dataUrl);
    return Number(result.lastInsertRowid);
  }

  getNoteImages(): Array<{ id: number; dataUrl: string }> {
    const rows = this.db.prepare('SELECT id, data_url FROM note_images').all() as Array<{ id: number; data_url: string }>;
    return rows.map((r) => ({ id: r.id, dataUrl: r.data_url }));
  }

  // ── Todos ──

  getTodos(): Array<{ id: number; text: string; done: boolean; createdAt: number; completedAt: number | null }> {
    // Purge todos completed more than 24 hours ago
    const cutoff = Date.now() - 24 * 60 * 60 * 1000;
    this.db.prepare('DELETE FROM todos WHERE done = 1 AND completed_at IS NOT NULL AND completed_at < ?').run(cutoff);

    const rows = this.db.prepare('SELECT * FROM todos ORDER BY created_at DESC').all() as Array<{
      id: number; text: string; done: number; created_at: number; completed_at: number | null;
    }>;
    return rows.map((r) => ({ id: r.id, text: r.text, done: r.done === 1, createdAt: r.created_at, completedAt: r.completed_at }));
  }

  addTodo(text: string): { id: number; text: string; done: boolean; createdAt: number; completedAt: number | null } {
    const now = Date.now();
    const result = this.db.prepare('INSERT INTO todos (text, done, created_at) VALUES (?, 0, ?)').run(text, now);
    return { id: Number(result.lastInsertRowid), text, done: false, createdAt: now, completedAt: null };
  }

  updateTodo(id: number, done: boolean): void {
    this.db.prepare('UPDATE todos SET done = ?, completed_at = ? WHERE id = ?').run(
      done ? 1 : 0,
      done ? Date.now() : null,
      id
    );
  }

  deleteTodo(id: number): void {
    this.db.prepare('DELETE FROM todos WHERE id = ?').run(id);
  }

  // ── Tracker ──

  getTrackerDays(): string[] {
    const rows = this.db.prepare('SELECT date FROM tracker_days ORDER BY date ASC').all() as Array<{ date: string }>;
    return rows.map((r) => r.date);
  }

  toggleTrackerDay(date: string): boolean {
    const existing = this.db.prepare('SELECT date FROM tracker_days WHERE date = ?').get(date);
    if (existing) {
      this.db.prepare('DELETE FROM tracker_days WHERE date = ?').run(date);
      return false;
    } else {
      this.db.prepare('INSERT INTO tracker_days (date) VALUES (?)').run(date);
      return true;
    }
  }

  getTrackerTitle(): string {
    const row = this.db.prepare("SELECT value FROM tracker_config WHERE key = 'title'").get() as { value: string } | undefined;
    return row?.value ?? '';
  }

  setTrackerTitle(title: string): void {
    this.db.prepare("INSERT OR REPLACE INTO tracker_config (key, value) VALUES ('title', ?)").run(title);
  }

  // ── Work Sessions ──

  clockIn(): { id: number; clockIn: number; clockOut: number | null } {
    const now = Date.now();
    const result = this.db.prepare('INSERT INTO work_sessions (clock_in) VALUES (?)').run(now);
    return { id: Number(result.lastInsertRowid), clockIn: now, clockOut: null };
  }

  clockOut(id: number): { id: number; clockIn: number; clockOut: number | null } | null {
    const now = Date.now();
    this.db.prepare('UPDATE work_sessions SET clock_out = ? WHERE id = ? AND clock_out IS NULL').run(now, id);
    const row = this.db.prepare('SELECT * FROM work_sessions WHERE id = ?').get(id) as { id: number; clock_in: number; clock_out: number | null } | undefined;
    if (!row) return null;
    return { id: row.id, clockIn: row.clock_in, clockOut: row.clock_out };
  }

  getWorkSessions(since?: number): Array<{ id: number; clockIn: number; clockOut: number | null }> {
    const cutoff = since ?? 0;
    const rows = this.db.prepare('SELECT * FROM work_sessions WHERE clock_in >= ? OR clock_out IS NULL ORDER BY clock_in DESC').all(cutoff) as Array<{ id: number; clock_in: number; clock_out: number | null }>;
    return rows.map((r) => ({ id: r.id, clockIn: r.clock_in, clockOut: r.clock_out }));
  }

  deleteWorkSession(id: number): void {
    this.db.prepare('DELETE FROM work_sessions WHERE id = ?').run(id);
  }

  /**
   * Resets the database — drops all tables and re-initializes
   */
  reset(): void {
    // Get all table names
    const tables = this.db
      .prepare("SELECT name FROM sqlite_master WHERE type='table' AND name NOT LIKE 'sqlite_%'")
      .all() as Array<{ name: string }>;

    // Drop all tables
    for (const { name } of tables) {
      this.db.exec(`DROP TABLE IF EXISTS "${name}"`);
    }

    // Re-create schema
    this.initialize();
    console.log('Database reset complete');
  }

  /**
   * Closes the database connection
   */
  close(): void {
    this.db.close();
  }
}
