import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type CSSProperties,
} from "react";
import { useMessages } from "../../i18n/context.js";
import { useFieldHints } from "./FieldHintsContext.js";

export interface JsonPathInputProps {
  value: string;
  onChange: (next: string) => void;
  disabled?: boolean;
  hasError?: boolean;
  autoFocus?: boolean;
  inputStyle?: CSSProperties;
  testIdPrefix: string;
}

export function JsonPathInput({
  value,
  onChange,
  disabled,
  hasError,
  autoFocus,
  inputStyle,
  testIdPrefix,
}: JsonPathInputProps) {
  const messages = useMessages();
  const m = messages.criterion.hints;
  const {
    hasProvider,
    hasEntity,
    enabled,
    status,
    hints,
    error,
    load,
    reload,
  } = useFieldHints();

  const [open, setOpen] = useState(false);
  const [activeIdx, setActiveIdx] = useState(0);
  const wrapperRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (autoFocus && !disabled) inputRef.current?.focus();
  }, [autoFocus, disabled]);

  const filtered = useMemo(() => {
    if (!enabled || status !== "ready") return hints;
    const q = value.trim().toLowerCase();
    if (!q) return hints;
    return hints.filter((h) => h.jsonPath.toLowerCase().includes(q));
  }, [enabled, status, hints, value]);

  useEffect(() => {
    if (activeIdx > 0 && activeIdx >= filtered.length) setActiveIdx(0);
  }, [filtered.length, activeIdx]);

  useEffect(() => {
    if (!open) return;
    const onMouseDown = (e: MouseEvent) => {
      const target = e.target;
      if (!wrapperRef.current) return;
      if (target instanceof Node && wrapperRef.current.contains(target)) return;
      setOpen(false);
    };
    document.addEventListener("mousedown", onMouseDown);
    return () => document.removeEventListener("mousedown", onMouseDown);
  }, [open]);

  const showPanel = open && hasProvider && !disabled;

  const commit = useCallback(
    (path: string) => {
      onChange(path);
      setOpen(false);
    },
    [onChange],
  );

  const mergedInputStyle: CSSProperties | undefined = hasError
    ? { ...inputStyle, borderColor: "#FCA5A5" }
    : inputStyle;

  return (
    <div ref={wrapperRef} style={wrapperStyle}>
      <input
        ref={inputRef}
        type="text"
        value={value}
        disabled={disabled}
        onChange={(e) => {
          onChange(e.target.value);
          if (hasProvider) setOpen(true);
          if (enabled) load();
        }}
        onFocus={() => {
          if (!hasProvider) return;
          setOpen(true);
          if (enabled) load();
        }}
        onKeyDown={(e) => {
          if (!showPanel) return;
          if (e.key === "Escape") {
            e.preventDefault();
            setOpen(false);
            return;
          }
          if (!enabled || status !== "ready") return;
          if (e.key === "ArrowDown") {
            e.preventDefault();
            setActiveIdx((i) => Math.min(i + 1, Math.max(filtered.length - 1, 0)));
            return;
          }
          if (e.key === "ArrowUp") {
            e.preventDefault();
            setActiveIdx((i) => Math.max(i - 1, 0));
            return;
          }
          if (e.key === "Enter" && filtered.length > 0) {
            e.preventDefault();
            const idx = Math.min(activeIdx, filtered.length - 1);
            const choice = filtered[idx];
            if (choice) commit(choice.jsonPath);
          }
        }}
        style={mergedInputStyle}
        data-testid={`${testIdPrefix}-path`}
        aria-invalid={hasError ? true : undefined}
        aria-autocomplete={hasProvider ? "list" : undefined}
        aria-expanded={showPanel ? true : undefined}
        role={hasProvider ? "combobox" : undefined}
      />
      {showPanel && (
        <div
          style={panelStyle}
          data-testid={`${testIdPrefix}-path-hints`}
          role="listbox"
        >
          {!hasEntity && (
            <div
              style={hintRowStyle}
              data-testid={`${testIdPrefix}-path-hints-no-entity`}
            >
              {m.noEntity}
            </div>
          )}
          {hasEntity && status === "loading" && (
            <div
              style={hintRowStyle}
              data-testid={`${testIdPrefix}-path-hints-loading`}
            >
              {m.loading}
            </div>
          )}
          {hasEntity && status === "error" && (
            <div
              style={errorRowStyle}
              data-testid={`${testIdPrefix}-path-hints-error`}
            >
              <span>{error ?? m.error}</span>
              <button
                type="button"
                onMouseDown={(e) => {
                  e.preventDefault();
                  reload();
                }}
                style={retryBtnStyle}
                data-testid={`${testIdPrefix}-path-hints-retry`}
              >
                {m.retry}
              </button>
            </div>
          )}
          {hasEntity && status === "ready" && filtered.length === 0 && (
            <div
              style={hintRowStyle}
              data-testid={`${testIdPrefix}-path-hints-empty`}
            >
              {m.noMatches}
            </div>
          )}
          {hasEntity &&
            status === "ready" &&
            filtered.map((h, i) => {
              const active = i === activeIdx;
              return (
                <div
                  key={h.jsonPath}
                  style={active ? activeRowStyle : rowStyle}
                  data-testid={`${testIdPrefix}-path-hint-${i}`}
                  {...(active ? { "data-active": "true" } : {})}
                  role="option"
                  aria-selected={active}
                  onMouseDown={(e) => {
                    e.preventDefault();
                    commit(h.jsonPath);
                  }}
                  onMouseEnter={() => setActiveIdx(i)}
                >
                  <div style={rowMainStyle}>
                    <span style={pathTextStyle}>{h.jsonPath}</span>
                    <span style={typeTextStyle}>
                      {m.typeLabel.replace("{type}", h.type)}
                    </span>
                  </div>
                  {h.description && (
                    <div style={descTextStyle}>{h.description}</div>
                  )}
                </div>
              );
            })}
        </div>
      )}
    </div>
  );
}

