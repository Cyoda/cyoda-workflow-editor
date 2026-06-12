import { useEffect, useRef, useState, type ChangeEvent, type KeyboardEvent as ReactKeyboardEvent, type ReactNode } from "react";
import { colors, radii } from "../style/tokens.js";

type SelectOptionItem<T extends string> = { value: T; label: string };
type SelectOptionGroup<T extends string> = { groupLabel: string; options: ReadonlyArray<SelectOptionItem<T>> };
type SelectRenderItem<T extends string> =
  | { kind: "header"; label: string }
  | { kind: "option"; value: T; label: string; flatIndex: number };

/** Minimal uncontrolled field wrappers used by the per-selection forms. */
export function TextField({
  label,
  value,
  onCommit,
  disabled,
  placeholder,
  testId,
  entityKey,
}: {
  label: string;
  value: string;
  onCommit: (next: string) => void;
  disabled?: boolean;
  placeholder?: string;
  testId?: string;
  /**
   * Identity of the entity being edited (e.g. a stable UUID). When this
   * changes, the draft resets to `value` even if `value` itself is
   * unchanged, so a different entity that happens to share the same
   * current value doesn't inherit a stale, uncommitted draft.
   */
  entityKey?: string;
}) {
  const [draft, setDraft] = useState(value);
  const syncKey = entityKey ?? value;
  const syncedKeyRef = useRef(syncKey);
  if (syncKey !== syncedKeyRef.current) {
    syncedKeyRef.current = syncKey;
    setDraft(value);
  }

  return (
    <label style={rowStyle}>
      <span style={labelStyle}>{label}</span>
      <input
        type="text"
        value={draft}
        disabled={disabled}
        placeholder={placeholder}
        data-testid={testId}
        onChange={(e) => setDraft(e.target.value)}
        onBlur={(e: ChangeEvent<HTMLInputElement>) => {
          if (draft !== value) onCommit(e.target.value);
        }}
        onKeyDown={(e) => {
          if (e.key === "Enter") (e.target as HTMLInputElement).blur();
        }}
        style={inputStyle}
      />
    </label>
  );
}

export function CheckboxField({
  label,
  checked,
  onChange,
  disabled,
  testId,
}: {
  label: string;
  checked: boolean;
  onChange: (next: boolean) => void;
  disabled?: boolean;
  testId?: string;
}) {
  return (
    <label style={{ ...rowStyle, flexDirection: "row", alignItems: "center", gap: 8 }}>
      <input
        type="checkbox"
        checked={checked}
        disabled={disabled}
        onChange={(e) => onChange(e.target.checked)}
        data-testid={testId}
      />
      <span style={{ ...labelStyle, marginBottom: 0 }}>{label}</span>
    </label>
  );
}

export function SelectField<T extends string>({
  label,
  value,
  options,
  onChange,
  disabled,
  testId,
}: {
  label: string;
  value: T;
  options: ReadonlyArray<{ value: T; label: string }>;
  onChange: (next: T) => void;
  disabled?: boolean;
  testId?: string;
}) {
  return (
    <label style={rowStyle}>
      <span style={labelStyle}>{label}</span>
      <CustomSelectInput
        value={value}
        options={options}
        onChange={onChange}
        disabled={disabled}
        testId={testId}
      />
    </label>
  );
}

