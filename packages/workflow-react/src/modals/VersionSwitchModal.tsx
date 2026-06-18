import { radii } from "../style/tokens.js";

export interface VersionSwitchModalProps {
  fromVersion: string;
  toVersion: string;
  warnings: string[];
  onConfirm: () => void;
  onCancel: () => void;
}

export function VersionSwitchModal({
  fromVersion,
  toVersion,
  warnings,
  onConfirm,
  onCancel,
}: VersionSwitchModalProps) {
  return (
    <div
      style={{
        position: "fixed",
        inset: 0,
        background: "rgba(15,23,42,0.4)",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        zIndex: 1000,
      }}
    >
      <div
        data-testid="version-switch-modal"
        style={{
          background: "white",
          borderRadius: 8,
          boxShadow: "0 8px 24px rgba(15,23,42,0.12)",
          maxWidth: 440,
          width: "100%",
          overflow: "hidden",
          fontFamily: "inherit",
        }}
      >
        <div style={{ padding: "16px 20px 0", display: "flex", alignItems: "flex-start", gap: 12 }}>
          <div
            style={{
              width: 32,
              height: 32,
              background: "#FEF3C7",
              borderRadius: "50%",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              flexShrink: 0,
              fontSize: 16,
            }}
          >
            ⚠️
          </div>
          <div>
            <div style={{ fontWeight: 600, fontSize: 14, color: "#0F172A", marginBottom: 4 }}>
              Switch to {toVersion}?
            </div>
            <div style={{ color: "#475569", lineHeight: 1.5, fontSize: 13 }}>
              Switching to {toVersion} will remove data not supported in that dialect:
            </div>
          </div>
        </div>

        <div
          style={{
            margin: "12px 20px 0 64px",
            padding: "10px 12px",
            background: "#FFF7ED",
            border: "1px solid #FED7AA",
            borderRadius: radii.sm,
            color: "#9A3412",
            fontSize: 12,
          }}
        >
          <div style={{ fontWeight: 600, marginBottom: 6 }}>Will be removed:</div>
          <ul style={{ margin: 0, paddingLeft: 16, lineHeight: 1.8 }}>
            {warnings.map((w, i) => (
              <li key={i}>{w}</li>
            ))}
          </ul>
        </div>

        <div style={{ padding: "10px 20px 0 64px", color: "#64748B", fontSize: 12, lineHeight: 1.5 }}>
          This cannot be undone. You can switch back to {fromVersion} any time, but the removed
          data will not be restored.
        </div>

        <div
          style={{
            padding: "16px 20px",
            display: "flex",
            justifyContent: "flex-end",
            gap: 8,
            borderTop: "1px solid #F1F5F9",
            marginTop: 16,
          }}
        >
          <button
            type="button"
            onClick={onCancel}
            data-testid="version-switch-cancel"
            style={{
              padding: "7px 16px",
              background: "white",
              border: "1px solid #CBD5E1",
              borderRadius: radii.sm,
              fontSize: 13,
              cursor: "pointer",
              color: "#475569",
            }}
          >
            Cancel
          </button>
          <button
            type="button"
            onClick={onConfirm}
            data-testid="version-switch-confirm"
            style={{
              padding: "7px 16px",
              background: "#DC2626",
              border: "none",
              borderRadius: radii.sm,
              fontSize: 13,
              color: "white",
              fontWeight: 500,
              cursor: "pointer",
            }}
          >
            Switch to {toVersion} and remove data
          </button>
        </div>
      </div>
    </div>
  );
}
