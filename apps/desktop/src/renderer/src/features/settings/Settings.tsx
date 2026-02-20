import { useEffect, useState, useCallback } from 'react';
import { useSettings } from './useSettings';
import { Spinner } from '../../shared/components/Spinner';
import type { ApiKeyService } from '@app/api';

interface SettingsProps {
  onApiKeySet?: () => void;
  onBack?: () => void;
}

type Position = 'top' | 'bottom' | 'left' | 'right';

const MODEL_DISPLAY_NAMES: Record<string, string> = {
  'claude-haiku-4-5-20251001': 'Haiku 4.5',
  'claude-sonnet-4-5-20250929': 'Sonnet 4.5',
  'claude-opus-4-6': 'Opus 4.6',
};

function formatModelName(model: string | undefined): string {
  if (!model) return '\u2014';
  return MODEL_DISPLAY_NAMES[model] ?? model;
}

const API_KEY_SERVICES: { service: ApiKeyService; label: string; envVar: string; required?: boolean }[] = [
  { service: 'anthropic', label: 'anthropic', envVar: 'ANTHROPIC_API_KEY', required: true },
  { service: 'replicate', label: 'replicate', envVar: 'REPLICATE_API_TOKEN' },
];

export function Settings({ onApiKeySet, onBack }: SettingsProps) {
  const { apiKeyStatuses, settings, isLoading, error, loadSettings } =
    useSettings();
  const [opacity, setOpacity] = useState(0.95);
  const [fgOpacity, setFgOpacity] = useState(0.85);
  const [position, setPosition] = useState<Position>('bottom');

  useEffect(() => {
    loadSettings();
    window.api.system.getOpacity().then(setOpacity);
    window.api.system.getFgOpacity().then(setFgOpacity);
    window.api.system.getPosition().then(setPosition);
  }, [loadSettings]);

  useEffect(() => {
    const cleanup = window.api.system.onOpacityChanged((v) => setOpacity(v));
    return cleanup;
  }, []);

  useEffect(() => {
    const cleanup = window.api.system.onFgOpacityChanged((v) => setFgOpacity(v));
    return cleanup;
  }, []);

  const handleOpacityChange = useCallback((value: number) => {
    setOpacity(value);
    window.api.system.setOpacity(value);
  }, []);

  const handleFgOpacityChange = useCallback((value: number) => {
    setFgOpacity(value);
    window.api.system.setFgOpacity(value);
  }, []);

  const handlePositionChange = useCallback((pos: Position) => {
    setPosition(pos);
    window.api.system.setPosition(pos);
  }, []);

  // Check if anthropic key is set and notify parent
  useEffect(() => {
    if (apiKeyStatuses.anthropic && onApiKeySet) {
      onApiKeySet();
    }
  }, [apiKeyStatuses.anthropic, onApiKeySet]);

  if (isLoading && !settings) {
    return (
      <div className="flex items-center justify-center h-full">
        <Spinner />
      </div>
    );
  }

  const isWide = position === 'top' || position === 'bottom';

  return (
    <div className="h-full overflow-y-auto overflow-x-hidden p-4 [&::-webkit-scrollbar]:w-1 [&::-webkit-scrollbar-track]:bg-transparent [&::-webkit-scrollbar-thumb]:bg-white/[0.08] [&::-webkit-scrollbar-thumb]:rounded-full">
      {/* Header */}
      <div className="flex items-center gap-2.5 mb-4">
        {onBack && (
          <button
            onClick={onBack}
            className="w-7 h-7 rounded-md border border-white/[0.06] bg-white/[0.02] text-white/40 hover:text-white/70 hover:border-white/[0.14] flex items-center justify-center transition-all duration-150 text-sm"
          >
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <line x1="19" y1="12" x2="5" y2="12" />
              <polyline points="12 19 5 12 12 5" />
            </svg>
          </button>
        )}
        <h2 className="text-[13px] font-medium text-white/85 tracking-tight">settings</h2>
      </div>

      {error && (
        <div className="mb-3 p-2.5 bg-red-500/[0.06] border border-red-500/10 rounded-lg">
          <p className="text-[10px] text-red-300/80 font-mono">{error}</p>
        </div>
      )}

      {/* Tiles Grid */}
      <div className={
        isWide
          ? 'grid grid-cols-[1fr_1fr_1fr_1fr] gap-2 auto-rows-min'
          : 'grid grid-cols-2 gap-2 auto-rows-min'
      }>

        {/* API Keys */}
        <Tile label="api keys" className="col-span-2">
          <div className="space-y-2.5">
            {API_KEY_SERVICES.map(({ service, label, envVar, required }) => (
              <APIKeyStatus
                key={service}
                label={label}
                envVar={envVar}
                isSet={apiKeyStatuses[service]}
                required={required}
              />
            ))}
          </div>
          <p className="text-[9px] text-white/15 font-mono mt-2.5">set keys in <span className="text-white/30">apps/desktop/.env</span></p>
        </Tile>

        {/* Model */}
        <Tile label="model">
          <div className="text-[13px] font-medium text-white/85 mb-0.5">
            {formatModelName(settings?.model)}
          </div>
          <div className="text-[10px] text-white/20">fast · vision</div>
        </Tile>

        {/* Position */}
        <Tile label="position">
          <PositionPad value={position} onChange={handlePositionChange} />
        </Tile>

        {/* Background Opacity */}
        <Tile label="background">
          <OpacitySlider value={opacity} onChange={handleOpacityChange} label="bg" />
        </Tile>

        {/* Foreground Opacity */}
        <Tile label="foreground">
          <OpacitySlider value={fgOpacity} onChange={handleFgOpacityChange} label="fg" />
        </Tile>

        {/* Shortcuts */}
        <Tile label="shortcuts">
          <ShortcutList />
        </Tile>

        {/* System */}
        <Tile label="system">
          <SystemStatus anthropicSet={apiKeyStatuses.anthropic} />
        </Tile>

        {/* Quit / Uninstall */}
        <Tile className="col-span-2" noPadLabel>
          <div className="flex gap-2">
            <QuitButton />
            <UninstallButton />
          </div>
        </Tile>
      </div>
    </div>
  );
}

