import { useState, useEffect } from 'react';
import { Assistant } from '../features/assistant/Assistant';
import { Settings } from '../features/settings/Settings';
import { NotesEditor } from '../features/notes/NotesEditor';
import { TodoList } from '../features/todos/TodoList';
import { SearchBrowser } from '../features/search/SearchBrowser';
import { Tracker } from '../features/tracker/Tracker';

type View = 'assistant' | 'settings' | 'notes' | 'todos' | 'search' | 'tracker';

export default function App() {
  const [view, setView] = useState<View>('assistant');
  const [apiKeySet, setApiKeySet] = useState(false);

  useEffect(() => {
    checkApiKey();
  }, []);

  // Handle slide-in/out animations via CSS transforms
  useEffect(() => {
    const root = document.getElementById('root');
    if (!root) return;

    const cleanupIn = window.api.system.onAnimateIn((position, durationMs) => {
      // Set duration from AppConfig (single source of truth)
      root.style.setProperty('--slide-duration', `${durationMs}ms`);

      // Start offscreen (no transition so it's instant)
      root.style.transition = 'none';
      root.className = `slide-offscreen-${position}`;

      // Force reflow so the browser registers the offscreen position
      void root.offsetHeight;

      // Now enable transition and slide to visible
      root.style.transition = '';
      root.className = 'slide-visible';
    });

    const cleanupOut = window.api.system.onAnimateOut((position, durationMs) => {
      root.style.setProperty('--slide-duration', `${durationMs}ms`);
      root.style.transition = '';
      root.className = `slide-offscreen-${position}`;
    });

    return () => {
      cleanupIn();
      cleanupOut();
    };
  }, []);

  // Sync background opacity CSS variable
  useEffect(() => {
    window.api.system.getOpacity().then((val) => {
      document.documentElement.style.setProperty('--bg-opacity', String(val));
    });
    const cleanup = window.api.system.onOpacityChanged((val) => {
      document.documentElement.style.setProperty('--bg-opacity', String(val));
    });
    return cleanup;
  }, []);

  // Sync foreground opacity CSS variable
  useEffect(() => {
    window.api.system.getFgOpacity().then((val) => {
      document.documentElement.style.setProperty('--fg-opacity', String(val));
    });
    const cleanup = window.api.system.onFgOpacityChanged((val) => {
      document.documentElement.style.setProperty('--fg-opacity', String(val));
    });
    return cleanup;
  }, []);

  async function checkApiKey() {
    try {
      const has = await window.api.settings.hasApiKey('anthropic');
      setApiKeySet(has);
      if (!has) {
        setView('settings');
      }
    } catch (error) {
      console.error('Failed to check API key:', error);
    }
  }

  function handleApiKeySet() {
    setApiKeySet(true);
    setView('assistant');
  }

  function handleRefresh() {
    window.api.agent.terminateAll().finally(() => {
      window.location.reload();
    });
  }

  // Cmd+1/2/3 to switch tabs
  useEffect(() => {
    if (!apiKeySet) return;
    const handler = (e: KeyboardEvent) => {
      if (!e.metaKey) return;
      if (e.key === '1') { e.preventDefault(); setView('assistant'); }
      else if (e.key === '2') { e.preventDefault(); setView('notes'); }
      else if (e.key === '3') { e.preventDefault(); setView('todos'); }
      else if (e.key === '4') { e.preventDefault(); setView('search'); }
      else if (e.key === '5') { e.preventDefault(); setView('tracker'); }
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [apiKeySet]);

  // Autofocus the active tab's input when switching tabs
  useEffect(() => {
    if (!apiKeySet) return;
    // Small delay to let display:flex take effect before focusing
    const t = setTimeout(() => {
      const el = document.querySelector<HTMLElement>(`[data-autofocus="${view}"]`);
      el?.focus();
    }, 50);
    return () => clearTimeout(t);
  }, [view, apiKeySet]);

  const showTabs = apiKeySet && view !== 'settings';

  const showSettings = view === 'settings' || !apiKeySet;

  return (
    <div className="h-full w-full flex flex-col">
      {showTabs && (
        <div className="flex items-center justify-center py-1 flex-shrink-0 relative">
          {/* Refresh button - left side */}
          <button
            onClick={handleRefresh}
            className="absolute left-2 top-1/2 -translate-y-1/2 w-5 h-5 flex items-center justify-center rounded text-white/20 hover:text-white/50 transition-colors"
            title="Refresh window"
          >
            <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
              <path d="M21 2v6h-6" />
              <path d="M3 12a9 9 0 0 1 15-6.7L21 8" />
              <path d="M3 22v-6h6" />
              <path d="M21 12a9 9 0 0 1-15 6.7L3 16" />
            </svg>
          </button>

          <div className="flex gap-0.5 rounded-full p-0.5" style={{ background: 'rgba(255,255,255,0.06)' }}>
            {([['assistant', 'Chat', '1'], ['notes', 'Notes', '2'], ['todos', 'Todos', '3'], ['search', 'Search', '4'], ['tracker', 'Tracker', '5']] as const).map(([tab, label, num]) => (
              <button
                key={tab}
                onClick={() => setView(tab)}
                className="px-3 py-0.5 rounded-full text-[11px] font-medium transition-all duration-150 flex items-center gap-1.5"
                style={{
                  background: view === tab ? 'rgba(255,255,255,0.12)' : 'transparent',
                  color: view === tab ? 'rgba(255,255,255,0.9)' : 'rgba(255,255,255,0.4)',
                }}
              >
                {label}
                <kbd
                  className="inline-flex items-center gap-0.5 rounded text-[9px] leading-none font-normal"
                  style={{
                    padding: '1px 3px',
                    background: view === tab ? 'rgba(255,255,255,0.1)' : 'rgba(255,255,255,0.06)',
                    color: view === tab ? 'rgba(255,255,255,0.5)' : 'rgba(255,255,255,0.2)',
                  }}
                >
                  <span style={{ fontSize: '13px' }}>&#8984;</span>{num}
                </kbd>
              </button>
            ))}
          </div>
          {/* Notes undo/redo removed from header — each pane is independent */}
        </div>
      )}
      <div className="flex-1 min-h-0 relative">
        {showSettings && (
          <Settings
            onApiKeySet={handleApiKeySet}
            onBack={view === 'settings' && apiKeySet ? () => setView('assistant') : undefined}
          />
        )}
        {apiKeySet && (
          <>
            <div className="absolute inset-0 flex flex-col" style={{ display: view === 'assistant' ? 'flex' : 'none' }}>
              <Assistant onOpenSettings={() => setView('settings')} />
            </div>
            <div className="absolute inset-0 flex flex-row" style={{ display: view === 'notes' ? 'flex' : 'none' }}>
              <div className="flex-1 min-w-0 flex flex-col" style={{ borderRight: '0.5px solid rgba(255,255,255,0.08)' }}>
                <NotesEditor noteId="default" />
              </div>
              <div className="flex-1 min-w-0 flex flex-col">
                <NotesEditor noteId="right" />
              </div>
            </div>
            <div className="absolute inset-0 flex flex-col" style={{ display: view === 'todos' ? 'flex' : 'none' }}>
              <TodoList />
            </div>
            <div className="absolute inset-0 flex flex-col" style={{ display: view === 'search' ? 'flex' : 'none' }}>
              <SearchBrowser visible={view === 'search'} />
            </div>
            <div className="absolute inset-0 flex flex-col" style={{ display: view === 'tracker' ? 'flex' : 'none' }}>
              <Tracker />
            </div>
          </>
        )}
      </div>
    </div>
  );
}
