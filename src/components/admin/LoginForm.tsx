"use client";

import { useState } from "react";

export default function LoginForm({ next }: { next: string }) {
  const [user, setUser] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      const res = await fetch("/api/admin/login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ user, password }),
      });
      if (!res.ok) {
        setError("Credenciales inválidas");
        return;
      }
      // Navegación dura: la cookie de sesión debe aplicarse en una carga nueva.
      window.location.assign(next.startsWith("/admin") ? next : "/admin");
    } catch {
      setError("No se pudo conectar con el servidor");
    } finally {
      setBusy(false);
    }
  }

  return (
    <form onSubmit={submit} className="card space-y-3" noValidate>
      {error ? (
        <p
          data-testid="login-error"
          role="alert"
          className="rounded-lg border border-[#6B2A24] bg-[#2E1613] px-3 py-2 text-sm font-medium text-[#E2897E]"
        >
          {error}
        </p>
      ) : null}
      <div>
        <label className="label" htmlFor="admin-user">
          Usuario
        </label>
        <input
          id="admin-user"
          data-testid="admin-user"
          className="input"
          value={user}
          onChange={(e) => setUser(e.target.value)}
          autoComplete="username"
        />
      </div>
      <div>
        <label className="label" htmlFor="admin-password">
          Contraseña
        </label>
        <input
          id="admin-password"
          data-testid="admin-password"
          type="password"
          className="input"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          autoComplete="current-password"
        />
      </div>
      <button type="submit" data-testid="admin-login-submit" className="btn-primary" disabled={busy}>
        {busy ? "Entrando…" : "Entrar"}
      </button>
    </form>
  );
}
