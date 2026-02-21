import { useState, useEffect, useRef, useCallback } from 'react';
import type { WorkSession } from '@app/api';

// ── helpers ──────────────────────────────────────────────────────────────────

function fmtDuration(ms: number): string {
  const s = Math.floor(ms / 1000);
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  const sec = s % 60;
  if (h > 0) return `${h}h ${m.toString().padStart(2, '0')}m ${sec.toString().padStart(2, '0')}s`;
  if (m > 0) return `${m}m ${sec.toString().padStart(2, '0')}s`;
  return `${sec}s`;
}

function fmtDurationShort(ms: number): string {
  const totalMin = Math.round(ms / 60000);
  const h = Math.floor(totalMin / 60);
  const m = totalMin % 60;
  if (h === 0) return `${m}m`;
  if (m === 0) return `${h}h`;
  return `${h}h ${m}m`;
}

function fmtTime(ts: number): string {
  return new Date(ts).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
}

function fmtDate(ts: number): string {
  return new Date(ts).toLocaleDateString([], { weekday: 'short', month: 'short', day: 'numeric' });
}

function startOfDay(ts: number): number {
  const d = new Date(ts);
  d.setHours(0, 0, 0, 0);
  return d.getTime();
}

function getWeekStart(fromTs = Date.now()): number {
  const d = new Date(fromTs);
  const day = d.getDay(); // 0=Sun
  const diff = day === 0 ? -6 : 1 - day; // shift to Monday
  d.setDate(d.getDate() + diff);
  d.setHours(0, 0, 0, 0);
  return d.getTime();
}

const DAY_NAMES = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];

// Compute ms worked per weekday (Mon=0 … Sun=6) for a given week start
function computeWeekData(sessions: WorkSession[], weekStart: number, now: number): number[] {
  const totals = [0, 0, 0, 0, 0, 0, 0];
  const weekEnd = weekStart + 7 * 24 * 3600 * 1000;
  for (const s of sessions) {
    const end = s.clockOut ?? now;
    // Only sessions that start within this week
    if (s.clockIn < weekStart || s.clockIn >= weekEnd) continue;
    const dayOfWeek = new Date(s.clockIn).getDay(); // 0=Sun
    const idx = dayOfWeek === 0 ? 6 : dayOfWeek - 1; // Mon=0 … Sun=6
    totals[idx] += Math.max(0, end - s.clockIn);
  }
  return totals;
}

// ── component ─────────────────────────────────────────────────────────────────

