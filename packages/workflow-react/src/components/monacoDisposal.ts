// Monaco's editor.dispose() cancels internal async operations which surface as
// "Canceled" unhandled promise rejections — most visibly under React StrictMode's
// double-invoke cleanup. This shared helper suppresses ONLY those rejections,
// ONLY during the brief disposal window. Dev-only noise; no production effect.
let active = 0;
let installed = false;

function ensureInstalled(): void {
  if (installed || typeof window === "undefined") return;
  installed = true;
  window.addEventListener("unhandledrejection", (e) => {
    if (
      active > 0 &&
      (e.reason?.name === "Canceled" || String(e.reason).startsWith("Canceled"))
    ) {
      e.preventDefault();
    }
  });
}

/** Open a ~`windowMs` window during which Monaco "Canceled" rejections are swallowed. */
export function suppressMonacoDisposalRejections(windowMs = 100): void {
  ensureInstalled();
  active++;
  window.setTimeout(() => { active--; }, windowMs);
}
