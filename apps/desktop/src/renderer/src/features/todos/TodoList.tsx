import { useState, useRef, useEffect, useCallback } from 'react';

const TWENTY_FOUR_HOURS = 24 * 60 * 60 * 1000;

interface Todo {
  id: number;
  text: string;
  done: boolean;
  pending: boolean;
  completedAt: number | null;
}

function formatTimeLeft(completedAt: number): string {
  const elapsed = Date.now() - completedAt;
  const remaining = TWENTY_FOUR_HOURS - elapsed;
  if (remaining <= 0) return '0s';

  const totalSeconds = Math.floor(remaining / 1000);
  const totalMinutes = Math.floor(totalSeconds / 60);
  const hours = remaining / (60 * 60 * 1000);

  if (hours >= 1) return `${hours.toFixed(1)}h`;
  if (totalMinutes >= 1) return `${totalMinutes}m`;
  return `${totalSeconds}s`;
}

export function TodoList() {
  const [todos, setTodos] = useState<Todo[]>([]);
  const [input, setInput] = useState('');
  const [loaded, setLoaded] = useState(false);
  const [, setTick] = useState(0);
  const inputRef = useRef<HTMLInputElement>(null);
  const pendingTimers = useRef<Map<number, ReturnType<typeof setTimeout>>>(new Map());

  // Load from DB on mount
  useEffect(() => {
    window.api.todos.getAll().then((rows) => {
      const active = rows.filter((r) => !r.done);
      const done = rows.filter((r) => r.done);
      setTodos([...active, ...done].map((r) => ({ ...r, pending: false, completedAt: r.completedAt ?? null })));
      setLoaded(true);
    });
    inputRef.current?.focus();
    return () => {
      pendingTimers.current.forEach((t) => clearTimeout(t));
    };
  }, []);

  // Tick every second to update countdowns + auto-delete expired
  useEffect(() => {
    if (!loaded) return;
    const interval = setInterval(() => {
      const now = Date.now();
      setTodos((prev) => {
        const expired = prev.filter(
          (t) => t.done && t.completedAt && now - t.completedAt >= TWENTY_FOUR_HOURS
        );
        for (const t of expired) {
          window.api.todos.delete(t.id);
        }
        if (expired.length > 0) {
          return prev.filter(
            (t) => !(t.done && t.completedAt && now - t.completedAt >= TWENTY_FOUR_HOURS)
          );
        }
        return prev;
      });
      setTick((t) => t + 1);
    }, 1000);
    return () => clearInterval(interval);
  }, [loaded]);

  // Focus input once loaded
  useEffect(() => {
    if (loaded) inputRef.current?.focus();
  }, [loaded]);

  // Live refresh when a tool modifies todos from the main process
  useEffect(() => {
    const unsub = window.api.todos.onTodosChanged(() => {
      window.api.todos.getAll().then((rows) => {
        const active = rows.filter((r) => !r.done);
        const done = rows.filter((r) => r.done);
        setTodos([...active, ...done].map((r) => ({ ...r, pending: false, completedAt: r.completedAt ?? null })));
      });
    });
    return unsub;
  }, []);

  async function addTodo() {
    const text = input.trim();
    if (!text) return;
    const row = await window.api.todos.add(text);
    setTodos((prev) => [{ ...row, pending: false, completedAt: null }, ...prev]);
    setInput('');
    inputRef.current?.focus();
  }

  const handleRowClick = useCallback((id: number) => {
    setTodos((prev) => {
      const target = prev.find((t) => t.id === id);
      if (!target) return prev;

      // If already done, uncomplete immediately — move to top
      if (target.done) {
        clearTimerFor(id);
        window.api.todos.update(id, false);
        const without = prev.filter((t) => t.id !== id);
        return [{ ...target, done: false, pending: false, completedAt: null }, ...without];
      }

      // If pending (within grace period), cancel — revert to active
      if (target.pending) {
        clearTimerFor(id);
        return prev.map((t) => (t.id === id ? { ...t, pending: false } : t));
      }

      // Otherwise, start pending state — moves after 400ms
      const timer = setTimeout(() => {
        pendingTimers.current.delete(id);
        const completedAt = Date.now();
        window.api.todos.update(id, true);
        setTodos((curr) => {
          const updated = curr.map((t) =>
            t.id === id ? { ...t, done: true, pending: false, completedAt } : t
          );
          const active = updated.filter((t) => !t.done);
          const done = updated.filter((t) => t.done);
          return [...active, ...done];
        });
      }, 400);
      pendingTimers.current.set(id, timer);
      return prev.map((t) => (t.id === id ? { ...t, pending: true } : t));
    });
  }, []);

  function clearTimerFor(id: number) {
    const existing = pendingTimers.current.get(id);
    if (existing) {
      clearTimeout(existing);
      pendingTimers.current.delete(id);
    }
  }

  const isChecked = (todo: Todo) => todo.done || todo.pending;

  if (!loaded) return null;

  const activeTodos = todos.filter((t) => !t.done);
  const doneTodos = todos.filter((t) => t.done);

  return (
    <div className="flex flex-col h-full w-full px-3 pt-2 pb-3">
      {/* Input */}
      <div className="flex-shrink-0 mb-2 max-w-xs mx-auto">
        <input
          ref={inputRef}
          type="text"
          value={input}
          onChange={(e) => setInput(e.target.value)}
          onKeyDown={(e) => e.key === 'Enter' && addTodo()}
          placeholder="Add a todo..."
          data-autofocus="todos"
          className="w-full px-3 py-2 rounded-lg text-[13px] font-medium outline-none todo-input"
          style={{
            background: 'rgba(255,255,255,0.04)',
            border: '0.5px solid rgba(255,255,255,0.12)',
            color: 'rgba(255,255,255,0.85)',
          }}
        />
      </div>

      {/* List */}
      <div className="flex-1 min-h-0 overflow-y-auto auto-hide-scroll">
        <div className="flex flex-col gap-[1px]">
          {activeTodos.map((todo) => (
            <TodoRow key={todo.id} todo={todo} isChecked={isChecked} onClick={handleRowClick} />
          ))}

          {activeTodos.length > 0 && doneTodos.length > 0 && (
            <div
              style={{
                height: 1,
                margin: '6px 10px',
                background: 'rgba(255,255,255,0.06)',
                flexShrink: 0,
              }}
            />
          )}

          {doneTodos.map((todo) => (
            <TodoRow key={todo.id} todo={todo} isChecked={isChecked} onClick={handleRowClick} />
          ))}
        </div>
      </div>
    </div>
  );
}

