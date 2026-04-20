"use client";

import { createContext, useCallback, useContext, useState, type ReactNode } from "react";
import { ConfirmDialog } from "./confirm-dialog";

interface ConfirmOptions {
  title: string;
  description?: string;
  confirmLabel?: string;
  cancelLabel?: string;
  variant?: "default" | "destructive";
}

type Resolver = (value: boolean) => void;

interface ConfirmContextValue {
  confirm: (opts: ConfirmOptions) => Promise<boolean>;
}

const ConfirmContext = createContext<ConfirmContextValue | null>(null);

export function ConfirmProvider({ children }: { children: ReactNode }) {
  const [state, setState] = useState<
    | { open: true; opts: ConfirmOptions; resolve: Resolver }
    | { open: false }
  >({ open: false });

  const confirm = useCallback((opts: ConfirmOptions) => {
    return new Promise<boolean>((resolve) => {
      setState({ open: true, opts, resolve });
    });
  }, []);

  function close(result: boolean) {
    if (state.open) {
      state.resolve(result);
      setState({ open: false });
    }
  }

  return (
    <ConfirmContext.Provider value={{ confirm }}>
      {children}
      <ConfirmDialog
        open={state.open}
        title={state.open ? state.opts.title : ""}
        description={state.open ? state.opts.description : undefined}
        confirmLabel={state.open ? state.opts.confirmLabel : undefined}
        cancelLabel={state.open ? state.opts.cancelLabel : undefined}
        variant={state.open ? state.opts.variant : undefined}
        onConfirm={() => close(true)}
        onCancel={() => close(false)}
      />
    </ConfirmContext.Provider>
  );
}

export function useConfirm(): (opts: ConfirmOptions) => Promise<boolean> {
  const ctx = useContext(ConfirmContext);
  if (!ctx) throw new Error("useConfirm must be used inside <ConfirmProvider>");
  return ctx.confirm;
}
