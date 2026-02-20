import { useRef, useEffect, useCallback, useState, forwardRef, useImperativeHandle } from 'react';
import DOMPurify from 'dompurify';

const MAX_IMG_WIDTH = 500;
const MAX_IMG_HEIGHT = 400;
const IMG_QUALITY = 0.85;

function resizeImageFile(file: File): Promise<string> {
  return new Promise((resolve) => {
    const img = new Image();
    img.onload = () => {
      let { width, height } = img;
      if (width > MAX_IMG_WIDTH || height > MAX_IMG_HEIGHT) {
        const ratio = Math.min(MAX_IMG_WIDTH / width, MAX_IMG_HEIGHT / height);
        width = Math.round(width * ratio);
        height = Math.round(height * ratio);
      }
      const canvas = document.createElement('canvas');
      canvas.width = width;
      canvas.height = height;
      const ctx = canvas.getContext('2d')!;
      ctx.drawImage(img, 0, 0, width, height);
      resolve(canvas.toDataURL('image/jpeg', IMG_QUALITY));
    };
    img.src = URL.createObjectURL(file);
  });
}

// ── Image resize overlay logic ──

const HANDLE_SIZE = 10;
const MIN_IMG_W = 40;
const BUTTON_THRESHOLD = 100; // hide action buttons below this width

type Corner = 'tl' | 'tr' | 'bl' | 'br';
const CURSORS: Record<Corner, string> = { tl: 'nwse-resize', tr: 'nesw-resize', bl: 'nesw-resize', br: 'nwse-resize' };

function makeHandle(corner: Corner): HTMLDivElement {
  const h = document.createElement('div');
  h.className = 'img-resize-handle';
  h.dataset.corner = corner;
  Object.assign(h.style, {
    position: 'absolute',
    width: `${HANDLE_SIZE}px`,
    height: `${HANDLE_SIZE}px`,
    borderRadius: '2px',
    background: 'rgba(120, 180, 255, 0.8)',
    cursor: CURSORS[corner],
    pointerEvents: 'auto',
    ...(corner.includes('t') ? { top: '-4px' } : { bottom: '-4px' }),
    ...(corner.includes('l') ? { left: '-4px' } : { right: '-4px' }),
  });
  return h;
}

function makeSvgButton(pathD: string, title: string): HTMLButtonElement {
  const btn = document.createElement('button');
  btn.title = title;
  btn.className = 'img-action-btn';
  Object.assign(btn.style, {
    width: '24px',
    height: '24px',
    borderRadius: '4px',
    border: 'none',
    background: 'rgba(0,0,0,0.45)',
    backdropFilter: 'blur(8px)',
    cursor: 'pointer',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    padding: '0',
    pointerEvents: 'auto',
  });
  const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
  svg.setAttribute('width', '14');
  svg.setAttribute('height', '14');
  svg.setAttribute('viewBox', '0 0 24 24');
  svg.setAttribute('fill', 'none');
  svg.setAttribute('stroke', 'rgba(255,255,255,0.8)');
  svg.setAttribute('stroke-width', '2');
  svg.setAttribute('stroke-linecap', 'round');
  svg.setAttribute('stroke-linejoin', 'round');
  const path = document.createElementNS('http://www.w3.org/2000/svg', 'path');
  path.setAttribute('d', pathD);
  svg.appendChild(path);
  btn.appendChild(svg);
  return btn;
}

