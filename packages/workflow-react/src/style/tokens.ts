import type { CSSProperties } from "react";
import type { ValidationIssue } from "@cyoda/workflow-core";

export const colors = {
  border: "#CBD5E1",
  borderSubtle: "#E2E8F0",
  surface: "white",
  surfaceMuted: "#F8FAFC",
  textPrimary: "#0F172A",
  textSecondary: "#475569",
  textTertiary: "#64748B",
  primary: "#0F172A",
  primaryText: "white",
  danger: "#B91C1C",
  dangerBg: "#FEF2F2",
  dangerBorder: "#FCA5A5",
  warning: "#B45309",
  warningBg: "#FFFBEB",
  warningBorder: "#FCD34D",
  info: "#1D4ED8",
  infoBg: "#EFF6FF",
  infoBorder: "#93C5FD",
};

export const radii = { sm: 4, md: 6, lg: 8, pill: 999 };

export const btnStyle: CSSProperties = {
  padding: "4px 10px",
  background: colors.surface,
  border: `1px solid ${colors.border}`,
  borderRadius: radii.sm,
  fontSize: 13,
  cursor: "pointer",
  color: colors.textPrimary,
};

export const primaryBtnStyle: CSSProperties = {
  ...btnStyle,
  background: colors.primary,
  color: colors.primaryText,
  borderColor: colors.primary,
};

export const destructiveBtnStyle: CSSProperties = {
  ...btnStyle,
  background: colors.dangerBg,
  color: colors.danger,
  borderColor: colors.dangerBorder,
};

export const ghostBtnStyle: CSSProperties = {
  ...btnStyle,
  background: "transparent",
  borderColor: colors.borderSubtle,
};

type Severity = ValidationIssue["severity"];

export function severityBadgeStyle(severity: Severity): CSSProperties {
  const tone = severityTone(severity);
  return {
    padding: "3px 8px",
    background: tone.bg,
    border: `1px solid ${tone.border}`,
    color: tone.fg,
    borderRadius: radii.pill,
    fontSize: 12,
    fontWeight: 600,
    cursor: "pointer",
    display: "inline-flex",
    alignItems: "center",
    gap: 6,
  };
}

export function severityTone(severity: Severity): { bg: string; border: string; fg: string } {
  if (severity === "error") {
    return { bg: colors.dangerBg, border: colors.dangerBorder, fg: colors.danger };
  }
  if (severity === "warning") {
    return { bg: colors.warningBg, border: colors.warningBorder, fg: colors.warning };
  }
  return { bg: colors.infoBg, border: colors.infoBorder, fg: colors.info };
}

export const metaChipStyle: CSSProperties = {
  padding: "2px 6px",
  background: "#F1F5F9",
  border: `1px solid ${colors.borderSubtle}`,
  color: colors.textSecondary,
  borderRadius: radii.sm,
  fontSize: 11,
  fontWeight: 500,
};
