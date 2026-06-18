import { useEffect, useRef, useState } from "react";
import { colors, radii } from "../style/tokens.js";

export interface VersionBadgeProps {
  version: string;
  supportedVersions: readonly string[];
  readOnly?: boolean;
  onVersionChange?: (version: string) => void;
}

export function VersionBadge({
  version,
  supportedVersions,
  readOnly = false,
  onVersionChange,
}: VersionBadgeProps) {
  const [open, setOpen] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const handler = (e: MouseEvent) => {
      if (!containerRef.current?.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, [open]);

  // hooks must precede early return (React rules of hooks)
  if (readOnly) {
    return (
      <div
        data-testid="version-badge"
        style={{
          padding: "3px 9px",
          background: "#F1F5F9",
          color: colors.textTertiary,
          border: `1px solid ${colors.borderSubtle}`,
          borderRadius: radii.sm,
          fontSize: 12,
          fontWeight: 600,
          whiteSpace: "nowrap",
        }}
      >
        {version}
      </div>
    );
  }

  return (
    <div ref={containerRef} style={{ position: "relative" }}>
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        data-testid="version-badge"
        style={{
          display: "flex",
          alignItems: "center",
          gap: 4,
          padding: "3px 9px",
          background: open ? "#DBEAFE" : colors.infoBg,
          color: colors.info,
          border: `1px solid ${open ? colors.infoBorder : "#BFDBFE"}`,
          borderRadius: open ? "4px 4px 0 0" : radii.sm,
          fontSize: 12,
          fontWeight: 600,
          cursor: "pointer",
          whiteSpace: "nowrap",
        }}
      >
        {version}
        <span style={{ fontSize: 10, opacity: 0.7 }}>{open ? "▴" : "▾"}</span>
      </button>

      {open && (
        <div
          data-testid="version-dropdown"
          style={{
            position: "absolute",
            right: 0,
            top: "100%",
            background: "white",
            border: "1px solid #E2E8F0",
            borderTop: "none",
            borderRadius: "0 0 6px 6px",
            boxShadow: "0 4px 12px rgba(15,23,42,0.10)",
            minWidth: 200,
            fontSize: 13,
            overflow: "hidden",
            zIndex: 100,
          }}
        >
          <div
            style={{
              padding: "6px 10px 4px",
              fontSize: 10,
              fontWeight: 600,
              letterSpacing: "0.06em",
              textTransform: "uppercase",
              color: "#94A3B8",
              borderBottom: "1px solid #F1F5F9",
            }}
          >
            Dialect version — applies to all workflows
          </div>
          {[...supportedVersions].reverse().map((v) => {
            // version prop may carry a "v" prefix (e.g. "v0.8"); supportedVersions entries never do.
            const isCurrent = v === version.replace(/^v/, "");
            return (
              <button
                key={v}
                type="button"
                data-testid={`version-option-${v}`}
                onClick={() => {
                  setOpen(false);
                  if (!isCurrent) onVersionChange?.(v);
                }}
                style={{
                  width: "100%",
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "space-between",
                  padding: "8px 12px",
                  background: isCurrent ? "#EFF6FF" : "white",
                  color: isCurrent ? "#1D4ED8" : "#475569",
                  border: "none",
                  cursor: isCurrent ? "default" : "pointer",
                  fontSize: 13,
                  textAlign: "left",
                }}
              >
                <span>
                  {v}{" "}
                  <span style={{ fontSize: 11, color: isCurrent ? "#93C5FD" : "#94A3B8" }}>
                    cyoda-go {v}.x
                  </span>
                </span>
                {isCurrent && (
                  <span
                    style={{
                      fontSize: 11,
                      background: "#1D4ED8",
                      color: "white",
                      padding: "1px 6px",
                      borderRadius: 3,
                      fontWeight: 600,
                    }}
                  >
                    current
                  </span>
                )}
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
}
