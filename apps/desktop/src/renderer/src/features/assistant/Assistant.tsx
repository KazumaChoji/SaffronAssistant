import { useEffect, useRef, useState } from 'react';
import { useAssistant } from './useAssistant';
import type { MessageSegment } from './useAssistant';
import ReactMarkdown from 'react-markdown';
import { ToolApprovalDialog } from './ToolApprovalDialog';
import { EmptyState } from './EmptyState';
import logoUrl from '../../assets/logo.jpg';

const BUBBLE_BG = `rgba(22, 22, 22, var(--fg-opacity, 0.85))`;
const USER_BUBBLE_BG = `rgba(30, 30, 30, var(--fg-opacity, 0.85))`;

interface SegmentListProps {
  segments: MessageSegment[];
}

function ImageActions({ src }: { src: string }) {
  const [copied, setCopied] = useState(false);

  const handleCopy = () => {
    const image = new Image();
    image.onload = () => {
      const canvas = document.createElement('canvas');
      canvas.width = image.naturalWidth;
      canvas.height = image.naturalHeight;
      canvas.getContext('2d')!.drawImage(image, 0, 0);
      canvas.toBlob((blob) => {
        if (blob) {
          navigator.clipboard.write([new ClipboardItem({ 'image/png': blob })]);
          setCopied(true);
          setTimeout(() => setCopied(false), 1500);
        }
      }, 'image/png');
    };
    image.src = src;
  };

  return (
    <div className="absolute top-1.5 right-1.5 flex gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
      <button
        onClick={handleCopy}
        className="w-6 h-6 rounded-md bg-black/40 backdrop-blur-sm text-white/50 hover:text-white hover:bg-black/60 flex items-center justify-center transition-all"
        title="Copy image"
      >
        {copied ? (
          <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
            <polyline points="20 6 9 17 4 12" />
          </svg>
        ) : (
          <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <rect x="9" y="9" width="13" height="13" rx="2" ry="2" />
            <path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1" />
          </svg>
        )}
      </button>
      <button
        onClick={() => {
          const a = document.createElement('a');
          a.href = src;
          a.download = `image-${Date.now()}.png`;
          a.click();
        }}
        className="w-6 h-6 rounded-md bg-black/40 backdrop-blur-sm text-white/50 hover:text-white hover:bg-black/60 flex items-center justify-center transition-all"
        title="Download image"
      >
        <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
          <polyline points="7 10 12 15 17 10" />
          <line x1="12" y1="15" x2="12" y2="3" />
        </svg>
      </button>
    </div>
  );
}

function SegmentList({ segments }: SegmentListProps) {
  return (
    <>
      {segments.map((segment, i) =>
        segment.type === 'text' ? (
          <div key={i} className="rounded-lg p-3 backdrop-blur-xl text-white" style={{ background: BUBBLE_BG }}>
            <div className="prose prose-sm max-w-none prose-invert text-[13px]">
              <ReactMarkdown>{segment.content}</ReactMarkdown>
            </div>
          </div>
        ) : (
          <div key={i}>
            <div className="px-1 py-0.5">
              <span className="text-[11px] text-white/30">
                {segment.result ? '\u2713' : '\u22EF'} {segment.toolCall.name}
              </span>
              {segment.result?.success && segment.result.output && !segment.result.images?.length && (
                <span className="text-[11px] text-white/20 ml-2">
                  {segment.result.output.substring(0, 50)}{segment.result.output.length > 50 ? '...' : ''}
                </span>
              )}
              {segment.result && !segment.result.success && (
                <span className="text-[11px] text-red-300/50 ml-2">
                  Error: {segment.result.error}
                </span>
              )}
            </div>
            {segment.result?.success && segment.result.images && segment.result.images.length > 0 && (
              <div className="mt-1 flex flex-wrap gap-2">
                {segment.result.images.map((img, idx) => (
                  <div key={idx} className="relative group">
                    <img
                      src={img}
                      alt={segment.result?.output || 'Tool result image'}
                      className="max-w-[280px] max-h-[280px] w-auto h-auto rounded-lg border border-white/10 object-contain"
                    />
                    <ImageActions src={img} />
                  </div>
                ))}
              </div>
            )}
          </div>
        )
      )}
    </>
  );
}

interface AssistantProps {
  onOpenSettings?: () => void;
}

