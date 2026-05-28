import { useRef, useState } from "react";
import type { CommentMeta } from "@cyoda/workflow-core";

export interface CommentNodeProps {
  comment: CommentMeta;
  disabled?: boolean;
  onUpdate: (updates: Partial<CommentMeta>) => void;
  onRemove: () => void;
}

export function CommentNode({ comment, disabled, onUpdate, onRemove }: CommentNodeProps) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(comment.text);
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  const commitEdit = () => {
    setEditing(false);
    if (draft !== comment.text) onUpdate({ text: draft });
  };

  return (
    <div
      data-testid={`comment-${comment.id}`}
      style={{
        position: "absolute",
        left: comment.x,
        top: comment.y,
        minWidth: 120,
        maxWidth: 240,
        background: "#FEFCE8",
        border: "1px solid #FDE047",
        borderRadius: 4,
        padding: 8,
        boxShadow: "2px 2px 6px rgba(0,0,0,0.08)",
        fontSize: 12,
        zIndex: 10,
        cursor: "default",
        userSelect: "none",
      }}
    >
      <div style={{ display: "flex", justifyContent: "flex-end", gap: 4, marginBottom: 4 }}>
        {!disabled && !editing && (
          <button
            type="button"
            onClick={() => { setDraft(comment.text); setEditing(true); setTimeout(() => textareaRef.current?.focus(), 0); }}
            style={iconBtn}
            title="Edit comment"
            data-testid={`comment-edit-${comment.id}`}
          >
            ✏️
          </button>
        )}
        {!disabled && (
          <button
            type="button"
            onClick={onRemove}
            style={{ ...iconBtn, color: "#B91C1C" }}
            title="Remove comment"
            data-testid={`comment-remove-${comment.id}`}
          >
            ×
          </button>
        )}
      </div>
      {editing ? (
        <textarea
          ref={textareaRef}
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          onBlur={commitEdit}
          onKeyDown={(e) => { if (e.key === "Enter" && e.metaKey) commitEdit(); if (e.key === "Escape") { setEditing(false); setDraft(comment.text); } }}
          rows={3}
          style={{
            width: "100%",
            border: "none",
            background: "transparent",
            resize: "vertical",
            fontSize: 12,
            fontFamily: "inherit",
            outline: "none",
          }}
          data-testid={`comment-textarea-${comment.id}`}
        />
      ) : (
        <div
          onDoubleClick={() => { if (!disabled) { setDraft(comment.text); setEditing(true); } }}
          style={{ whiteSpace: "pre-wrap", wordBreak: "break-word", minHeight: 20 }}
        >
          {comment.text || <em style={{ color: "#94a3b8" }}>empty note</em>}
        </div>
      )}
    </div>
  );
}

const iconBtn: React.CSSProperties = {
  background: "none",
  border: "none",
  cursor: "pointer",
  padding: "0 2px",
  fontSize: 12,
  lineHeight: 1,
  color: "#64748b",
};
