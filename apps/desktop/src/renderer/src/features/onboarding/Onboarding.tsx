import { useState, useEffect, useCallback } from 'react';

interface OnboardingProps {
  onComplete: () => void;
}

interface SetupStatus {
  apiKey: boolean;
  screenRecording: 'granted' | 'denied' | 'not-determined';
}

export function Onboarding({ onComplete }: OnboardingProps) {
  const [status, setStatus] = useState<SetupStatus>({
    apiKey: false,
    screenRecording: 'not-determined',
  });

  const checkStatus = useCallback(async () => {
    const [apiKey, screenRecording] = await Promise.all([
      window.api.settings.hasApiKey('anthropic'),
      window.api.system.getScreenRecordingStatus(),
    ]);
    setStatus({ apiKey, screenRecording });
  }, []);

  useEffect(() => {
    checkStatus();
    const interval = setInterval(checkStatus, 2000);
    return () => clearInterval(interval);
  }, [checkStatus]);

  const screenOk = status.screenRecording === 'granted';
  const canContinue = status.apiKey;

  return (
    <div className="h-full flex items-center justify-center p-6">
      <div className="w-full max-w-xs space-y-6">
        <div>
          <h2 className="text-[13px] font-medium text-white/85 tracking-tight mb-1">setup</h2>
          <p className="text-[10px] text-white/25 font-mono">configure these before using saffron</p>
        </div>

        <div className="space-y-3">
          {/* API Key */}
          <SetupItem
            label="API key"
            detail="set ANTHROPIC_API_KEY in apps/desktop/.env"
            done={status.apiKey}
            required
          />

          {/* Screen Recording */}
          <SetupItem
            label="screen recording"
            detail={
              screenOk
                ? 'permission granted'
                : 'needed for automatic screenshots'
            }
            done={screenOk}
            action={
              !screenOk
                ? {
                    label: 'open settings',
                    onClick: () => window.api.system.openScreenRecordingPrefs(),
                  }
                : undefined
            }
          />
        </div>

        {!screenOk && status.screenRecording !== 'not-determined' && (
          <p className="text-[9px] text-white/15 font-mono">
            restart the app after granting screen recording
          </p>
        )}

        <button
          onClick={onComplete}
          disabled={!canContinue}
          className={`w-full py-2 rounded-md font-mono text-[11px] transition-all duration-150 ${
            canContinue
              ? 'bg-white/[0.08] border border-white/[0.14] text-white/85 hover:bg-white/[0.12]'
              : 'bg-white/[0.02] border border-white/[0.06] text-white/20 cursor-not-allowed'
          }`}
        >
          continue
        </button>
      </div>
    </div>
  );
}

function SetupItem({
  label,
  detail,
  done,
  required,
  action,
}: {
  label: string;
  detail: string;
  done: boolean;
  required?: boolean;
  action?: { label: string; onClick: () => void };
}) {
  return (
    <div className="backdrop-blur-xl border border-white/[0.08] rounded-lg p-3 hover:border-white/[0.12] transition-colors duration-150" style={{ background: 'rgba(18, 18, 18, var(--fg-opacity, 0.85))' }}>
      <div className="flex items-center gap-2 mb-1">
        <div
          className={`w-1.5 h-1.5 rounded-full flex-shrink-0 ${
            done ? 'bg-green-400/80' : 'bg-white/15'
          }`}
        />
        <span className="text-[11px] text-white/50 font-mono flex-1">{label}</span>
        {required && !done && (
          <span className="text-[8px] text-red-400/60 font-mono">required</span>
        )}
      </div>
      <p className="text-[9px] text-white/20 font-mono ml-3.5">{detail}</p>
      {action && (
        <button
          onClick={action.onClick}
          className="mt-2 ml-3.5 px-2.5 py-1 rounded-[5px] border border-white/[0.06] bg-white/[0.04] text-[9px] text-white/40 font-mono hover:border-white/[0.14] hover:text-white/70 transition-all duration-150"
        >
          {action.label}
        </button>
      )}
    </div>
  );
}
