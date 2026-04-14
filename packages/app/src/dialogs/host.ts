/**
 * Dialog host — promise-based replacement for window.prompt / confirm /
 * alert. A single <DialogHost /> is mounted in StaveApp; any caller
 * anywhere invokes the imperative API and awaits the result.
 */

export type DialogState =
  | {
      kind: "prompt";
      id: number;
      title: string;
      description?: string;
      initialValue: string;
      placeholder?: string;
      confirmLabel?: string;
      resolve: (value: string | null) => void;
    }
  | {
      kind: "confirm";
      id: number;
      title: string;
      description?: string;
      confirmLabel?: string;
      danger?: boolean;
      resolve: (value: boolean) => void;
    };

export interface ToastState {
  id: number;
  message: string;
  level: "info" | "error";
  expiresAt: number;
}

type Listener = () => void;

let dialog: DialogState | null = null;
let toasts: ToastState[] = [];
const listeners = new Set<Listener>();
let seq = 0;

function notify() { for (const l of listeners) l(); }

export function subscribeToDialog(cb: Listener): () => void {
  listeners.add(cb);
  return () => { listeners.delete(cb); };
}

export function getDialog(): DialogState | null { return dialog; }
export function getToasts(): ToastState[] { return toasts; }

export function closeDialog(): void {
  if (!dialog) return;
  const d = dialog;
  dialog = null;
  notify();
  // Resolve any pending promise with a cancel value.
  if (d.kind === "prompt") d.resolve(null);
  else d.resolve(false);
}

export function showPrompt(opts: {
  title: string;
  description?: string;
  initialValue?: string;
  placeholder?: string;
  confirmLabel?: string;
}): Promise<string | null> {
  return new Promise((resolve) => {
    dialog = {
      kind: "prompt",
      id: ++seq,
      title: opts.title,
      description: opts.description,
      initialValue: opts.initialValue ?? "",
      placeholder: opts.placeholder,
      confirmLabel: opts.confirmLabel ?? "OK",
      resolve,
    };
    notify();
  });
}

export function showConfirm(opts: {
  title: string;
  description?: string;
  confirmLabel?: string;
  danger?: boolean;
}): Promise<boolean> {
  return new Promise((resolve) => {
    dialog = {
      kind: "confirm",
      id: ++seq,
      title: opts.title,
      description: opts.description,
      confirmLabel: opts.confirmLabel ?? "OK",
      danger: opts.danger,
      resolve,
    };
    notify();
  });
}

/** Internal — called by the host when the user hits OK on a prompt. */
export function resolvePrompt(value: string): void {
  if (!dialog || dialog.kind !== "prompt") return;
  const d = dialog;
  dialog = null;
  notify();
  d.resolve(value);
}

/** Internal — called by the host when the user hits Confirm. */
export function resolveConfirm(value: boolean): void {
  if (!dialog || dialog.kind !== "confirm") return;
  const d = dialog;
  dialog = null;
  notify();
  d.resolve(value);
}

export function showToast(message: string, level: "info" | "error" = "info", ttlMs = 4000): void {
  const t: ToastState = {
    id: ++seq,
    message,
    level,
    expiresAt: Date.now() + ttlMs,
  };
  toasts = [...toasts, t];
  notify();
  setTimeout(() => {
    toasts = toasts.filter((x) => x.id !== t.id);
    notify();
  }, ttlMs);
}

export function dismissToast(id: number): void {
  toasts = toasts.filter((t) => t.id !== id);
  notify();
}
