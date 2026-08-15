"use client";

import { useState } from "react";

export default function ConfirmVisitButton({ token }: { token: string }) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function confirm() {
    setBusy(true);
    setError(null);
    try {
      const res = await fetch(`/api/loyalty/${token}`, { method: "POST" });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        setError(data?.message ?? "No se pudo confirmar tu visita");
        return;
      }
      // Navegación dura: la página muestra el estado confirmado desde el servidor.
      window.location.reload();
    } catch {
      setError("No se pudo conectar con el servidor");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="space-y-2">
      {error ? (
        <p
          data-testid="loyalty-confirm-error"
          role="alert"
          className="rounded-lg border border-[#6B2A24] bg-[#2E1613] px-3 py-2 text-sm font-medium text-[#E2897E]"
        >
          {error}
        </p>
      ) : null}
      <button
        type="button"
        data-testid="confirm-visit"
        className="btn-primary w-full"
        disabled={busy}
        onClick={confirm}
      >
        {busy ? "Confirmando…" : "Confirmar mi corte"}
      </button>
    </div>
  );
}
