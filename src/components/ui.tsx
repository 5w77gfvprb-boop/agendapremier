"use client";

import { X } from "lucide-react";
import { useEffect, type ReactNode } from "react";

export const inputCls =
  "w-full rounded-lg border border-neutral-300 bg-white px-3 py-2 text-sm text-neutral-900 outline-none transition focus:border-neutral-900 focus:ring-1 focus:ring-neutral-900 disabled:bg-neutral-100 disabled:text-neutral-500";

export function Field({ label, children, hint, className = "" }: { label: string; children: ReactNode; hint?: ReactNode; className?: string }) {
  return (
    <label className={`block ${className}`}>
      <span className="mb-1 block text-xs font-medium text-neutral-600">{label}</span>
      {children}
      {hint ? <span className="mt-1 block text-xs text-neutral-500">{hint}</span> : null}
    </label>
  );
}

type BtnProps = React.ButtonHTMLAttributes<HTMLButtonElement> & { variant?: "primary" | "ghost" | "danger" | "outline" };
export function Button({ variant = "outline", className = "", ...p }: BtnProps) {
  const v = {
    primary: "bg-neutral-900 text-white hover:bg-neutral-700 border border-neutral-900",
    outline: "bg-white text-neutral-800 hover:bg-neutral-50 border border-neutral-300",
    ghost: "text-neutral-600 hover:bg-neutral-100 border border-transparent",
    danger: "bg-white text-red-700 hover:bg-red-50 border border-red-200",
  }[variant];
  return (
    <button
      {...p}
      className={`inline-flex items-center justify-center gap-1.5 rounded-lg px-3 py-2 text-sm font-medium transition disabled:cursor-not-allowed disabled:opacity-50 ${v} ${className}`}
    />
  );
}

export function Card({ children, className = "" }: { children: ReactNode; className?: string }) {
  return <div className={`rounded-xl border border-neutral-200 bg-white ${className}`}>{children}</div>;
}

export function Modal({ titulo, onClose, children, largura = "max-w-xl" }: { titulo: string; onClose: () => void; children: ReactNode; largura?: string }) {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [onClose]);
  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center bg-neutral-900/40 sm:items-center sm:p-4" onMouseDown={(e) => e.target === e.currentTarget && onClose()}>
      <div className={`flex max-h-[92dvh] w-full min-w-0 ${largura} flex-col rounded-t-2xl bg-white pb-[env(safe-area-inset-bottom)] shadow-xl sm:rounded-2xl sm:pb-0`} role="dialog" aria-label={titulo}>
        <div className="flex items-center justify-between border-b border-neutral-200 px-5 py-3.5">
          <h2 className="text-base font-semibold text-neutral-900">{titulo}</h2>
          <button onClick={onClose} className="rounded-md p-1 text-neutral-500 hover:bg-neutral-100" aria-label="Fechar">
            <X size={18} />
          </button>
        </div>
        <div className="min-w-0 overflow-y-auto overflow-x-hidden px-4 py-4 sm:px-5">{children}</div>
      </div>
    </div>
  );
}

export function ConfirmDialog({
  titulo, texto, confirmar = "Confirmar", perigo = false, onConfirm, onCancel,
}: { titulo: string; texto: ReactNode; confirmar?: string; perigo?: boolean; onConfirm: () => void; onCancel: () => void }) {
  return (
    <Modal titulo={titulo} onClose={onCancel} largura="max-w-md">
      <div className="space-y-5">
        <p className="text-sm text-neutral-700">{texto}</p>
        <div className="flex justify-end gap-2">
          <Button onClick={onCancel}>Voltar</Button>
          <Button variant={perigo ? "danger" : "primary"} onClick={onConfirm}>{confirmar}</Button>
        </div>
      </div>
    </Modal>
  );
}

export function Vazio({ children }: { children: ReactNode }) {
  return <div className="px-4 py-10 text-center text-sm text-neutral-500">{children}</div>;
}

export function Segmentado<T extends string>({ valor, opcoes, onChange }: { valor: T; opcoes: { id: T; label: string }[]; onChange: (v: T) => void }) {
  return (
    <div className="inline-flex max-w-full overflow-x-auto rounded-lg border border-neutral-200 bg-neutral-100 p-0.5">
      {opcoes.map((o) => (
        <button
          key={o.id}
          onClick={() => onChange(o.id)}
          className={`shrink-0 whitespace-nowrap rounded-md px-3 py-1.5 text-xs font-medium transition ${valor === o.id ? "bg-white text-neutral-900 shadow-sm" : "text-neutral-600 hover:text-neutral-900"}`}
        >
          {o.label}
        </button>
      ))}
    </div>
  );
}