function attachResizeHandlers(editor: HTMLDivElement, onSave: () => void) {
  let overlay: HTMLDivElement | null = null;
  let activeImg: HTMLImageElement | null = null;

  function removeOverlay() {
    if (overlay) {
      overlay.remove();
      overlay = null;
    }
    activeImg = null;
  }

  function syncOverlay() {
    if (!overlay || !activeImg) return;
    overlay.style.left = `${activeImg.offsetLeft}px`;
    overlay.style.top = `${activeImg.offsetTop}px`;
    overlay.style.width = `${activeImg.offsetWidth}px`;
    overlay.style.height = `${activeImg.offsetHeight}px`;
    // Show/hide action buttons based on size
    const bar = overlay.querySelector('.img-action-bar') as HTMLElement | null;
    if (bar) bar.style.display = activeImg.offsetWidth < BUTTON_THRESHOLD ? 'none' : 'flex';
  }

  function showOverlay(img: HTMLImageElement) {
    removeOverlay();
    activeImg = img;

    overlay = document.createElement('div');
    overlay.className = 'img-resize-overlay';
    Object.assign(overlay.style, {
      position: 'absolute',
      pointerEvents: 'none',
      border: '1.5px solid rgba(120, 180, 255, 0.5)',
      borderRadius: '6px',
      zIndex: '10',
    });

    // 4 corner handles
    for (const corner of ['tl', 'tr', 'bl', 'br'] as Corner[]) {
      const handle = makeHandle(corner);
      overlay.appendChild(handle);

      handle.addEventListener('mousedown', (e) => {
        e.preventDefault();
        e.stopPropagation();
        if (!activeImg || !overlay) return;

        const startX = e.clientX;
        const startY = e.clientY;
        const startW = activeImg.offsetWidth;
        const startH = activeImg.offsetHeight;
        const aspect = startH / startW;

        function onMove(ev: MouseEvent) {
          if (!activeImg || !overlay) return;
          const dx = ev.clientX - startX;
          const dy = ev.clientY - startY;

          let newW: number;
          if (corner === 'br') newW = startW + dx;
          else if (corner === 'bl') newW = startW - dx;
          else if (corner === 'tr') newW = startW + dx;
          else newW = startW - dx; // tl

          newW = Math.max(MIN_IMG_W, newW);
          activeImg.style.width = `${newW}px`;
          activeImg.style.height = 'auto';
          syncOverlay();
        }

        function onUp() {
          document.removeEventListener('mousemove', onMove);
          document.removeEventListener('mouseup', onUp);
          syncOverlay();
          onSave();
        }

        document.addEventListener('mousemove', onMove);
        document.addEventListener('mouseup', onUp);
      });
    }

    // Action button bar (top-right)
    const bar = document.createElement('div');
    bar.className = 'img-action-bar';
    Object.assign(bar.style, {
      position: 'absolute',
      top: '6px',
      right: '6px',
      display: 'flex',
      gap: '4px',
      pointerEvents: 'auto',
    });

    // Copy button (clipboard icon)
    const copyBtn = makeSvgButton(
      'M8 4H6a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V6a2 2 0 0 0-2-2h-2M8 4v0a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v0M8 4h8',
      'Copy image'
    );
    copyBtn.addEventListener('click', async (e) => {
      e.preventDefault();
      e.stopPropagation();
      if (!activeImg) return;
      try {
        const resp = await fetch(activeImg.src);
        const blob = await resp.blob();
        await navigator.clipboard.write([new ClipboardItem({ [blob.type]: blob })]);
      } catch { /* ignore */ }
    });

    // Download button (arrow-down icon)
    const dlBtn = makeSvgButton(
      'M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4M7 10l5 5 5-5M12 15V3',
      'Download image'
    );
    dlBtn.addEventListener('click', (e) => {
      e.preventDefault();
      e.stopPropagation();
      if (!activeImg) return;
      const a = document.createElement('a');
      a.href = activeImg.src;
      a.download = `image-${Date.now()}.jpg`;
      a.click();
    });

    bar.appendChild(copyBtn);
    bar.appendChild(dlBtn);
    overlay.appendChild(bar);

    editor.style.position = 'relative';
    editor.appendChild(overlay);
    syncOverlay();
  }

  function handleClick(e: MouseEvent) {
    const target = e.target as HTMLElement;
    if (target.tagName === 'IMG' && editor.contains(target)) {
      showOverlay(target as HTMLImageElement);
    } else if (
      !target.closest('.img-resize-overlay')
    ) {
      removeOverlay();
    }
  }

  editor.addEventListener('click', handleClick);

  return () => {
    editor.removeEventListener('click', handleClick);
    removeOverlay();
  };
}