const wrapperStyle: CSSProperties = { position: "relative" };

const panelStyle: CSSProperties = {
  position: "absolute",
  top: "100%",
  left: 0,
  right: 0,
  zIndex: 50,
  marginTop: 2,
  maxHeight: 220,
  overflowY: "auto",
  background: "white",
  border: "1px solid #CBD5E1",
  borderRadius: 4,
  boxShadow: "0 4px 12px rgba(15,23,42,0.08)",
  fontSize: 12,
};

const rowStyle: CSSProperties = {
  padding: "6px 8px",
  cursor: "pointer",
  borderBottom: "1px solid #F1F5F9",
};

const activeRowStyle: CSSProperties = {
  ...rowStyle,
  background: "#EFF6FF",
};

const rowMainStyle: CSSProperties = {
  display: "flex",
  justifyContent: "space-between",
  alignItems: "baseline",
  gap: 8,
};

const pathTextStyle: CSSProperties = {
  fontFamily: "ui-monospace, 'SF Mono', Menlo, monospace",
  color: "#0F172A",
};

const typeTextStyle: CSSProperties = {
  color: "#64748B",
  fontSize: 11,
};

const descTextStyle: CSSProperties = {
  marginTop: 2,
  color: "#475569",
  fontSize: 11,
};

const hintRowStyle: CSSProperties = {
  padding: "6px 8px",
  color: "#64748B",
  fontStyle: "italic",
};

const errorRowStyle: CSSProperties = {
  padding: "6px 8px",
  display: "flex",
  alignItems: "center",
  justifyContent: "space-between",
  gap: 8,
  color: "#B91C1C",
};

const retryBtnStyle: CSSProperties = {
  padding: "2px 6px",
  background: "white",
  border: "1px solid #FCA5A5",
  borderRadius: 4,
  color: "#B91C1C",
  fontSize: 11,
  cursor: "pointer",
};
