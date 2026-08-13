"use client";

export default function LogoutButton() {
  return (
    <button
      type="button"
      data-testid="admin-logout"
      className="btn-secondary"
      onClick={async () => {
        await fetch("/api/admin/logout", { method: "POST" });
        window.location.assign("/admin/login");
      }}
    >
      Salir
    </button>
  );
}
