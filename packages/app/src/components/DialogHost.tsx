"use client";

import React, { useEffect, useRef, useState } from "react";
import {
  closeDialog,
  dismissToast,
  getDialog,
  getToasts,
  resolveConfirm,
  resolvePrompt,
  subscribeToDialog,
  type DialogState,
  type ToastState,
} from "../dialogs/host";

export function DialogHost() {
  const [tick, setTick] = useState(0);
  useEffect(() => subscribeToDialog(() => setTick((t) => t + 1)), []);
  const dialog = getDialog();
  const toasts = getToasts();
  return (
    <>
      {dialog && <DialogBody dialog={dialog} key={dialog.id} />}
      {toasts.length > 0 && <ToastStack toasts={toasts} />}
      {/* eslint-disable-next-line @typescript-eslint/no-unused-expressions */}
      {tick}
    </>
  );
}

function DialogBody({ dialog }: { dialog: DialogState }) {
  const [value, setValue] = useState(dialog.kind === "prompt" ? dialog.initialValue : "");
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    queueMicrotask(() => {
      if (inputRef.current) {
        inputRef.current.focus();
        const v = inputRef.current.value;
        const dotIdx = v.lastIndexOf(".");
        if (dotIdx > 0) inputRef.current.setSelectionRange(0, dotIdx);
        else inputRef.current.select();
      }
    });
  }, []);

  const submit = () => {
    if (dialog.kind === "prompt") {
      if (!value.trim()) { closeDialog(); return; }
      resolvePrompt(value);
    } else {
      resolveConfirm(true);
    }
  };
  const cancel = () => closeDialog();

  return (
    <div style={styles.backdrop} onClick={cancel}>
      <div style={styles.modal} onClick={(e) => e.stopPropagation()} onKeyDown={(e) => {
        if (e.key === "Escape") { e.preventDefault(); cancel(); }
        if (e.key === "Enter") { e.preventDefault(); submit(); }
      }}>
        <div style={styles.title}>{dialog.title}</div>
        {dialog.description && <div style={styles.description}>{dialog.description}</div>}
        {dialog.kind === "prompt" && (
          <input
            ref={inputRef}
            style={styles.input}
            value={value}
            onChange={(e) => setValue(e.target.value)}
            placeholder={dialog.placeholder}
            spellCheck={false}
            autoCapitalize="off"
            autoComplete="off"
          />
        )}
        <div style={styles.actions}>
          <button style={styles.cancel} onClick={cancel}>Cancel</button>
          <button
            style={
              dialog.kind === "confirm" && dialog.danger
                ? { ...styles.confirm, ...styles.danger }
                : styles.confirm
            }
            onClick={submit}
            autoFocus={dialog.kind === "confirm"}
          >
            {dialog.confirmLabel ?? "OK"}
          </button>
        </div>
      </div>
    </div>
  );
}

function ToastStack({ toasts }: { toasts: ToastState[] }) {
  return (
    <div style={styles.toastStack}>
      {toasts.map((t) => (
        <div
          key={t.id}
          style={{ ...styles.toast, ...(t.level === "error" ? styles.toastError : {}) }}
          onClick={() => dismissToast(t.id)}
        >
          {t.message}
        </div>
      ))}
    </div>
  );
}

const styles: Record<string, React.CSSProperties> = {
  backdrop: {
    position: "fixed",
    inset: 0,
    background: "rgba(0,0,0,0.55)",
    display: "flex",
    alignItems: "flex-start",
    justifyContent: "center",
    paddingTop: "22vh",
    zIndex: 30000,
    fontFamily: "system-ui, -apple-system, sans-serif",
  },
  modal: {
    width: 420,
    maxWidth: "92vw",
    background: "#1a1a2e",
    border: "1px solid #3a3a5a",
    borderRadius: 6,
    padding: "16px 18px",
    color: "#e8e8f0",
    boxShadow: "0 10px 40px rgba(0,0,0,0.6)",
  },
  title: {
    fontSize: 14,
    fontWeight: 600,
    marginBottom: 4,
  },
  description: {
    fontSize: 12,
    color: "#9a9ac0",
    marginBottom: 10,
    lineHeight: 1.4,
  },
  input: {
    width: "100%",
    boxSizing: "border-box",
    background: "#0f0f1e",
    border: "1px solid #2a2a4a",
    borderRadius: 4,
    color: "#e8e8f0",
    padding: "8px 10px",
    fontSize: 13,
    fontFamily: "inherit",
    outline: "none",
    marginTop: 6,
  },
  actions: {
    display: "flex",
    justifyContent: "flex-end",
    gap: 8,
    marginTop: 14,
  },
  cancel: {
    background: "none",
    border: "1px solid #3a3a5a",
    borderRadius: 4,
    color: "#c8c8d4",
    padding: "6px 14px",
    fontSize: 12,
    cursor: "pointer",
    fontFamily: "inherit",
  },
  confirm: {
    background: "#6a6ac8",
    border: "1px solid #6a6ac8",
    borderRadius: 4,
    color: "#fff",
    padding: "6px 14px",
    fontSize: 12,
    cursor: "pointer",
    fontFamily: "inherit",
    fontWeight: 500,
  },
  danger: {
    background: "#a84a4a",
    borderColor: "#a84a4a",
  },
  toastStack: {
    position: "fixed",
    bottom: 36,
    right: 16,
    display: "flex",
    flexDirection: "column",
    gap: 6,
    zIndex: 30000,
    fontFamily: "system-ui, -apple-system, sans-serif",
    pointerEvents: "none",
  },
  toast: {
    background: "#1a1a2e",
    border: "1px solid #3a3a5a",
    borderLeft: "3px solid #6a6ac8",
    borderRadius: 4,
    padding: "10px 14px",
    color: "#e8e8f0",
    fontSize: 12,
    maxWidth: 360,
    boxShadow: "0 4px 16px rgba(0,0,0,0.4)",
    pointerEvents: "auto",
    cursor: "pointer",
  },
  toastError: {
    borderLeftColor: "#f87171",
  },
};