/* ── Tile wrapper ── */
function Tile({ label, className = '', noPadLabel, children }: {
  label?: string;
  className?: string;
  noPadLabel?: boolean;
  children: React.ReactNode;
}) {
  return (
    <div className={`backdrop-blur-xl border border-white/[0.08] rounded-lg p-3 hover:border-white/[0.12] transition-colors duration-150 ${className}`} style={{ background: `rgba(18, 18, 18, var(--fg-opacity, 0.85))` }}>
      {label && (
        <div className="text-[9px] font-medium tracking-[1.5px] uppercase text-white/20 mb-2.5 font-mono">
          {label}
        </div>
      )}
      {children}
    </div>
  );
}

/* ── API Key Status ── */
function APIKeyStatus({ label, envVar, isSet, required }: {
  label: string;
  envVar: string;
  isSet: boolean;
  required?: boolean;
}) {
  return (
    <div className="flex items-center gap-2">
      <div className={`w-1.5 h-1.5 rounded-full flex-shrink-0 ${
        isSet ? 'bg-green-400/80' : 'bg-white/15'
      }`} />
      <span className="text-[11px] text-white/50 font-mono flex-1">{label}</span>
      <span className="text-[9px] text-white/20 font-mono">{envVar}</span>
      {required && !isSet && (
        <span className="text-[8px] text-red-400/60 font-mono">missing</span>
      )}
    </div>
  );
}

/* ── Position Pad ── */
function PositionPad({ value, onChange }: {
  value: Position;
  onChange: (pos: Position) => void;
}) {
  const positions: Position[] = ['top', 'left', 'right', 'bottom'];
  const labels: Record<Position, string> = { top: 'top \u2318\u2191', bottom: 'btm \u2318\u2193', left: 'left \u2318\u2190', right: 'right \u2318\u2192' };

  return (
    <div>
      <div className="grid grid-cols-3 grid-rows-3 gap-1 w-fit mx-auto" style={{
        gridTemplateAreas: `". top ." "left center right" ". bottom ."`,
      }}>
        {positions.map((pos) => (
          <button
            key={pos}
            onClick={() => onChange(pos)}
            style={{ gridArea: pos }}
            className={`w-16 h-6 rounded text-[9px] font-mono transition-all duration-150 ${
              value === pos
                ? 'bg-white/[0.06] border border-white/[0.14] text-white/85'
                : 'bg-white/[0.02] border border-white/[0.06] text-white/20 hover:border-white/[0.14] hover:text-white/40'
            }`}
          >
            {labels[pos]}
          </button>
        ))}
        <div style={{ gridArea: 'center' }} className="w-16 h-6 flex items-center justify-center">
          <div className="w-1 h-1 rounded-full bg-white/20" />
        </div>
      </div>
      <div className="text-center text-[10px] text-white/20 font-mono mt-2">
        {value}
      </div>
    </div>
  );
}

