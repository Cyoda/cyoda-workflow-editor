import { useMessages } from "../i18n/context.js";
import { colors, radii } from "../style/tokens.js";

export interface ConflictBannerProps {
  onReload: () => void;
  onForceOverwrite: () => void;
}

/**
 * 409-conflict banner per spec §17.4. Non-dismissable; the user must pick
 * Reload (discard local) or Force overwrite (resend without the token).
 */
export function ConflictBanner({ onReload, onForceOverwrite }: ConflictBannerProps) {
  const messages = useMessages();
  return (
    <div
      style={{
        padding: "10px 14px",
        background: colors.warningBg,
        borderBottom: `1px solid ${colors.warning}`,
        color: colors.warning,
        fontSize: 13,
        display: "flex",
        alignItems: "center",
        gap: 12,
      }}
      role="alert"
      data-testid="conflict-banner"
    >
      <span style={{ flex: 1 }}>{messages.conflict.message}</span>
      <button
        type="button"
        onClick={onReload}
        style={btn}
        data-testid="conflict-reload"
      >
        {messages.conflict.reload}
      </button>
      <button
        type="button"
        onClick={onForceOverwrite}
        style={{ ...btn, background: colors.danger, color: "white", borderColor: colors.danger }}
        data-testid="conflict-force"
      >
        {messages.conflict.forceOverwrite}
      </button>
    </div>
  );
}

const btn = {
  padding: "4px 10px",
  background: "white",
  border: `1px solid ${colors.border}`,
  borderRadius: radii.sm,
  fontSize: 12,
  cursor: "pointer",
};