function TodoRow({
  todo,
  isChecked,
  onClick,
}: {
  todo: Todo;
  isChecked: (todo: Todo) => boolean;
  onClick: (id: number) => void;
}) {
  const checked = isChecked(todo);

  return (
    <div
      className="todo-item"
      onClick={() => onClick(todo.id)}
      style={{
        display: 'flex',
        alignItems: 'center',
        gap: 10,
        padding: '8px 10px',
        borderRadius: 8,
        background: todo.done ? 'rgba(255,255,255,0.01)' : 'rgba(255,255,255,0.03)',
        opacity: todo.done ? 0.45 : 1,
        cursor: 'pointer',
        transition: 'background 0.3s ease, opacity 0.3s ease',
        userSelect: 'none',
      }}
    >
      <div
        className="todo-circle flex-shrink-0"
        style={{
          width: 18,
          height: 18,
          borderRadius: '50%',
          border: checked
            ? `1.5px solid rgba(120,220,120,${todo.done ? 0.2 : 0.5})`
            : '1.5px solid rgba(255,255,255,0.2)',
          background: checked ? `rgba(120,220,120,${todo.done ? 0.06 : 0.15})` : 'transparent',
          transition: 'all 0.2s ease',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
        }}
      >
        {checked && (
          <svg width="10" height="10" viewBox="0 0 10 10" fill="none">
            <path
              d="M2 5.5L4 7.5L8 3"
              stroke={`rgba(120,220,120,${todo.done ? 0.35 : 0.8})`}
              strokeWidth="1.5"
              strokeLinecap="round"
              strokeLinejoin="round"
            />
          </svg>
        )}
      </div>
      <span
        className="text-[13px] font-medium"
        style={{
          color: checked ? 'rgba(255,255,255,0.2)' : 'rgba(255,255,255,0.85)',
          textDecoration: checked ? 'line-through' : 'none',
          transition: 'color 0.3s ease',
          flex: 1,
          lineHeight: 1.4,
        }}
      >
        {todo.text}
      </span>
      {todo.done && todo.completedAt && (
        <span
          className="text-[11px]"
          style={{
            color: 'rgba(255,255,255,0.2)',
            flexShrink: 0,
            fontVariantNumeric: 'tabular-nums',
          }}
        >
          ({formatTimeLeft(todo.completedAt)})
        </span>
      )}
    </div>
  );
}