/* ── Opacity Slider ── */
function OpacitySlider({ value, onChange, label }: {
  value: number;
  onChange: (v: number) => void;
  label?: string;
}) {
  const pct = Math.round(value * 100);

  return (
    <div>
      <div className="flex items-center justify-between mb-2.5">
        <div>
          <span className="text-xl font-light text-white/85 tracking-tight">{pct}</span>
          <span className="text-[11px] text-white/20 ml-0.5">%</span>
        </div>
        {label === 'bg' && (
          <span className="text-[9px] text-white/20 font-mono">\u2318\u21E7T</span>
        )}
      </div>
      <input
        type="range"
        min="10"
        max="100"
        step="5"
        value={pct}
        onChange={(e) => onChange(Number(e.target.value) / 100)}
        className="w-full h-[2px] bg-white/[0.06] rounded-sm appearance-none cursor-pointer outline-none [&::-webkit-slider-thumb]:appearance-none [&::-webkit-slider-thumb]:w-2.5 [&::-webkit-slider-thumb]:h-2.5 [&::-webkit-slider-thumb]:rounded-full [&::-webkit-slider-thumb]:bg-white/85 [&::-webkit-slider-thumb]:cursor-pointer [&::-webkit-slider-thumb]:hover:shadow-[0_0_0_4px_rgba(255,255,255,0.06)]"
      />
      <div className="flex justify-between mt-1.5 text-[8px] text-white/20 font-mono">
        <span>transparent</span>
        <span>solid</span>
      </div>
    </div>
  );
}

/* ── Shortcuts ── */
function ShortcutList() {
  const shortcuts = [
    { name: 'toggle', keys: '\u2318 `' },
    { name: 'submit', keys: '\u2318 \u21B5' },
    { name: 'screenshot', keys: '\u2318 ]' },
    { name: 'opacity', keys: '\u2318\u21E7T' },
  ];

  return (
    <div>
      {shortcuts.map((s, i) => (
        <div
          key={s.name}
          className={`flex items-center justify-between py-1.5 ${
            i > 0 ? 'border-t border-white/[0.03]' : ''
          }`}
        >
          <span className="text-[11px] text-white/40">{s.name}</span>
          <span className="text-[10px] text-white/20 bg-white/[0.03] border border-white/[0.04] rounded-[3px] px-1.5 py-0.5 font-mono">
            {s.keys}
          </span>
        </div>
      ))}
    </div>
  );
}

/* ── System Status ── */
function SystemStatus({ anthropicSet }: { anthropicSet: boolean }) {
  const [version, setVersion] = useState('');

  useEffect(() => {
    window.api.system.getAppVersion().then(setVersion);
  }, []);

  const rows = [
    { key: 'app', val: 'saffron', className: '' },
    { key: 'build', val: version || '\u2014', className: '' },
    { key: 'api', val: anthropicSet ? 'connected' : 'disconnected', className: anthropicSet ? 'text-green-400/80' : 'text-red-400/60' },
  ];

  return (
    <div>
      {rows.map((r, i) => (
        <div
          key={r.key}
          className={`flex justify-between items-center py-1 ${
            i > 0 ? 'border-t border-white/[0.03]' : ''
          }`}
        >
          <span className="text-[10px] text-white/20 font-mono">{r.key}</span>
          <span className={`text-[10px] text-white/40 font-mono ${r.className}`}>{r.val}</span>
        </div>
      ))}
    </div>
  );
}

/* ── Quit Button ── */
function QuitButton() {
  const [confirming, setConfirming] = useState(false);

  function handleClick() {
    if (confirming) {
      window.api.system.quit();
    } else {
      setConfirming(true);
      setTimeout(() => setConfirming(false), 2000);
    }
  }

  return (
    <button
      onClick={handleClick}
      className={`flex-1 py-2 rounded-md font-mono text-[11px] transition-all duration-150 ${
        confirming
          ? 'bg-red-400/10 border border-red-400/20 text-red-400/80'
          : 'bg-red-400/[0.06] border border-red-400/10 text-red-400/60 hover:bg-red-400/10 hover:border-red-400/[0.18]'
      }`}
    >
      {confirming ? 'confirm quit?' : 'quit'}
    </button>
  );
}

/* ── Uninstall Button ── */
function UninstallButton() {
  const [confirming, setConfirming] = useState(false);

  function handleClick() {
    if (confirming) {
      window.api.system.uninstall();
    } else {
      setConfirming(true);
      setTimeout(() => setConfirming(false), 3000);
    }
  }

  return (
    <button
      onClick={handleClick}
      className={`flex-1 py-2 rounded-md font-mono text-[11px] transition-all duration-150 ${
        confirming
          ? 'bg-red-400/10 border border-red-400/20 text-red-400/80'
          : 'bg-white/[0.02] border border-white/[0.06] text-white/25 hover:border-white/[0.12] hover:text-white/40'
      }`}
    >
      {confirming ? 'delete all data & remove?' : 'uninstall'}
    </button>
  );
}
