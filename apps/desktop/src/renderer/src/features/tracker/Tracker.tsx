import { useState, useEffect, useMemo, useRef, useCallback } from 'react';
import { DayPicker } from 'react-day-picker';
import 'react-day-picker/style.css';

function formatDate(date: Date): string {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
}

function parseDate(str: string): Date {
  const [y, m, d] = str.split('-').map(Number);
  return new Date(y, m - 1, d);
}

export function Tracker() {
  const [checkedDates, setCheckedDates] = useState<Set<string>>(new Set());
  const [loaded, setLoaded] = useState(false);
  const [scale, setScale] = useState(1);
  const [title, setTitle] = useState('');
  const [isEditingTitle, setIsEditingTitle] = useState(false);
  const [editValue, setEditValue] = useState('');
  const containerRef = useRef<HTMLDivElement>(null);
  const contentRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    Promise.all([
      window.api.tracker.getDays(),
      window.api.tracker.getTitle(),
    ]).then(([days, savedTitle]) => {
      setCheckedDates(new Set(days));
      setTitle(savedTitle);
      setLoaded(true);
    });
  }, []);

  // Auto-scale content to fill container
  const updateScale = useCallback(() => {
    const container = containerRef.current;
    const content = contentRef.current;
    if (!container || !content) return;
    const cw = container.clientWidth;
    const ch = container.clientHeight;
    // Measure natural size at scale 1
    content.style.transform = 'scale(1)';
    const nw = content.scrollWidth;
    const nh = content.scrollHeight;
    const s = Math.min(cw / nw, ch / nh, 2);
    setScale(s);
  }, []);

  useEffect(() => {
    if (!loaded) return;
    // Small delay so DayPicker renders its natural size first
    const t = setTimeout(updateScale, 50);
    const ro = new ResizeObserver(updateScale);
    if (containerRef.current) ro.observe(containerRef.current);
    return () => { clearTimeout(t); ro.disconnect(); };
  }, [loaded, updateScale]);

  async function handleDayClick(day: Date) {
    const dateStr = formatDate(day);
    try {
      const nowChecked = await window.api.tracker.toggleDay(dateStr);
      setCheckedDates((prev) => {
        const next = new Set(prev);
        if (nowChecked) next.add(dateStr);
        else next.delete(dateStr);
        return next;
      });
    } catch (err) {
      console.error('Failed to toggle tracker day:', err);
    }
  }

  const streak = useMemo(() => {
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    let count = 0;
    const check = new Date(today);
    if (!checkedDates.has(formatDate(check))) {
      check.setDate(check.getDate() - 1);
      if (!checkedDates.has(formatDate(check))) return 0;
    }
    while (checkedDates.has(formatDate(check))) {
      count++;
      check.setDate(check.getDate() - 1);
    }
    return count;
  }, [checkedDates]);

  const totalDays = checkedDates.size;

  const checkedDays = useMemo(
    () => [...checkedDates].map(parseDate),
    [checkedDates]
  );

  if (!loaded) return null;

  return (
    <div ref={containerRef} className="flex flex-col h-full w-full items-center justify-center overflow-hidden">
      <div
        ref={contentRef}
        className="flex flex-col items-center"
        style={{ transform: `scale(${scale})`, transformOrigin: 'center center' }}
      >
        {isEditingTitle ? (
          <input
            ref={inputRef}
            className="text-[13px] font-medium mb-3 bg-transparent border-none outline-none text-center w-full"
            style={{ color: 'rgba(255,255,255,0.5)' }}
            value={editValue}
            placeholder="click to name tracker"
            onChange={(e) => setEditValue(e.target.value)}
            onBlur={() => {
              const trimmed = editValue.trim();
              setTitle(trimmed);
              setIsEditingTitle(false);
              window.api.tracker.setTitle(trimmed);
            }}
            onKeyDown={(e) => {
              if (e.key === 'Enter') e.currentTarget.blur();
              if (e.key === 'Escape') {
                setEditValue(title);
                setIsEditingTitle(false);
              }
            }}
          />
        ) : (
          <span
            className="text-[13px] font-medium mb-3 cursor-pointer"
            style={{ color: 'rgba(255,255,255,0.5)' }}
            onClick={() => {
              setEditValue(title);
              setIsEditingTitle(true);
              setTimeout(() => inputRef.current?.focus(), 0);
            }}
          >
            {title || 'click to name tracker'}
          </span>
        )}

        <div className="flex items-center gap-6 mb-4">
          <div className="flex items-baseline gap-1.5">
            <span
              className="text-[32px] font-bold leading-none"
              style={{ color: 'rgba(120,220,120,0.9)' }}
            >
              {streak}
            </span>
            <span
              className="text-[11px]"
              style={{ color: 'rgba(255,255,255,0.35)' }}
            >
              streak
            </span>
          </div>

          <div style={{ width: 1, height: 24, background: 'rgba(255,255,255,0.1)' }} />

          <div className="flex items-baseline gap-1.5">
            <span
              className="text-[32px] font-bold leading-none"
              style={{ color: 'rgba(255,255,255,0.7)' }}
            >
              {totalDays}
            </span>
            <span
              className="text-[11px]"
              style={{ color: 'rgba(255,255,255,0.35)' }}
            >
              total
            </span>
          </div>
        </div>

        <DayPicker
          className="tracker-calendar"
          modifiers={{ checked: checkedDays }}
          modifiersClassNames={{ checked: 'tracker-checked' }}
          onDayClick={handleDayClick}
        />
      </div>
    </div>
  );
}
