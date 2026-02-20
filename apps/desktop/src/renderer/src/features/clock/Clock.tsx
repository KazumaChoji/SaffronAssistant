import { useState, useEffect, useRef, useCallback } from 'react';

// ── Helpers ──

function formatStopwatch(ms: number): string {
  const totalSeconds = Math.floor(ms / 1000);
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;
  const centiseconds = Math.floor((ms % 1000) / 10);
  return `${String(minutes).padStart(2, '0')}:${String(seconds).padStart(2, '0')}.${String(centiseconds).padStart(2, '0')}`;
}

function formatTimer(ms: number): string {
  const totalSeconds = Math.max(0, Math.ceil(ms / 1000));
  const h = Math.floor(totalSeconds / 3600);
  const m = Math.floor((totalSeconds % 3600) / 60);
  const s = totalSeconds % 60;
  if (h > 0) return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`;
  return `${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`;
}

// ── Types ──

interface Lap {
  number: number;
  elapsed: number;
  split: number;
}

// ── Persistence keys ──

const TIMER_KEY = 'saffron:timer';

interface PersistedTimer {
  endAt: number; // Date.now() timestamp when timer should fire
  paused?: number; // ms remaining if paused
}

function saveTimer(t: PersistedTimer | null) {
  if (t) localStorage.setItem(TIMER_KEY, JSON.stringify(t));
  else localStorage.removeItem(TIMER_KEY);
}

function loadTimer(): PersistedTimer | null {
  try {
    const raw = localStorage.getItem(TIMER_KEY);
    if (!raw) return null;
    return JSON.parse(raw);
  } catch { return null; }
}

// ── Shared button style helper ──

const btn = (bg: string, color: string, border: string, enabled = true) => ({
  background: bg,
  color,
  border: `0.5px solid ${border}`,
  cursor: enabled ? 'pointer' : 'default',
});

// ── Component ──

export function Clock() {
  // ── Live clock ──
  const [now, setNow] = useState(new Date());
  useEffect(() => {
    const id = setInterval(() => setNow(new Date()), 1000);
    return () => clearInterval(id);
  }, []);

  const hours = String(now.getHours()).padStart(2, '0');
  const minutes = String(now.getMinutes()).padStart(2, '0');
  const clockSeconds = String(now.getSeconds()).padStart(2, '0');

  // ── Stopwatch state ──
  const [swRunning, setSwRunning] = useState(false);
  const [swElapsed, setSwElapsed] = useState(0);
  const [laps, setLaps] = useState<Lap[]>([]);
  const swStartRef = useRef(0);
  const swRafRef = useRef(0);
  const swAccRef = useRef(0);

  const swTick = useCallback(() => {
    setSwElapsed(swAccRef.current + (performance.now() - swStartRef.current));
    swRafRef.current = requestAnimationFrame(swTick);
  }, []);

  const swStart = () => { swStartRef.current = performance.now(); setSwRunning(true); swRafRef.current = requestAnimationFrame(swTick); };
  const swPause = () => { cancelAnimationFrame(swRafRef.current); swAccRef.current += performance.now() - swStartRef.current; setSwRunning(false); };
  const swReset = () => { cancelAnimationFrame(swRafRef.current); swAccRef.current = 0; setSwRunning(false); setSwElapsed(0); setLaps([]); };
  const swLap = () => {
    const prev = laps.length > 0 ? laps[0].elapsed : 0;
    setLaps((l) => [{ number: l.length + 1, elapsed: swElapsed, split: swElapsed - prev }, ...l]);
  };

  useEffect(() => () => cancelAnimationFrame(swRafRef.current), []);

  const bestLap = laps.length > 1 ? Math.min(...laps.map((l) => l.split)) : null;
  const worstLap = laps.length > 1 ? Math.max(...laps.map((l) => l.split)) : null;

  // ── Timer state ──
  const [tmInputHr, setTmInputHr] = useState('0');
  const [tmInputMin, setTmInputMin] = useState('5');
  const [tmInputSec, setTmInputSec] = useState('00');
  const [tmRunning, setTmRunning] = useState(false);
  const [tmRemaining, setTmRemaining] = useState(0); // ms remaining
  const [tmFinished, setTmFinished] = useState(false);
  const tmEndAtRef = useRef(0); // absolute timestamp when timer ends
  const tmRafRef = useRef(0);
  const tmTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const mountedRef = useRef(false);

  const tmFinish = useCallback(() => {
    cancelAnimationFrame(tmRafRef.current);
    if (tmTimeoutRef.current) { clearTimeout(tmTimeoutRef.current); tmTimeoutRef.current = null; }
    setTmRunning(false);
    setTmRemaining(0);
    setTmFinished(true);
    saveTimer(null);
    window.api.system.timerFlash();
  }, []);

  const tmTick = useCallback(() => {
    const remaining = Math.max(0, tmEndAtRef.current - Date.now());
    setTmRemaining(remaining);
    if (remaining <= 0) {
      tmFinish();
      return;
    }
    tmRafRef.current = requestAnimationFrame(tmTick);
  }, [tmFinish]);

  // Start or resume the timer countdown targeting an absolute end time
  const tmRunCountdown = useCallback((endAt: number) => {
    const remaining = endAt - Date.now();
    if (remaining <= 0) {
      tmFinish();
      return;
    }
    tmEndAtRef.current = endAt;
    setTmFinished(false);
    setTmRunning(true);
    setTmRemaining(remaining);
    tmRafRef.current = requestAnimationFrame(tmTick);
    if (tmTimeoutRef.current) clearTimeout(tmTimeoutRef.current);
    tmTimeoutRef.current = setTimeout(tmFinish, remaining);
  }, [tmTick, tmFinish]);

  const tmStart = () => {
    let totalMs: number;
    if (tmRemaining > 0 && !tmFinished) {
      // resume from paused state
      totalMs = tmRemaining;
    } else {
      const h = Math.max(0, parseInt(tmInputHr) || 0);
      const m = Math.max(0, parseInt(tmInputMin) || 0);
      const s = Math.max(0, parseInt(tmInputSec) || 0);
      totalMs = (h * 3600 + m * 60 + s) * 1000;
    }
    if (totalMs <= 0) return;
    const endAt = Date.now() + totalMs;
    saveTimer({ endAt });
    tmRunCountdown(endAt);
  };

  const tmPause = () => {
    cancelAnimationFrame(tmRafRef.current);
    if (tmTimeoutRef.current) { clearTimeout(tmTimeoutRef.current); tmTimeoutRef.current = null; }
    const remaining = Math.max(0, tmEndAtRef.current - Date.now());
    setTmRemaining(remaining);
    setTmRunning(false);
    saveTimer({ endAt: 0, paused: remaining });
  };

  const tmReset = () => {
    cancelAnimationFrame(tmRafRef.current);
    if (tmTimeoutRef.current) { clearTimeout(tmTimeoutRef.current); tmTimeoutRef.current = null; }
    setTmRunning(false);
    setTmRemaining(0);
    setTmFinished(false);
    saveTimer(null);
  };

  // Restore persisted timer on mount
  useEffect(() => {
    if (mountedRef.current) return;
    mountedRef.current = true;
    const saved = loadTimer();
    if (!saved) return;

    if (saved.paused && saved.paused > 0) {
      // Was paused — restore remaining without starting
      setTmRemaining(saved.paused);
    } else if (saved.endAt) {
      const remaining = saved.endAt - Date.now();
      if (remaining <= 0) {
        // Timer expired while app was closed / laptop asleep — silently mark finished
        saveTimer(null);
        setTmFinished(true);
      } else {
        tmRunCountdown(saved.endAt);
      }
    }
  }, [tmRunCountdown]);

  useEffect(() => () => {
    cancelAnimationFrame(tmRafRef.current);
    if (tmTimeoutRef.current) clearTimeout(tmTimeoutRef.current);
  }, []);

  // Derive display values
  const tmDisplay = tmRunning || tmRemaining > 0 || tmFinished;
  const tmDisplayMs = tmRunning
    ? tmRemaining
    : tmRemaining > 0
      ? tmRemaining
      : 0;

  const inputStyle = {
    background: 'rgba(255,255,255,0.06)',
    color: 'rgba(255,255,255,0.8)',
    border: '0.5px solid rgba(255,255,255,0.1)',
    letterSpacing: '-1px',
  };

  return (
    <div className="h-full flex flex-col items-center px-4 pt-6 pb-4 overflow-hidden">
      {/* Big clock */}
      <div className="flex-shrink-0 select-none">
        <div
          className="font-medium tracking-tight"
          style={{ fontSize: '72px', lineHeight: 1, color: 'rgba(255,255,255,0.9)', letterSpacing: '-2px' }}
        >
          {hours}:{minutes}
        </div>
        <div className="text-center mt-1" style={{ fontSize: '18px', color: 'rgba(255,255,255,0.25)', letterSpacing: '1px' }}>
          {clockSeconds}s
        </div>
      </div>

      {/* Divider */}
      <div className="w-full my-5 flex-shrink-0" style={{ borderTop: '0.5px solid rgba(255,255,255,0.08)' }} />

      {/* Stopwatch + Timer side by side */}
      <div className="flex-1 min-h-0 w-full flex gap-4 overflow-hidden">

        {/* ── Stopwatch column ── */}
        <div className="flex-1 min-w-0 flex flex-col" style={{ borderRight: '0.5px solid rgba(255,255,255,0.06)' }}>
          <div className="text-center mb-3" style={{ color: 'rgba(255,255,255,0.3)', fontSize: '10px', textTransform: 'uppercase', letterSpacing: '1.5px' }}>
            Stopwatch
          </div>

          <div className="flex-shrink-0 text-center select-none mb-3">
            <div
              className="font-medium tabular-nums"
              style={{
                fontSize: '30px', lineHeight: 1,
                color: swRunning ? 'rgba(255,255,255,0.9)' : 'rgba(255,255,255,0.5)',
                letterSpacing: '-1px', transition: 'color 0.2s',
              }}
            >
              {formatStopwatch(swElapsed)}
            </div>
          </div>

          <div className="flex-shrink-0 flex items-center justify-center gap-1.5 mb-3">
            {!swRunning ? (
              <button onClick={swStart} className="px-3 py-1 rounded-lg text-[11px] font-medium transition-all duration-150" style={btn('rgba(120,220,120,0.12)', 'rgba(120,220,120,0.9)', 'rgba(120,220,120,0.2)')}>Start</button>
            ) : (
              <button onClick={swPause} className="px-3 py-1 rounded-lg text-[11px] font-medium transition-all duration-150" style={btn('rgba(255,180,80,0.12)', 'rgba(255,180,80,0.9)', 'rgba(255,180,80,0.2)')}>Pause</button>
            )}
            <button onClick={swLap} disabled={!swRunning} className="px-3 py-1 rounded-lg text-[11px] font-medium transition-all duration-150" style={btn('rgba(255,255,255,0.06)', swRunning ? 'rgba(255,255,255,0.7)' : 'rgba(255,255,255,0.2)', 'rgba(255,255,255,0.1)', swRunning)}>Lap</button>
            <button onClick={swReset} disabled={swElapsed === 0} className="px-3 py-1 rounded-lg text-[11px] font-medium transition-all duration-150" style={btn('rgba(255,255,255,0.06)', swElapsed > 0 ? 'rgba(255,100,100,0.8)' : 'rgba(255,255,255,0.2)', 'rgba(255,255,255,0.1)', swElapsed > 0)}>Reset</button>
          </div>

          {laps.length > 0 && (
            <div className="flex-1 min-h-0 overflow-y-auto auto-hide-scroll pr-3">
              <table className="w-full text-[11px]" style={{ borderCollapse: 'collapse' }}>
                <thead>
                  <tr style={{ color: 'rgba(255,255,255,0.3)' }}>
                    <th className="text-left font-normal py-1 px-2">Lap</th>
                    <th className="text-right font-normal py-1 px-2">Split</th>
                    <th className="text-right font-normal py-1 px-2">Total</th>
                  </tr>
                </thead>
                <tbody>
                  {laps.map((lap) => {
                    const isBest = bestLap !== null && lap.split === bestLap;
                    const isWorst = worstLap !== null && lap.split === worstLap;
                    let splitColor = 'rgba(255,255,255,0.6)';
                    if (laps.length > 1) {
                      if (isBest) splitColor = 'rgba(120,220,120,0.9)';
                      if (isWorst) splitColor = 'rgba(255,100,100,0.8)';
                    }
                    return (
                      <tr key={lap.number} style={{ borderTop: '0.5px solid rgba(255,255,255,0.06)' }}>
                        <td className="py-1 px-2 tabular-nums" style={{ color: 'rgba(255,255,255,0.4)' }}>{String(lap.number).padStart(2, '0')}</td>
                        <td className="py-1 px-2 text-right tabular-nums" style={{ color: splitColor }}>+{formatStopwatch(lap.split)}</td>
                        <td className="py-1 px-2 text-right tabular-nums" style={{ color: 'rgba(255,255,255,0.5)' }}>{formatStopwatch(lap.elapsed)}</td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </div>

        {/* ── Timer column ── */}
        <div className="flex-1 min-w-0 flex flex-col">
          <div className="text-center mb-3" style={{ color: 'rgba(255,255,255,0.3)', fontSize: '10px', textTransform: 'uppercase', letterSpacing: '1.5px' }}>
            Timer
          </div>

          <div className="flex-shrink-0 text-center select-none mb-3">
            {tmDisplay ? (
              <div
                className="font-medium tabular-nums"
                style={{
                  fontSize: '30px', lineHeight: 1,
                  color: tmFinished ? 'rgba(255,100,100,0.9)' : tmRunning ? 'rgba(255,255,255,0.9)' : 'rgba(255,255,255,0.5)',
                  letterSpacing: '-1px', transition: 'color 0.2s',
                }}
              >
                {tmFinished ? '00:00' : formatTimer(tmDisplayMs)}
              </div>
            ) : (
              <div className="flex items-center justify-center gap-1">
                <input
                  type="text" inputMode="numeric" value={tmInputHr}
                  onChange={(e) => setTmInputHr(e.target.value.replace(/\D/g, '').slice(0, 2))}
                  className="w-10 text-center rounded-lg py-1 text-[22px] font-medium tabular-nums outline-none"
                  style={inputStyle}
                />
                <span style={{ color: 'rgba(255,255,255,0.3)', fontSize: '10px' }}>h</span>
                <input
                  type="text" inputMode="numeric" value={tmInputMin}
                  onChange={(e) => setTmInputMin(e.target.value.replace(/\D/g, '').slice(0, 2))}
                  className="w-10 text-center rounded-lg py-1 text-[22px] font-medium tabular-nums outline-none"
                  style={inputStyle}
                />
                <span style={{ color: 'rgba(255,255,255,0.3)', fontSize: '10px' }}>m</span>
                <input
                  type="text" inputMode="numeric" value={tmInputSec}
                  onChange={(e) => setTmInputSec(e.target.value.replace(/\D/g, '').slice(0, 2))}
                  className="w-10 text-center rounded-lg py-1 text-[22px] font-medium tabular-nums outline-none"
                  style={inputStyle}
                />
                <span style={{ color: 'rgba(255,255,255,0.3)', fontSize: '10px' }}>s</span>
              </div>
            )}
          </div>

          <div className="flex-shrink-0 flex items-center justify-center gap-1.5 mb-3">
            {!tmRunning ? (
              <button
                onClick={tmStart} disabled={tmFinished}
                className="px-3 py-1 rounded-lg text-[11px] font-medium transition-all duration-150"
                style={btn(
                  'rgba(120,220,120,0.12)',
                  tmFinished ? 'rgba(255,255,255,0.2)' : 'rgba(120,220,120,0.9)',
                  tmFinished ? 'rgba(255,255,255,0.1)' : 'rgba(120,220,120,0.2)',
                  !tmFinished,
                )}
              >
                {tmRemaining > 0 && !tmFinished ? 'Resume' : 'Start'}
              </button>
            ) : (
              <button onClick={tmPause} className="px-3 py-1 rounded-lg text-[11px] font-medium transition-all duration-150" style={btn('rgba(255,180,80,0.12)', 'rgba(255,180,80,0.9)', 'rgba(255,180,80,0.2)')}>
                Pause
              </button>
            )}
            <button
              onClick={tmReset} disabled={!tmDisplay}
              className="px-3 py-1 rounded-lg text-[11px] font-medium transition-all duration-150"
              style={btn('rgba(255,255,255,0.06)', tmDisplay ? 'rgba(255,100,100,0.8)' : 'rgba(255,255,255,0.2)', 'rgba(255,255,255,0.1)', tmDisplay)}
            >
              Reset
            </button>
          </div>

          {!tmDisplay && (
            <div className="flex-shrink-0 text-center" style={{ color: 'rgba(255,255,255,0.15)', fontSize: '10px', lineHeight: 1.4 }}>
              screen flash + beep when done
            </div>
          )}

          {tmFinished && (
            <div className="flex-1 flex items-center justify-center">
              <span style={{ color: 'rgba(255,100,100,0.6)', fontSize: '12px' }}>Time's up</span>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