/** Reusable custom dropdown without a label — use directly when you need a bare select. */
export function CustomSelectInput<T extends string>({
  value,
  options: optionsProp,
  groups,
  disabledOption,
  onChange,
  disabled,
  testId,
  small,
}: {
  value: T;
  options?: ReadonlyArray<SelectOptionItem<T>>;
  groups?: ReadonlyArray<SelectOptionGroup<T>>;
  /** Extra disabled option added to the hidden native select (e.g., legacy operators). */
  disabledOption?: SelectOptionItem<T>;
  onChange: (next: T) => void;
  disabled?: boolean;
  testId?: string;
  small?: boolean;
}) {
  const flatOptions: ReadonlyArray<SelectOptionItem<T>> = groups
    ? groups.flatMap((g) => g.options)
    : (optionsProp ?? []);

  const renderItems: SelectRenderItem<T>[] = [];
  if (groups) {
    let i = 0;
    for (const g of groups) {
      renderItems.push({ kind: "header", label: g.groupLabel });
      for (const o of g.options) {
        renderItems.push({ kind: "option", value: o.value, label: o.label, flatIndex: i++ });
      }
    }
  } else {
    flatOptions.forEach((o, i) =>
      renderItems.push({ kind: "option", value: o.value, label: o.label, flatIndex: i }),
    );
  }

  const [open, setOpen] = useState(false);
  const [highlightedIndex, setHighlightedIndex] = useState(-1);
  const containerRef = useRef<HTMLDivElement>(null);

  const selectedLabel = flatOptions.find((o) => o.value === value)?.label ?? value;
  const triggerStyle = small ? smallSelectStyle : selectTriggerStyle;
  const optionPad = small ? "4px 8px" : "6px 8px";
  const optionFontSize = small ? 12 : 13;

  useEffect(() => {
    if (!open) return;
    const handler = (e: MouseEvent) => {
      if (!containerRef.current?.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, [open]);

  const handleKeyDown = (e: ReactKeyboardEvent<HTMLDivElement>) => {
    if (disabled) return;
    if (e.key === "Enter" || e.key === " ") {
      e.preventDefault();
      if (!open) {
        setOpen(true);
        setHighlightedIndex(flatOptions.findIndex((o) => o.value === value));
      } else if (highlightedIndex >= 0) {
        onChange(flatOptions[highlightedIndex]!.value);
        setOpen(false);
      }
    } else if (e.key === "Escape") {
      setOpen(false);
    } else if (e.key === "ArrowDown") {
      e.preventDefault();
      if (!open) {
        setOpen(true);
        setHighlightedIndex(0);
      } else {
        setHighlightedIndex((i) => Math.min(i + 1, flatOptions.length - 1));
      }
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      setHighlightedIndex((i) => Math.max(i - 1, 0));
    }
  };

  return (
    <div ref={containerRef} style={{ position: "relative" }}>
      {/* Hidden native select keeps fireEvent.change compatibility in tests */}
      <select
        value={value}
        disabled={disabled}
        onChange={(e) => onChange(e.target.value as T)}
        data-testid={testId}
        style={{ display: "none" }}
        aria-hidden="true"
        tabIndex={-1}
      >
        {disabledOption && (
          <option value={disabledOption.value} disabled>{disabledOption.label}</option>
        )}
        {groups
          ? groups.map((g) => (
              <optgroup key={g.groupLabel} label={g.groupLabel}>
                {g.options.map((o) => (
                  <option key={o.value} value={o.value}>{o.label}</option>
                ))}
              </optgroup>
            ))
          : flatOptions.map((o) => (
              <option key={o.value} value={o.value}>{o.label}</option>
            ))}
      </select>

      {/* Custom visual trigger */}
      <div
        role="combobox"
        aria-expanded={open}
        aria-haspopup="listbox"
        tabIndex={disabled ? -1 : 0}
        onClick={() => !disabled && setOpen((o) => !o)}
        onKeyDown={handleKeyDown}
        style={{
          ...triggerStyle,
          opacity: disabled ? 0.5 : 1,
          cursor: disabled ? "not-allowed" : "pointer",
        }}
      >
        {selectedLabel}
      </div>

      {open && (
        <div
          role="listbox"
          style={{
            position: "absolute",
            top: "100%",
            left: 0,
            right: 0,
            zIndex: 200,
            marginTop: 2,
            background: "white",
            border: `1px solid ${colors.border}`,
            borderRadius: radii.sm,
            boxShadow: "0 4px 12px rgba(15,23,42,0.12)",
            overflow: "hidden",
            maxHeight: 280,
            overflowY: "auto",
          }}
        >
          {renderItems.map((item, i) =>
            item.kind === "header" ? (
              <div
                key={`header-${item.label}`}
                style={{
                  padding: "4px 8px 2px",
                  fontSize: 10,
                  fontWeight: 600,
                  letterSpacing: "0.06em",
                  textTransform: "uppercase",
                  color: colors.textTertiary,
                  background: colors.surfaceMuted,
                  borderTop: i > 0 ? `1px solid ${colors.borderSubtle}` : undefined,
                }}
              >
                {item.label}
              </div>
            ) : (
              <div
                key={item.value}
                role="option"
                aria-selected={item.value === value}
                onMouseDown={(e) => {
                  e.preventDefault();
                  onChange(item.value);
                  setOpen(false);
                }}
                onMouseEnter={() => setHighlightedIndex(item.flatIndex)}
                style={{
                  padding: optionPad,
                  fontSize: optionFontSize,
                  fontFamily: "inherit",
                  cursor: "pointer",
                  background:
                    highlightedIndex === item.flatIndex
                      ? colors.surfaceMuted
                      : item.value === value
                        ? colors.infoBg
                        : "white",
                  color: item.value === value ? colors.info : colors.textPrimary,
                }}
              >
                {item.label}
              </div>
            ),
          )}
        </div>
      )}
    </div>
  );
}

export function FieldGroup({ title, children }: { title: string; children: ReactNode }) {
  return (
    <section style={{ display: "flex", flexDirection: "column", gap: 8 }}>
      <header style={{ fontSize: 11, fontWeight: 600, letterSpacing: "0.08em", textTransform: "uppercase", color: colors.textSecondary }}>
        {title}
      </header>
      {children}
    </section>
  );
}

const rowStyle = {
  display: "flex",
  flexDirection: "column" as const,
  gap: 4,
};

const labelStyle = {
  fontSize: 12,
  color: colors.textSecondary,
  marginBottom: 2,
};

const inputStyle = {
  padding: "6px 8px",
  fontSize: 13,
  fontFamily: "inherit",
  color: "inherit",
  border: `1px solid ${colors.border}`,
  borderRadius: radii.sm,
  background: "white",
};

const chevronBg = `url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='12' height='12' viewBox='0 0 12 12'%3E%3Cpolyline points='2,4 6,8 10,4' fill='none' stroke='%23334155' stroke-width='1.5' stroke-linecap='round' stroke-linejoin='round'/%3E%3C/svg%3E")`;

const selectTriggerStyle = {
  ...inputStyle,
  paddingRight: 28,
  backgroundImage: chevronBg,
  backgroundRepeat: "no-repeat" as const,
  backgroundPosition: "right 8px center",
  userSelect: "none" as const,
};

const smallSelectStyle = {
  ...inputStyle,
  padding: "4px 24px 4px 6px",
  fontSize: 12,
  backgroundImage: chevronBg,
  backgroundRepeat: "no-repeat" as const,
  backgroundPosition: "right 6px center",
  userSelect: "none" as const,
};