export function WorkClock() {
  const [sessions, setSessions] = useState<WorkSession[]>([]);
  const [now, setNow] = useState(Date.now());
  const [confirmDelete, setConfirmDelete] = useState<number | null>(null);
  const tickRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const load = useCallback(async () => {
    const since = Date.now() - 60 * 24 * 3600 * 1000; // last 60 days
    const data = await window.api.work.getSessions(since);
    setSessions(data);
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  // Live ticker — always runs so current-session timer and today total update
  useEffect(() => {
    tickRef.current = setInterval(() => setNow(Date.now()), 1000);
    return () => { if (tickRef.current) clearInterval(tickRef.current); };
  }, []);

  // ── derived state ──────────────────────────────────────────────────────────

  const activeSession = sessions.find((s) => s.clockOut === null) ?? null;

  const todayStart = startOfDay(now);
  const todayMs = sessions.reduce((acc, s) => {
    if (s.clockIn < todayStart) return acc;
    const end = s.clockOut ?? now;
    return acc + Math.max(0, end - s.clockIn);
  }, 0);

  const weekStart = getWeekStart(now);
  const weekData = computeWeekData(sessions, weekStart, now);
  const weekTotal = weekData.reduce((a, b) => a + b, 0);
  const maxDayMs = Math.max(...weekData, 1);

  const todayDayIdx = (() => {
    const d = new Date(now).getDay();
    return d === 0 ? 6 : d - 1;
  })();

  // Sessions grouped for the list (last 14 days, newest first)
  const listCutoff = now - 14 * 24 * 3600 * 1000;
  const recentSessions = sessions
    .filter((s) => s.clockIn >= listCutoff)
    .sort((a, b) => b.clockIn - a.clockIn);

  // Group by calendar day label
  const grouped: { label: string; items: WorkSession[] }[] = [];
  for (const s of recentSessions) {
    const dayStart = startOfDay(s.clockIn);
    let label: string;
    if (dayStart === startOfDay(now)) label = 'Today';
    else if (dayStart === startOfDay(now - 86400000)) label = 'Yesterday';
    else label = fmtDate(s.clockIn);

    const existing = grouped.find((g) => g.label === label);
    if (existing) existing.items.push(s);
    else grouped.push({ label, items: [s] });
  }

  // ── actions ────────────────────────────────────────────────────────────────

  async function handleClockIn() {
    const session = await window.api.work.clockIn();
    setSessions((prev) => [session, ...prev]);
  }

  async function handleClockOut() {
    if (!activeSession) return;
    const updated = await window.api.work.clockOut(activeSession.id);
    if (updated) {
      setSessions((prev) => prev.map((s) => (s.id === updated.id ? updated : s)));
    }
  }

  async function handleDelete(id: number) {
    if (confirmDelete !== id) {
      setConfirmDelete(id);
      return;
    }
    await window.api.work.deleteSession(id);
    setSessions((prev) => prev.filter((s) => s.id !== id));
    setConfirmDelete(null);
  }

  // ── render ─────────────────────────────────────────────────────────────────

  return (
    <div
      className="flex flex-col h-full overflow-y-auto"
      style={{ padding: '16px 20px', gap: 16 }}
      onClick={() => setConfirmDelete(null)}
    >
      {/* ── Clock In / Out card ── */}
      <div
        className="glass-panel rounded-xl flex flex-col items-center"
        style={{ padding: '20px 24px', gap: 12 }}
      >
        {activeSession ? (
          <>
            <div style={{ color: 'rgba(255,255,255,0.45)', fontSize: 11, letterSpacing: '0.08em', textTransform: 'uppercase' }}>
              Clocked in at {fmtTime(activeSession.clockIn)}
            </div>
            <div style={{ color: 'rgba(255,255,255,0.95)', fontSize: 36, fontVariantNumeric: 'tabular-nums', letterSpacing: '-0.02em', lineHeight: 1 }}>
              {fmtDuration(now - activeSession.clockIn)}
            </div>
            <button
              className="glass-btn"
              onClick={handleClockOut}
              style={{
                marginTop: 4,
                padding: '7px 28px',
                fontSize: 12,
                fontWeight: 600,
                letterSpacing: '0.04em',
                background: 'rgba(255,80,80,0.18)',
                color: 'rgba(255,140,140,0.95)',
                border: '1px solid rgba(255,80,80,0.25)',
                borderRadius: 8,
              }}
            >
              CLOCK OUT
            </button>
          </>
        ) : (
          <>
            <div style={{ color: 'rgba(255,255,255,0.35)', fontSize: 11, letterSpacing: '0.08em', textTransform: 'uppercase' }}>
              {todayMs > 0 ? `Today: ${fmtDurationShort(todayMs)}` : 'Not clocked in'}
            </div>
            <button
              className="glass-btn"
              onClick={handleClockIn}
              style={{
                padding: '8px 32px',
                fontSize: 13,
                fontWeight: 600,
                letterSpacing: '0.04em',
                background: 'rgba(80,200,120,0.18)',
                color: 'rgba(120,220,150,0.95)',
                border: '1px solid rgba(80,200,120,0.25)',
                borderRadius: 8,
              }}
            >
              CLOCK IN
            </button>
          </>
        )}
      </div>

      {/* ── This week ── */}
      <div className="glass-panel rounded-xl" style={{ padding: '16px 20px' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', marginBottom: 12 }}>
          <span style={{ color: 'rgba(255,255,255,0.45)', fontSize: 10, letterSpacing: '0.1em', textTransform: 'uppercase' }}>
            This Week
          </span>
          <span style={{ color: 'rgba(255,255,255,0.7)', fontSize: 13, fontVariantNumeric: 'tabular-nums' }}>
            {fmtDurationShort(weekTotal)}
          </span>
        </div>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 5 }}>
          {DAY_NAMES.map((day, i) => {
            const ms = weekData[i];
            const isToday = i === todayDayIdx;
            const barPct = (ms / maxDayMs) * 100;
            return (
              <div key={day} style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                <span style={{
                  width: 28,
                  fontSize: 11,
                  color: isToday ? 'rgba(255,255,255,0.8)' : 'rgba(255,255,255,0.3)',
                  fontWeight: isToday ? 600 : 400,
                  flexShrink: 0,
                }}>
                  {day}
                </span>
                <div style={{ flex: 1, height: 6, borderRadius: 3, background: 'rgba(255,255,255,0.07)', overflow: 'hidden' }}>
                  {ms > 0 && (
                    <div style={{
                      width: `${barPct}%`,
                      height: '100%',
                      borderRadius: 3,
                      background: isToday ? 'rgba(120,200,255,0.7)' : 'rgba(255,255,255,0.25)',
                    }} />
                  )}
                </div>
                <span style={{
                  width: 40,
                  fontSize: 11,
                  textAlign: 'right',
                  fontVariantNumeric: 'tabular-nums',
                  color: ms > 0
                    ? (isToday ? 'rgba(120,200,255,0.85)' : 'rgba(255,255,255,0.5)')
                    : 'rgba(255,255,255,0.15)',
                  flexShrink: 0,
                }}>
                  {ms > 0 ? fmtDurationShort(ms) : '—'}
                </span>
              </div>
            );
          })}
        </div>
      </div>

      {/* ── Session log ── */}
      {grouped.length > 0 && (
        <div className="glass-panel rounded-xl" style={{ padding: '16px 20px' }}>
          <div style={{ color: 'rgba(255,255,255,0.45)', fontSize: 10, letterSpacing: '0.1em', textTransform: 'uppercase', marginBottom: 12 }}>
            Sessions
          </div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
            {grouped.map(({ label, items }) => (
              <div key={label}>
                <div style={{ color: 'rgba(255,255,255,0.3)', fontSize: 10, marginBottom: 4, letterSpacing: '0.05em' }}>
                  {label}
                </div>
                <div style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
                  {items.map((s) => {
                    const end = s.clockOut ?? now;
                    const dur = Math.max(0, end - s.clockIn);
                    const isActive = s.clockOut === null;
                    const isConfirm = confirmDelete === s.id;
                    return (
                      <div
                        key={s.id}
                        style={{
                          display: 'flex',
                          alignItems: 'center',
                          gap: 8,
                          padding: '5px 8px',
                          borderRadius: 6,
                          background: isActive ? 'rgba(120,200,255,0.06)' : 'transparent',
                        }}
                      >
                        <span style={{ fontSize: 11, color: 'rgba(255,255,255,0.55)', fontVariantNumeric: 'tabular-nums', flexShrink: 0 }}>
                          {fmtTime(s.clockIn)}
                        </span>
                        <span style={{ fontSize: 10, color: 'rgba(255,255,255,0.2)', flexShrink: 0 }}>→</span>
                        <span style={{ fontSize: 11, color: isActive ? 'rgba(120,200,255,0.7)' : 'rgba(255,255,255,0.55)', fontVariantNumeric: 'tabular-nums', flexShrink: 0 }}>
                          {isActive ? 'now' : fmtTime(s.clockOut!)}
                        </span>
                        <span style={{ flex: 1, fontSize: 11, color: 'rgba(255,255,255,0.35)', fontVariantNumeric: 'tabular-nums', textAlign: 'right' }}>
                          {fmtDurationShort(dur)}
                        </span>
                        <button
                          onClick={(e) => { e.stopPropagation(); handleDelete(s.id); }}
                          style={{
                            flexShrink: 0,
                            width: 18,
                            height: 18,
                            display: 'flex',
                            alignItems: 'center',
                            justifyContent: 'center',
                            borderRadius: 4,
                            border: 'none',
                            background: isConfirm ? 'rgba(255,80,80,0.3)' : 'transparent',
                            color: isConfirm ? 'rgba(255,120,120,0.9)' : 'rgba(255,255,255,0.2)',
                            cursor: 'pointer',
                            fontSize: 10,
                            transition: 'all 0.15s',
                          }}
                          title={isConfirm ? 'Click again to confirm' : 'Delete session'}
                        >
                          {isConfirm ? '!' : '×'}
                        </button>
                      </div>
                    );
                  })}
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {sessions.length === 0 && (
        <div style={{ textAlign: 'center', color: 'rgba(255,255,255,0.2)', fontSize: 12, paddingTop: 8 }}>
          Clock in to start tracking your work hours.
        </div>
      )}
    </div>
  );
}
