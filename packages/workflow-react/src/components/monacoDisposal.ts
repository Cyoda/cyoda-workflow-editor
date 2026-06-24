// Monaco cancels its in-flight async work (tokenization, word highlighting,
// hovers, schema validation) when an editor or model is disposed. Those
// cancellations surface as benign "Canceled" promise rejections — by design,
// not errors. They can land at an arbitrary later tick (e.g. a pending
// wordHighlighter request that resolves after the editor is gone), so a
// time-boxed suppression window is racy and machine-dependent: fast machines
// usually beat the timer, slower ones leak "Uncaught (in promise) Canceled".
//
// Instead, install ONE permanent listener that drops only Monaco's
// CancellationError ("Canceled") rejections and lets everything else through.
// Armed when a Monaco editor is created, so it is active before any disposal.
let installed = false;

// Monaco's CancellationError sets both `name` and `message` to exactly
// "Canceled" (monaco-editor/.../cancellation). Match on that precise shape only
// — deliberately NOT a loose String(reason).startsWith("Canceled"), which would
// also swallow legitimate string rejections like Promise.reject("Canceled by
// user") from the host app.
function isMonacoCanceled(reason: unknown): boolean {
  if (reason == null || typeof reason !== "object") return false;
  return (reason as { name?: unknown }).name === "Canceled";
}

/**
 * Idempotently install a global handler that suppresses Monaco's benign
 * "Canceled" disposal rejections, regardless of when they surface. Call this
 * when creating a Monaco editor so the handler is armed before any dispose.
 */
export function installMonacoCancellationFilter(): void {
  if (installed || typeof window === "undefined") return;
  installed = true;
  window.addEventListener("unhandledrejection", (e) => {
    if (isMonacoCanceled(e.reason)) e.preventDefault();
  });
}
