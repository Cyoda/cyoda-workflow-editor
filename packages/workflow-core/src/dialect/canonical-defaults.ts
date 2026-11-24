/**
 * Pre-schema coercion shared by every dialect. Runs before Zod validation on the
 * raw parsed value so the schema stays unchanged and round-trip semantics hold.
 *
 * Fills an ABSENT (or `null`) processor `type` with `"externalized"` — the
 * server's own documented default, so this is not lossy. Present values are
 * never rewritten:
 * a non-canonical value (`"EXTERNAL"`, `"internalized"`, …) is kept so the
 * document opens and the `processor-type-*` rules can point at it; cyoda-go
 * 0.9.0 refuses it at import. `""` is kept too (0.9.0 accepts it and stores
 * it as `externalized`).
 */
export function coerceCanonicalDefaults(value: unknown): unknown {
  if (!isObj(value)) return value;
  const v = value as Record<string, unknown>;
  if (!Array.isArray(v["workflows"])) return value;
  return {
    ...v,
    workflows: v["workflows"].map((wf) => {
      if (!isObj(wf)) return wf;
      const w = wf as Record<string, unknown>;
      if (!isObj(w["states"])) return wf;
      const states = w["states"] as Record<string, unknown>;
      const nextStates: Record<string, unknown> = {};
      for (const [code, state] of Object.entries(states)) {
        if (!isObj(state)) {
          nextStates[code] = state;
          continue;
        }
        const s = state as Record<string, unknown>;
        if (!Array.isArray(s["transitions"])) {
          nextStates[code] = state;
          continue;
        }
        nextStates[code] = {
          ...s,
          transitions: s["transitions"].map((t) => {
            if (!isObj(t)) return t;
            const tx = t as Record<string, unknown>;
            if (!Array.isArray(tx["processors"])) return t;
            return {
              ...tx,
              processors: tx["processors"].map((p) => {
                if (!isObj(p)) return p;
                const proc = p as Record<string, unknown>;
                // Present `type` is preserved verbatim — see doc comment.
                // `null` counts as absent (cyoda-go accepts `type: null` at
                // import with a 200); the trailing spread would otherwise put
                // the null straight back and the dialect's own null-stripping
                // runs after this pass, leaving `type` required-but-missing.
                if (proc["type"] !== undefined && proc["type"] !== null) return p;
                const { type: _type, ...rest } = proc;
                return { type: "externalized", ...rest };
              }),
            };
          }),
        };
      }
      return { ...w, states: nextStates };
    }),
  };
}

export function isObj(v: unknown): v is Record<string, unknown> {
  return typeof v === "object" && v !== null && !Array.isArray(v);
}
