'use client';

import { createContext, useCallback, useContext, useRef, useState } from 'react';

/** Prototype toast system: max 4, slide in/out, colored verdict dot. */
export type ToastKind = 'w' | 'r' | 'g';

interface ToastItem {
  id: number;
  kind: ToastKind;
  html: string;
  out: boolean;
}

interface ToastApi {
  toast: (kind: ToastKind, html: string) => void;
}

const ToastContext = createContext<ToastApi>({ toast: () => undefined });

export function useToast(): ToastApi {
  return useContext(ToastContext);
}

const KIND_COLOR: Record<ToastKind, string> = {
  w: 'var(--win)',
  r: 'var(--rug)',
  g: 'var(--gold)',
};

export function ToastProvider({ children }: { children: React.ReactNode }): JSX.Element {
  const [items, setItems] = useState<ToastItem[]>([]);
  const nextId = useRef(1);

  const toast = useCallback((kind: ToastKind, html: string) => {
    const id = nextId.current++;
    setItems((prev) => [...prev.slice(-3), { id, kind, html, out: false }]);
    setTimeout(() => {
      setItems((prev) => prev.map((t) => (t.id === id ? { ...t, out: true } : t)));
      setTimeout(() => setItems((prev) => prev.filter((t) => t.id !== id)), 420);
    }, 3400);
  }, []);

  return (
    <ToastContext.Provider value={{ toast }}>
      {children}
      <div className="toasts" aria-live="polite">
        {items.map((t) => (
          <div key={t.id} className={`toast${t.out ? ' out' : ''}`}>
            <span className="vd" style={{ color: KIND_COLOR[t.kind] }} />
            {/* toast copy is generated locally from typed templates */}
            <span dangerouslySetInnerHTML={{ __html: t.html }} />
          </div>
        ))}
      </div>
    </ToastContext.Provider>
  );
}
