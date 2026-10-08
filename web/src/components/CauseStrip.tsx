export type CauseState = "idle" | "busy" | "ok" | "bad";

export function CauseStrip({ state, children }: { state: CauseState; children: React.ReactNode }) {
  return (
    <div className="cause" data-state={state} role="status" aria-live="polite">
      <span className="dot" />
      <span style={{ whiteSpace: "nowrap" }}>{children}</span>
    </div>
  );
}
