"use client";

import { useCallback, useEffect, useState } from "react";

type Settings = { cutsRequired: number; rewardCents: number; windowDays: number };

type Status = {
  cutsRequired: number;
  rewardCents: number;
  windowDays: number;
  confirmedAvailable: number;
  pendingCount: number;
  readyToRedeem: boolean;
};

type Customer = { id: string; name: string; phone: string };

function moneyLabel(cents: number) {
  return `$${(cents / 100).toLocaleString("es-MX", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

export default function LoyaltyManager() {
  const [settings, setSettings] = useState<Settings | null>(null);
  const [cutsRequired, setCutsRequired] = useState("5");
  const [rewardMxn, setRewardMxn] = useState("200");
  const [windowDays, setWindowDays] = useState("5");
  const [savingSettings, setSavingSettings] = useState(false);
  const [settingsNotice, setSettingsNotice] = useState<string | null>(null);

  const [phone, setPhone] = useState("");
  const [name, setName] = useState("");
  const [customer, setCustomer] = useState<Customer | null>(null);
  const [status, setStatus] = useState<Status | null>(null);
  const [searched, setSearched] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  const loadSettings = useCallback(async () => {
    const res = await fetch("/api/admin/loyalty/settings");
    const data = await res.json().catch(() => ({}));
    if (res.ok) {
      setSettings(data.settings);
      setCutsRequired(String(data.settings.cutsRequired));
      setRewardMxn((data.settings.rewardCents / 100).toString());
      setWindowDays(String(data.settings.windowDays));
    }
  }, []);

  useEffect(() => {
    void loadSettings();
  }, [loadSettings]);

  async function saveSettings(e: React.FormEvent) {
    e.preventDefault();
    setSavingSettings(true);
    setSettingsNotice(null);
    try {
      const res = await fetch("/api/admin/loyalty/settings", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          cutsRequired: Number(cutsRequired),
          rewardCents: Math.round(Number(rewardMxn.replace(",", ".")) * 100),
          windowDays: Number(windowDays),
        }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        setSettingsNotice(data?.message ?? "No se pudo guardar la configuración");
        return;
      }
      setSettings(data.settings);
      setSettingsNotice("Configuración guardada");
    } finally {
      setSavingSettings(false);
    }
  }

  async function search(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setNotice(null);
    setBusy(true);
    try {
      const res = await fetch(`/api/admin/loyalty/customers?phone=${encodeURIComponent(phone)}`);
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        setError(data?.message ?? "No se pudo buscar el cliente");
        return;
      }
      setSearched(true);
      setCustomer(data.customer);
      setStatus(data.status ?? null);
    } finally {
      setBusy(false);
    }
  }

  async function registerVisit() {
    setBusy(true);
    setError(null);
    setNotice(null);
    try {
      const res = await fetch("/api/admin/loyalty/visits", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: customer?.name ?? name, phone }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        setError(
          data?.fields ? Object.values(data.fields as Record<string, string>)[0] : (data?.message ?? "No se pudo registrar la visita")
        );
        return;
      }
      setCustomer(data.customer);
      setStatus(data.status);
      setNotice("Visita registrada — pendiente de confirmación por WhatsApp");
    } finally {
      setBusy(false);
    }
  }

  async function redeem() {
    if (!customer) return;
    setBusy(true);
    setError(null);
    setNotice(null);
    try {
      const res = await fetch("/api/admin/loyalty/redeem", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ customerId: customer.id }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        setError(data?.message ?? "No se pudo canjear el descuento");
        return;
      }
      setStatus(data.status);
      setNotice(`Descuento de ${moneyLabel(data.redemption.discountCents)} canjeado`);
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="space-y-6">
      <section className="card space-y-3">
        <h2 className="font-bold">Configuración del programa</h2>
        <form onSubmit={saveSettings} className="grid gap-3 sm:grid-cols-4">
          <div>
            <label className="label" htmlFor="cuts-required">
              Cortes requeridos
            </label>
            <input
              id="cuts-required"
              data-testid="loyalty-cuts-required"
              className="input"
              inputMode="numeric"
              value={cutsRequired}
              onChange={(e) => setCutsRequired(e.target.value)}
            />
          </div>
          <div>
            <label className="label" htmlFor="reward-mxn">
              Descuento (MXN)
            </label>
            <input
              id="reward-mxn"
              data-testid="loyalty-reward-mxn"
              className="input"
              inputMode="decimal"
              value={rewardMxn}
              onChange={(e) => setRewardMxn(e.target.value)}
            />
          </div>
          <div>
            <label className="label" htmlFor="window-days">
              Días para confirmar
            </label>
            <input
              id="window-days"
              data-testid="loyalty-window-days"
              className="input"
              inputMode="numeric"
              value={windowDays}
              onChange={(e) => setWindowDays(e.target.value)}
            />
          </div>
          <div className="flex items-end">
            <button type="submit" data-testid="loyalty-save-settings" className="btn-primary" disabled={savingSettings}>
              {savingSettings ? "Guardando…" : "Guardar"}
            </button>
          </div>
        </form>
        {settingsNotice ? <p className="text-sm text-[#9C8A6F]">{settingsNotice}</p> : null}
        {settings ? (
          <p className="text-xs text-[#9C8A6F]">
            Actual: cada {settings.cutsRequired} cortes confirmados, {moneyLabel(settings.rewardCents)} de
            descuento. El cliente tiene {settings.windowDays} día(s) para confirmar por WhatsApp.
          </p>
        ) : null}
      </section>

      <section className="card space-y-3">
        <h2 className="font-bold">Buscar cliente</h2>
        <form onSubmit={search} className="flex flex-wrap items-end gap-2">
          <div>
            <label className="label" htmlFor="loyalty-phone">
              Teléfono
            </label>
            <input
              id="loyalty-phone"
              data-testid="loyalty-phone"
              className="input"
              inputMode="tel"
              value={phone}
              onChange={(e) => setPhone(e.target.value)}
            />
          </div>
          <button type="submit" data-testid="loyalty-search" className="btn-secondary" disabled={busy}>
            Buscar
          </button>
        </form>

        {error ? (
          <p
            data-testid="loyalty-error"
            role="alert"
            className="rounded-lg border border-[#6B2A24] bg-[#2E1613] px-3 py-2 text-sm text-[#E2897E]"
          >
            {error}
          </p>
        ) : null}
        {notice ? (
          <p
            data-testid="loyalty-notice"
            className="rounded-lg border border-[#355C2E] bg-[#1B2A17] px-3 py-2 text-sm text-[#9BCB86]"
          >
            {notice}
          </p>
        ) : null}

        {searched && !customer ? (
          <div className="space-y-2 border-t border-[#3A2E20] pt-3">
            <p className="text-sm text-[#9C8A6F]">Ese cliente todavía no existe. Regístralo con su primera visita:</p>
            <div>
              <label className="label" htmlFor="loyalty-new-name">
                Nombre
              </label>
              <input
                id="loyalty-new-name"
                data-testid="loyalty-new-name"
                className="input max-w-xs"
                value={name}
                onChange={(e) => setName(e.target.value)}
              />
            </div>
            <button
              type="button"
              data-testid="loyalty-register-visit"
              className="btn-primary"
              disabled={busy || name.trim().length < 2}
              onClick={registerVisit}
            >
              Registrar corte
            </button>
          </div>
        ) : null}

        {customer && status ? (
          <div className="space-y-3 border-t border-[#3A2E20] pt-3" data-testid="loyalty-card">
            <div>
              <p className="font-semibold" data-testid="loyalty-customer-name">
                {customer.name}
              </p>
              <p className="text-sm text-[#9C8A6F]">{customer.phone}</p>
            </div>
            <p data-testid="loyalty-progress" className="text-sm">
              <span className="font-bold">
                {status.confirmedAvailable} / {status.cutsRequired}
              </span>{" "}
              cortes confirmados hacia el próximo descuento
              {status.pendingCount > 0 ? ` · ${status.pendingCount} pendiente(s) de confirmar` : ""}
            </p>
            <div className="flex flex-wrap gap-2">
              <button
                type="button"
                data-testid="loyalty-register-visit"
                className="btn-secondary"
                disabled={busy}
                onClick={registerVisit}
              >
                Registrar corte
              </button>
              <button
                type="button"
                data-testid="loyalty-redeem"
                className="btn-primary"
                disabled={busy || !status.readyToRedeem}
                onClick={redeem}
              >
                Canjear {moneyLabel(status.rewardCents)}
              </button>
            </div>
          </div>
        ) : null}
      </section>
    </div>
  );
}