export function Assistant({ onOpenSettings }: AssistantProps) {
  const {
    currentAgentId,
    messages,
    streamingMessage,
    isLoading,
    error,
    autoApproveSafe,
    pendingScreenshots,
    sendMessage,
    stopGeneration,
    clearChat,
    setAutoApproveSafe,
    toggleThinking,
    addScreenshot,
    removeScreenshot,
  } = useAssistant();

  const [input, setInput] = useState('');
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  // Auto-scroll to bottom
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages, streamingMessage]);

  // Auto-focus
  useEffect(() => {
    textareaRef.current?.focus();

    const cleanup = window.api.system.onWindowShown(() => {
      textareaRef.current?.focus();
    });

    return cleanup;
  }, []);

  // Listen for global screenshot shortcut (Cmd+])
  useEffect(() => {
    const cleanup = window.api.system.onScreenshotCapture(() => {
      addScreenshot();
    });

    return cleanup;
  }, [addScreenshot]);

  // Cmd+Shift+R to reset chat
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (e.metaKey && e.shiftKey && e.key === 'r') {
        e.preventDefault();
        clearChat().then(() => textareaRef.current?.focus());
      }
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [clearChat]);

  // Re-focus after loading
  useEffect(() => {
    if (!isLoading) {
      textareaRef.current?.focus();
    }
  }, [isLoading]);

  const handleSubmit = async (e?: React.FormEvent) => {
    e?.preventDefault();

    if (!input.trim() || isLoading) return;

    await sendMessage(input);
    setInput('');
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) {
      e.preventDefault();
      handleSubmit();
    } else if (e.key === 'Escape' && isLoading) {
      e.preventDefault();
      stopGeneration();
    }
  };

  const handleClear = async () => {
    if (confirm('Clear chat? This will reset the conversation.')) {
      await clearChat();
      textareaRef.current?.focus();
    }
  };

  return (
    <>
      <div className="h-full flex flex-col relative">
        {/* Logo watermark — hidden when empty state is showing its own logo */}
        {(messages.length > 0 || streamingMessage) && (
          <div className="logo-watermark" aria-hidden="true">
            <img src={logoUrl} alt="" draggable={false} />
          </div>
        )}

        {/* Messages */}
        <div className="flex-1 overflow-y-auto px-4 py-3 space-y-3 auto-hide-scroll relative z-[1]">
          {messages.length === 0 && !streamingMessage ? (
            <EmptyState />
          ) : (<>
          {messages.map((message) => (
            <div
              key={message.id}
              className={`flex ${
                message.role === 'user' ? 'justify-end' : 'justify-start'
              }`}
            >
              {message.role === 'user' ? (
                <div
                  className="max-w-[80%] rounded-lg p-3 backdrop-blur-xl text-white/90"
                  style={{ background: USER_BUBBLE_BG }}
                >
                  {/* Screenshots for user messages */}
                  {message.screenshots && message.screenshots.length > 0 && (
                    <div className="mb-2 flex gap-2 pb-2">
                      {message.screenshots.map((screenshot, index) => (
                        <div key={index} className="flex-shrink-0">
                          <img
                            src={screenshot}
                            alt={`Screenshot ${index + 1}`}
                            className="h-[60px] w-[80px] object-cover rounded opacity-80"
                          />
                        </div>
                      ))}
                    </div>
                  )}
                  <div className="prose prose-sm max-w-none prose-invert text-[13px]">
                    <p className="m-0">{message.segments[0]?.content}</p>
                  </div>
                </div>
              ) : (
                <div className="flex flex-col gap-1.5 max-w-[85%]">
                  {message.thinking && (
                    <div className="rounded-lg p-3 backdrop-blur-xl" style={{ background: BUBBLE_BG }}>
                      <div className={`text-white/40 italic text-xs ${message.thinkingExpanded ? '' : 'line-clamp-2'}`}>
                        {message.thinking}
                      </div>
                      <button onClick={() => toggleThinking(message.id)} className="text-white/30 hover:text-white/50 text-[10px] mt-1 transition-colors">
                        {message.thinkingExpanded ? 'Show less' : 'Show more'}
                      </button>
                    </div>
                  )}

                  <SegmentList segments={message.segments} />
                </div>
              )}
            </div>
          ))}

          {/* Streaming message */}
          {streamingMessage && (
            <div className="flex justify-start">
              <div className="flex flex-col gap-1.5 max-w-[85%]">
                {streamingMessage.thinking && (
                  <div className="rounded-lg p-3 backdrop-blur-xl text-white" style={{ background: BUBBLE_BG }}>
                    <div className="text-white/40 italic text-xs line-clamp-2">
                      {streamingMessage.thinking}
                    </div>
                  </div>
                )}

                <SegmentList segments={streamingMessage.segments} />

                {streamingMessage.currentText ? (
                  <div className="rounded-lg p-3 backdrop-blur-xl text-white" style={{ background: BUBBLE_BG }}>
                    <div className="prose prose-sm max-w-none prose-invert text-[13px]">
                      <ReactMarkdown>{streamingMessage.currentText}</ReactMarkdown>
                    </div>
                  </div>
                ) : streamingMessage.segments.length === 0 && !streamingMessage.thinking ? (
                  <div className="rounded-lg p-3 backdrop-blur-xl text-white shimmer-loading min-h-[48px]" style={{ background: BUBBLE_BG }} />
                ) : null}
              </div>
            </div>
          )}

          {error && (
            <div className="text-red-400 text-sm px-2">
              {error}
            </div>
          )}

          <div ref={messagesEndRef} />
          </>)}
        </div>

        {/* Input Dock */}
        <div className="glass-dock px-4 pb-3 pt-2">
          {/* Screenshot Previews */}
          {pendingScreenshots.length > 0 && (
            <div className="mb-2 flex gap-2 overflow-x-auto pb-1 auto-hide-scroll">
              {pendingScreenshots.map((screenshot) => (
                <div
                  key={screenshot.id}
                  className="relative flex-shrink-0 group"
                  style={{ height: '52px', width: '68px' }}
                >
                  <img
                    src={screenshot.base64}
                    alt="Screenshot preview"
                    className="h-full w-full object-cover rounded border border-white/10 opacity-80"
                  />
                  <button
                    onClick={() => removeScreenshot(screenshot.id)}
                    className="absolute -top-1 -right-1 w-4 h-4 rounded-full bg-black/60 text-white/40 hover:text-white/90 hover:bg-black/80 flex items-center justify-center text-xs opacity-0 group-hover:opacity-100 transition-all"
                    title="Remove screenshot"
                  >
                    ×
                  </button>
                </div>
              ))}
            </div>
          )}

          {/* Toolbar */}
          <div className="flex items-center gap-1 mb-1.5">
            {onOpenSettings && (
              <button
                onClick={onOpenSettings}
                className="w-7 h-7 rounded-md text-white/25 hover:text-white/50 hover:bg-white/[0.04] flex items-center justify-center transition-all"
                title="Settings"
              >
                <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <circle cx="12" cy="12" r="3" />
                  <path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1 0 2.83 2 2 0 0 1-2.83 0l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-2 2 2 2 0 0 1-2-2v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83 0 2 2 0 0 1 0-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1-2-2 2 2 0 0 1 2-2h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 0-2.83 2 2 0 0 1 2.83 0l.06.06a1.65 1.65 0 0 0 1.82.33H9a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 2-2 2 2 0 0 1 2 2v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 0 2 2 0 0 1 0 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 2 2 2 2 0 0 1-2 2h-.09a1.65 1.65 0 0 0-1.51 1z" />
                </svg>
              </button>
            )}

            <label className="flex items-center gap-1 h-7 cursor-pointer px-1 rounded-md  transition-all" title="Auto Run">
              <div className="relative">
                <input
                  type="checkbox"
                  checked={autoApproveSafe}
                  onChange={(e) => setAutoApproveSafe(e.target.checked)}
                  className="sr-only peer"
                />
                <div className="w-5 h-3 bg-white/10 rounded-full peer-checked:bg-blue-500/80 transition-colors" />
                <div className="absolute top-[2px] left-[2px] w-2 h-2 bg-white rounded-full transition-transform peer-checked:translate-x-2" />
              </div>
              <span className="text-[10px] text-white/25 font-medium">Auto Run Safe Tools</span>
            </label>

            <div className="flex-1" />

            <button
              onClick={handleClear}
              disabled={messages.length === 0 && !currentAgentId}
              className="w-7 h-7 rounded-md text-white/25 hover:text-white/50 hover:bg-white/[0.04] flex items-center justify-center transition-all disabled:opacity-15 disabled:cursor-not-allowed"
              title="Clear chat"
            >
              <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <polyline points="3 6 5 6 21 6" />
                <path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2" />
              </svg>
            </button>
          </div>

          {/* Input Row */}
          <div className="glass-input flex items-end gap-2">
            <textarea
              ref={textareaRef}
              data-autofocus="assistant"
              value={input}
              onChange={(e) => {
                setInput(e.target.value);
                e.target.style.height = 'auto';
                e.target.style.height = Math.min(e.target.scrollHeight, 150) + 'px';
              }}
              onKeyDown={handleKeyDown}
              placeholder="Cmd + Enter to send your message"
              className="flex-1 bg-transparent text-white/90 placeholder:text-white/20 resize-none focus:outline-none text-[13px] leading-relaxed overflow-y-auto"
              rows={1}
              disabled={isLoading}
              style={{ height: 'auto' }}
            />
            {isLoading && (
              <button
                onClick={stopGeneration}
                className="flex-shrink-0 w-7 h-7 rounded-md text-white/40 hover:text-white/70 hover:bg-white/[0.06] flex items-center justify-center transition-all"
                title="Stop generation (Esc)"
              >
                <svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor">
                  <rect x="6" y="6" width="12" height="12" rx="2" />
                </svg>
              </button>
            )}
          </div>
        </div>
      </div>

      {/* Dialogs */}
      <ToolApprovalDialog />
    </>
  );
}
