import { useEffect, useRef } from "react";
import type { PartyFeedback } from "./use-party-session";

type FeedbackToastProps = {
  feedback: PartyFeedback;
  onDismiss: () => void;
};

export function FeedbackToast({
  feedback,
  onDismiss,
}: FeedbackToastProps) {
  const dismissRef = useRef(onDismiss);
  dismissRef.current = onDismiss;

  useEffect(() => {
    const timeoutId = window.setTimeout(() => dismissRef.current(), 3_000);
    return () => window.clearTimeout(timeoutId);
  }, [feedback.message]);

  return (
    <div className="toast" role="status" aria-live="polite">
      <span className="toast-icon" aria-hidden="true">
        <svg viewBox="0 0 24 24">
          <path d="m6.5 12.5 3.25 3.25L17.5 8" />
        </svg>
      </span>
      <span>{feedback.message}</span>
      <button
        className="toast-close"
        type="button"
        aria-label="Dismiss notification"
        onClick={onDismiss}
      >
        <svg aria-hidden="true" viewBox="0 0 24 24">
          <path d="m7 7 10 10M17 7 7 17" />
        </svg>
      </button>
    </div>
  );
}