function getCleanHTML(editor: HTMLDivElement): string {
  const clone = editor.cloneNode(true) as HTMLDivElement;
  clone.querySelectorAll('.img-resize-overlay').forEach((el) => el.remove());
  return clone.innerHTML;
}

// Strip ALL HTML tags to get plain text for char diff
function textOnly(html: string): string {
  return html.replace(/<[^>]*>/g, '');
}

// Count img tags
function imgCount(html: string): number {
  return (html.match(/<img[^>]*>/gi) || []).length;
}

const VERSION_CHAR_THRESHOLD = 100;
const VERSION_COOLDOWN_MS = 20_000;

export interface NotesEditorHandle {
  undo(): void;
  redo(): void;
  canUndo: boolean;
  canRedo: boolean;
}

export const NotesEditor = forwardRef<NotesEditorHandle, { noteId?: string }>(function NotesEditor({ noteId }, ref) {
  const editorRef = useRef<HTMLDivElement>(null);
  const saveTimer = useRef<ReturnType<typeof setTimeout>>();
  const loaded = useRef(false);
  const lastSavedHTML = useRef('');

  // Version history: stored newest-first from DB
  const versions = useRef<string[]>([]);
  const versionIndex = useRef(-1); // -1 = current (live) state
  const [canUndo, setCanUndo] = useState(false);
  const [canRedo, setCanRedo] = useState(false);
  const isRestoringVersion = useRef(false);

  // Version gating state
  const lastVersionHTML = useRef('');
  const lastVersionTime = useRef(0);

  function updateButtons() {
    const totalVersions = versions.current.length;
    setCanUndo(versionIndex.current < totalVersions - 1);
    setCanRedo(versionIndex.current > -1);
  }

  function shouldPushVersion(html: string): boolean {
    const now = Date.now();
    const elapsed = now - lastVersionTime.current;

    // Must respect 20s cooldown
    if (elapsed < VERSION_COOLDOWN_MS) return false;

    const prevText = textOnly(lastVersionHTML.current);
    const currText = textOnly(html);
    const charDiff = Math.abs(currText.length - prevText.length);

    const prevImgs = imgCount(lastVersionHTML.current);
    const currImgs = imgCount(html);
    const imageAdded = currImgs > prevImgs;

    // Push if text changed by 100+ chars OR an image was added
    return charDiff >= VERSION_CHAR_THRESHOLD || imageAdded;
  }

  function pushVersion(html: string) {
    window.api.notes.pushVersion(html, noteId);
    versions.current.unshift(html);
    if (versions.current.length > 10) versions.current.pop();
    lastVersionHTML.current = html;
    lastVersionTime.current = Date.now();
    versionIndex.current = -1;
    updateButtons();
  }

  function saveNow() {
    if (!loaded.current || !editorRef.current || isRestoringVersion.current) return;
    const html = getCleanHTML(editorRef.current);
    if (html === lastSavedHTML.current) return;
    lastSavedHTML.current = html;
    window.api.notes.saveContent(html, noteId);

    if (shouldPushVersion(html)) {
      pushVersion(html);
    }
  }

  const save = useCallback(() => {
    if (!loaded.current || !editorRef.current) return;
    if (saveTimer.current) clearTimeout(saveTimer.current);
    saveTimer.current = setTimeout(() => saveNow(), 500);
  }, []);

  // Load content + versions on mount
  useEffect(() => {
    Promise.all([
      window.api.notes.getContent(noteId),
      window.api.notes.getVersions(noteId),
    ]).then(([html, vers]) => {
      if (editorRef.current) {
        editorRef.current.innerHTML = DOMPurify.sanitize(html || '');
        lastSavedHTML.current = html || '';
        loaded.current = true;
      }
      versions.current = vers.map((v) => v.content);
      lastVersionHTML.current = versions.current[0] || html || '';
      lastVersionTime.current = vers[0]?.createdAt || 0;
      updateButtons();
    });
  }, []);

  // Focus on mount
  useEffect(() => {
    editorRef.current?.focus();
  }, []);

  // Watch for content changes via MutationObserver (avoids IMK conflicts with onInput)
  useEffect(() => {
    if (!editorRef.current) return;
    const observer = new MutationObserver(() => {
      if (loaded.current && !isRestoringVersion.current) save();
    });
    observer.observe(editorRef.current, {
      childList: true,
      subtree: true,
      characterData: true,
    });
    return () => observer.disconnect();
  }, [save]);

  // Attach image resize handlers
  useEffect(() => {
    if (!editorRef.current) return;
    return attachResizeHandlers(editorRef.current, save);
  }, [save]);

  // Flush on unmount + visibility
  useEffect(() => {
    const flushOnHide = () => {
      if (document.hidden) saveNow();
    };
    document.addEventListener('visibilitychange', flushOnHide);
    return () => {
      document.removeEventListener('visibilitychange', flushOnHide);
      if (saveTimer.current) clearTimeout(saveTimer.current);
      saveNow();
    };
  }, []);

  useImperativeHandle(ref, () => ({
    undo: () => undoFn(),
    redo: () => redoFn(),
    get canUndo() { return canUndo; },
    get canRedo() { return canRedo; },
  }), [canUndo, canRedo]);

  function undoFn() {
    if (!editorRef.current) return;
    const next = versionIndex.current + 1;
    if (next >= versions.current.length) return;
    // If moving from live state, snapshot current content as index -1 restore point
    if (versionIndex.current === -1) {
      const liveHTML = getCleanHTML(editorRef.current);
      // Save live state so redo can get back to it
      lastSavedHTML.current = liveHTML;
    }
    versionIndex.current = next;
    isRestoringVersion.current = true;
    editorRef.current.innerHTML = DOMPurify.sanitize(versions.current[next]);
    window.api.notes.saveContent(versions.current[next], noteId);
    isRestoringVersion.current = false;
    updateButtons();
  }

  function redoFn() {
    if (!editorRef.current) return;
    const next = versionIndex.current - 1;
    if (next < -1) return;
    versionIndex.current = next;
    isRestoringVersion.current = true;
    if (next === -1) {
      // Back to live state
      editorRef.current.innerHTML = DOMPurify.sanitize(lastSavedHTML.current);
      window.api.notes.saveContent(lastSavedHTML.current, noteId);
    } else {
      editorRef.current.innerHTML = DOMPurify.sanitize(versions.current[next]);
      window.api.notes.saveContent(versions.current[next], noteId);
    }
    isRestoringVersion.current = false;
    updateButtons();
  }

  const handlePaste = useCallback(async (e: React.ClipboardEvent) => {
    const items = e.clipboardData?.items;
    if (!items) return;

    for (const item of items) {
      if (item.type.startsWith('image/')) {
        e.preventDefault();
        const file = item.getAsFile();
        if (!file) continue;

        const dataUrl = await resizeImageFile(file);
        const img = document.createElement('img');
        img.src = dataUrl;

        const sel = window.getSelection();
        if (sel && sel.rangeCount > 0) {
          const range = sel.getRangeAt(0);
          range.deleteContents();
          range.insertNode(img);
          range.setStartAfter(img);
          range.collapse(true);
          sel.removeAllRanges();
          sel.addRange(range);
        } else {
          editorRef.current?.appendChild(img);
        }

        save();
        return;
      }
    }
  }, [save]);

  return (
    <div className="flex flex-col h-full w-full">
      <div
        ref={editorRef}
        contentEditable
        suppressContentEditableWarning
        onPaste={handlePaste}
        className="notes-editor flex-1 min-h-0 overflow-y-auto auto-hide-scroll outline-none px-4 py-3"
        {...(!noteId || noteId === 'default' ? { 'data-autofocus': 'notes' } : {})}
        spellCheck
      />
    </div>
  );
});
