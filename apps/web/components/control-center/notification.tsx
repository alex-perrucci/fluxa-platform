// PHASE_8_TRUE_CONTROL_CENTER
'use client';

interface ControlCenterNotificationProps {
  message: string | null;
  title?: string;
  tone?: 'error' | 'success' | 'info';
  onDismiss?: () => void;
}

export function ControlCenterNotification({
  message,
  title = 'Attenzione',
  tone = 'error',
  onDismiss,
}: ControlCenterNotificationProps) {
  if (!message) return null;

  return (
    <div
      aria-atomic="true"
      aria-live={tone === 'error' ? 'assertive' : 'polite'}
      className={`control-notification control-notification-${tone}`}
      role={tone === 'error' ? 'alert' : 'status'}
    >
      <span aria-hidden="true" className="control-notification-symbol">
        {tone === 'error' ? '!' : tone === 'success' ? '✓' : 'i'}
      </span>
      <div className="control-notification-copy">
        <strong>{title}</strong>
        <p>{message}</p>
      </div>
      {onDismiss ? (
        <button
          aria-label="Chiudi notifica"
          className="control-notification-close"
          onClick={onDismiss}
          type="button"
        >
          ×
        </button>
      ) : null}
    </div>
  );
}
