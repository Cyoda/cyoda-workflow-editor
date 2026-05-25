import { useEffect, useRef, useState, type ChangeEvent, type KeyboardEvent as ReactKeyboardEvent, type ReactNode } from "react";

/** Minimal uncontrolled field wrappers used by the per-selection forms. */
export function TextField({
  label,
  value,
  onCommit,
  disabled,
  placeholder,
  testId,
}: {
  label: string;
  value: string;
  onCommit: (next: string) => void;
  disabled?: boolean;
  placeholder?: string;
  testId?: string;
}) {
  const [draft, setDraft] = useState(value);

  useEffect(() => {
    setDraft(value);
  }, [value]);

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
  options,
  onChange,
  disabled,
  testId,
  small,
}: {
  value: T;
  options: ReadonlyArray<{ value: T; label: string }>;
  onChange: (next: T) => void;
  disabled?: boolean;
  testId?: string;
  small?: boolean;
}) {
  const [open, setOpen] = useState(false);
  const [highlightedIndex, setHighlightedIndex] = useState(-1);
  const containerRef = useRef<HTMLDivElement>(null);

  const selectedLabel = options.find((o) => o.value === value)?.label ?? value;
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
        setHighlightedIndex(options.findIndex((o) => o.value === value));
      } else if (highlightedIndex >= 0) {
        onChange(options[highlightedIndex]!.value);
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
        setHighlightedIndex((i) => Math.min(i + 1, options.length - 1));
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
        {options.map((o) => (
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
            border: "1px solid #CBD5E1",
            borderRadius: 4,
            boxShadow: "0 4px 12px rgba(15,23,42,0.12)",
            overflow: "hidden",
          }}
        >
          {options.map((opt, index) => (
            <div
              key={opt.value}
              role="option"
              aria-selected={opt.value === value}
              onMouseDown={(e) => {
                e.preventDefault();
                onChange(opt.value);
                setOpen(false);
              }}
              onMouseEnter={() => setHighlightedIndex(index)}
              style={{
                padding: optionPad,
                fontSize: optionFontSize,
                fontFamily: "inherit",
                cursor: "pointer",
                background:
                  highlightedIndex === index
                    ? "#F1F5F9"
                    : opt.value === value
                      ? "#EFF6FF"
                      : "white",
                color: opt.value === value ? "#1D4ED8" : "#0F172A",
              }}
            >
              {opt.label}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

export function FieldGroup({ title, children }: { title: string; children: ReactNode }) {
  return (
    <section style={{ display: "flex", flexDirection: "column", gap: 8 }}>
      <header style={{ fontSize: 11, fontWeight: 600, letterSpacing: "0.08em", textTransform: "uppercase", color: "#475569" }}>
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
  color: "#475569",
  marginBottom: 2,
};

const inputStyle = {
  padding: "6px 8px",
  fontSize: 13,
  fontFamily: "inherit",
  color: "inherit",
  border: "1px solid #CBD5E1",
  borderRadius: 4,
  background: "white",
};

const chevronBg = `url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='12' height='12' viewBox='0 0 12 12'%3E%3Cpolyline points='2,4 6,8 10,4' fill='none' stroke='%23475569' stroke-width='1.5' stroke-linecap='round' stroke-linejoin='round'/%3E%3C/svg%3E")`;

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
