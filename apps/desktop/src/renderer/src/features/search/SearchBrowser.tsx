import { useState, useRef, useEffect, useCallback } from 'react';

const USERAGENT = 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36';
const HOME_URL = 'https://duckduckgo.com';

/** Lazy-mount wrapper: doesn't render the webview until the tab is first opened */
export function SearchBrowser({ visible }: { visible: boolean }) {
  const [mounted, setMounted] = useState(false);
  if (visible && !mounted) setMounted(true);
  if (!mounted) return null;
  return <SearchBrowserInner />;
}

function SearchBrowserInner() {
  const webviewRef = useRef<Electron.WebviewTag | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const [inputValue, setInputValue] = useState('');
  const [canGoBack, setCanGoBack] = useState(false);
  const [canGoForward, setCanGoForward] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  // Bump to force remount of the webview after a crash
  const [webviewKey, setWebviewKey] = useState(0);

  const navigate = useCallback((input: string) => {
    const wv = webviewRef.current;
    if (!wv) return;

    let target: string;
    if (/^https?:\/\//i.test(input) || /^[a-z0-9-]+\.[a-z]{2,}/i.test(input)) {
      target = input.startsWith('http') ? input : `https://${input}`;
    } else {
      target = `https://duckduckgo.com/?q=${encodeURIComponent(input)}`;
    }

    try { wv.loadURL(target); } catch { /* frame disposed */ }
  }, []);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (inputValue.trim()) {
      navigate(inputValue.trim());
      inputRef.current?.blur();
    }
  };

  useEffect(() => {
    const wv = webviewRef.current;
    if (!wv) return;

    let loaded = false;
    const onDomReady = () => {
      if (loaded) return;
      loaded = true;
      try { wv.loadURL(HOME_URL); } catch { /* ignore */ }
    };
    const onNavStart = () => setIsLoading(true);
    const onNavDone = () => {
      setIsLoading(false);
      try {
        setCanGoBack(wv.canGoBack());
        setCanGoForward(wv.canGoForward());
        const currentUrl = wv.getURL();
        const u = new URL(currentUrl);
        const q = u.searchParams.get('q');
        if (q && (u.hostname.includes('duckduckgo') || u.hostname.includes('google'))) {
          setInputValue(q);
        } else {
          setInputValue(currentUrl);
        }
      } catch {
        // frame may be disposed
      }
    };
    const onCrash = () => {
      // Webview render process died (e.g. window was hidden) — remount it
      setIsLoading(false);
      setWebviewKey((k) => k + 1);
    };

    // Intercept links that try to open new windows (target="_blank") and
    // navigate in the same webview instead — popups would open behind the
    // always-on-top main window and be invisible.
    const onNewWindow = (e: any) => {
      e.preventDefault();
      const url: string | undefined = e.url;
      if (url && /^https?:\/\//i.test(url)) {
        try { wv.loadURL(url); } catch { /* frame disposed */ }
      }
    };

    wv.addEventListener('dom-ready', onDomReady);
    wv.addEventListener('did-start-loading', onNavStart);
    wv.addEventListener('did-stop-loading', onNavDone);
    wv.addEventListener('did-navigate', onNavDone);
    wv.addEventListener('did-navigate-in-page', onNavDone);
    wv.addEventListener('render-process-gone', onCrash);
    wv.addEventListener('crashed', onCrash);
    wv.addEventListener('new-window', onNewWindow);

    return () => {
      wv.removeEventListener('dom-ready', onDomReady);
      wv.removeEventListener('did-start-loading', onNavStart);
      wv.removeEventListener('did-stop-loading', onNavDone);
      wv.removeEventListener('did-navigate', onNavDone);
      wv.removeEventListener('did-navigate-in-page', onNavDone);
      wv.removeEventListener('render-process-gone', onCrash);
      wv.removeEventListener('crashed', onCrash);
      wv.removeEventListener('new-window', onNewWindow);
    };
  }, [webviewKey]);

  return (
    <div className="flex flex-col h-full">
      {/* Navigation bar */}
      <div className="flex items-center gap-1.5 px-2 py-1.5 flex-shrink-0" style={{ borderBottom: '0.5px solid rgba(255,255,255,0.08)' }}>
        <button
          onClick={() => webviewRef.current?.goBack()}
          disabled={!canGoBack}
          className="w-6 h-6 flex items-center justify-center rounded transition-colors"
          style={{ color: canGoBack ? 'rgba(255,255,255,0.5)' : 'rgba(255,255,255,0.15)' }}
          title="Back"
        >
          <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
            <path d="M15 18l-6-6 6-6" />
          </svg>
        </button>
        <button
          onClick={() => webviewRef.current?.goForward()}
          disabled={!canGoForward}
          className="w-6 h-6 flex items-center justify-center rounded transition-colors"
          style={{ color: canGoForward ? 'rgba(255,255,255,0.5)' : 'rgba(255,255,255,0.15)' }}
          title="Forward"
        >
          <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
            <path d="M9 18l6-6-6-6" />
          </svg>
        </button>
        <button
          onClick={() => isLoading ? webviewRef.current?.stop() : webviewRef.current?.reload()}
          className="w-6 h-6 flex items-center justify-center rounded transition-colors"
          style={{ color: 'rgba(255,255,255,0.4)' }}
          title={isLoading ? 'Stop' : 'Reload'}
        >
          {isLoading ? (
            <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round">
              <path d="M18 6L6 18M6 6l12 12" />
            </svg>
          ) : (
            <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
              <path d="M21 2v6h-6" />
              <path d="M3 12a9 9 0 0 1 15-6.7L21 8" />
              <path d="M3 22v-6h6" />
              <path d="M21 12a9 9 0 0 1-15 6.7L3 16" />
            </svg>
          )}
        </button>
        <form onSubmit={handleSubmit} className="flex-1">
          <input
            ref={inputRef}
            type="text"
            value={inputValue}
            onChange={(e) => setInputValue(e.target.value)}
            onFocus={(e) => e.target.select()}
            placeholder="Search or enter URL..."
            data-autofocus="search"
            className="search-url-input w-full px-2.5 py-1 rounded-md text-[11px] outline-none"
            style={{
              background: 'rgba(255,255,255,0.06)',
              color: 'rgba(255,255,255,0.8)',
              border: '0.5px solid rgba(255,255,255,0.1)',
            }}
          />
        </form>
      </div>

      {/* Webview */}
      <div className="flex-1 min-h-0 relative">
        {isLoading && (
          <div className="absolute top-0 left-0 right-0 h-[2px] z-10 overflow-hidden">
            <div
              className="h-full rounded-full"
              style={{
                background: 'rgba(255,255,255,0.5)',
                animation: 'search-loading 1.5s ease-in-out infinite',
              }}
            />
          </div>
        )}
        <webview
          key={webviewKey}
          ref={webviewRef as any}
          src="about:blank"
          className="w-full h-full"
          style={{ background: 'white' }}
          /* @ts-ignore */
          partition="persist:search"
          useragent={USERAGENT}
        />
      </div>
    </div>
  );
}
