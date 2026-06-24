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
// The filter self-installs at module load (the side effect at the bottom of
// this file), so it is armed before React renders any editor — and therefore
// before the very first StrictMode mount→dispose can fire a rejection.
// `installMonacoCancellationFilter()` is also exported and called at editor
// creation as a belt-and-suspenders / documentation point; both are idempotent.
//
// KNOWN LIMITATION (Firefox): this fully silences the noise in Chromium-family
// browsers, but Firefox's devtools logs "Uncaught (in promise) Canceled" from
// its own rejection tracking and does not reliably honor preventDefault() here.
// Those messages are benign (cancellation on dispose), dev-only (amplified by
// React StrictMode's double-mount), and have no effect on production or
// behavior — accepted as known Firefox dev-console noise.
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

// Self-install on import: importing this module (which the Monaco editor
// components do) arms the filter immediately, before any editor mounts.
installMonacoCancellationFilter();
