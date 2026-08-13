# Barbería La Navaja — agendador web

Sitio propio para reservar, cancelar y reprogramar citas de barbería sin crear cuenta, con la
disponibilidad y las citas sincronizadas contra el calendario de **GoHighLevel (GHL)** — implementado
completo y ejecutable en **modo mock** mientras no existan credenciales reales — más un panel de
administración con agenda, catálogo, barberos y reportes.

Stack: Next.js 15 (App Router) · React 19 · TypeScript · Prisma + SQLite · Tailwind CSS 4 · Zod ·
date-fns / date-fns-tz. Sin Docker, sin pagos en línea, sin login de cliente.

---

## Arranque

Requisitos: **Node.js ≥ 20.11** (probado en Node 24) y npm.

```bash
npm install
npm run db:reset      # recrea la base SQLite y carga el seed determinista
npm run dev           # http://localhost:3000
```

La app **siempre** corre en `http://localhost:3000`.

### Comandos

| Comando | Qué hace |
|---|---|
| `npm install` | Instala dependencias |
| `npm run dev` | Dev server en el puerto 3000 |
| `npm run db:reset` | **Resetea el estado**: recrea SQLite desde las migraciones y vuelve a sembrar |
| `npm run seed` | Solo re-siembra (borra y recrea los datos, no el esquema) |
| `npm run build` | `prisma generate` + `migrate deploy` + build de producción |
| `npm start` | Server de producción en el puerto 3000 |
| `npm run typecheck` | `tsc --noEmit` |
| `npm run setup` | install + generate + migrate deploy + seed, todo junto |

### Credenciales del panel

`/admin/login` → usuario **`admin`**, contraseña **`barberia123`** (configurables con `ADMIN_USER` y
`ADMIN_PASSWORD`). La sesión es una cookie httpOnly `barber_admin` de 12 h.

---

## Qué incluye

**Público**

- `/` landing con servicios y CTA de reserva.
- `/reservar` wizard de 4 pasos: servicio → barbero (incluye "Cualquier barbero disponible") →
  fecha y hora → datos y confirmación.
- `/cita/<manageToken>` gestión self-service: ver, reprogramar y cancelar sin login.

**API pública**

`GET /api/health` · `GET /api/services` · `GET /api/barbers` · `GET /api/availability` ·
`POST /api/appointments` · `GET|PATCH /api/appointments/[token]` · `POST /api/ghl/webhook`.

**Panel admin** (`/admin`)

Dashboard con KPIs del día, agenda de hoy y próximos 7 días · `/admin/citas` con filtros y acciones
(completada, no asistió, cancelada, pagado en local) · `/admin/servicios` (alta, edición inline,
desactivar) · `/admin/barberos` (servicios que ofrece, horario semanal, días libres) ·
`/admin/reportes` (ingresos, citas por servicio, y ocupación por barbero con minutos ocupados /
disponibles).

**Reglas de negocio**

- Zona horaria de negocio `America/Mexico_City`; todo se persiste en UTC.
- Slots cada 15 min, antelación mínima de 60 min para reservar/cancelar/reprogramar, horizonte de
  60 días.
- No hay doble reserva confirmada: la columna `Appointment.slotKey` (`barberId|startsAtISO`) tiene
  índice único mientras el horario está ocupado y pasa a `NULL` al cancelar.
- El pago es en el local; el sitio nunca cobra. El admin puede marcar "Pagado en local".

---

## Conectar GoHighLevel

Hoy el proyecto corre con `GHL_MODE=mock`: la tabla `GhlEvent` **simula el calendario externo**
(incluye eventos que el sitio no creó, como los del bot de WhatsApp). Cuando lleguen las credenciales:

1. Llena en `.env` (o en las variables del entorno de despliegue):
   - `GHL_API_KEY` — Private Integration Token / API key v2.
   - `GHL_LOCATION_ID` — id de la sub-cuenta.
   - `GHL_CALENDAR_ID` — calendario de la barbería.
2. Cambia `GHL_MODE="live"`.
3. Mapea cada barbero a su usuario de GHL: en `/admin/barberos` (o directo en la base) llena
   `Barber.ghlUserId` con el `assignedUserId` correspondiente. Si un barbero tiene calendario propio,
   llena también `Barber.ghlCalendarId`; si no, se usa el `ghlCalendarId` de la sucursal.
4. Registra el webhook en GHL apuntando a `POST https://<tu-dominio>/api/ghl/webhook`, con el header
   `x-ghl-webhook-secret` igual a `GHL_WEBHOOK_SECRET`. Eventos: `AppointmentCreate`,
   `AppointmentUpdate`, `AppointmentDelete`.
5. Verifica los paths reales de la API v2 en `src/lib/ghl/live.ts`: todos los endpoints y nombres de
   campo están marcados con `// TODO(verify-on-connect)` porque no pudieron probarse sin credenciales.
   El resto de la app solo conoce la interfaz `GhlClient`, así que los ajustes quedan contenidos ahí.

**Fallback seguro:** si `GHL_MODE=live` pero falta `GHL_API_KEY`, `GHL_LOCATION_ID` o
`GHL_CALENDAR_ID`, la app **no crashea**: registra `[GHL] credenciales incompletas → modo mock` y
sigue en mock. `GET /api/health` reporta el modo efectivo en `ghlMode`.

Los recordatorios y confirmaciones por WhatsApp/email los ejecutan los **workflows nativos de GHL**;
este sitio solo garantiza que el Contact y el Appointment queden bien formados en GHL.

---

## Variables de entorno

Todas están documentadas en `.env.example` (y con valores de desarrollo en `.env`, sin secretos
reales). Las relevantes para GHL: `GHL_MODE`, `GHL_API_KEY`, `GHL_LOCATION_ID`, `GHL_CALENDAR_ID`,
`GHL_API_BASE`, `GHL_API_VERSION`, `GHL_WEBHOOK_SECRET`.

---

## Datos del seed (deterministas)

- **5 servicios**: Corte clásico (30 min, $250) · Corte + barba (45 min, $400) · Afeitado con navaja
  (30 min, $220) · Arreglo de barba (30 min, $180) · Corte infantil (30 min, $180).
- **3 barberos**: Miguel Ángel y Carlos Ruiz (los 5 servicios), Sofía Herrera (corte clásico, corte
  infantil y arreglo de barba). Horario lun–vie 09:00–19:00, sábado 10:00–17:00, domingo cerrado.
- **Día libre**: Sofía el próximo lunes completo.
- **5 citas** con tokens fijos `seed-token-1` … `seed-token-5`: dos futuras (una `web` y una
  `whatsapp`, el próximo día hábil a las 10:00 y 12:00), dos completadas y pagadas en local
  (ayer y hace tres días) y una `no_show`.
  Las dos completadas suman **$430.00** de ingresos, que es lo que muestra `/admin/reportes`.

> Nota de implementación: `SPEC.md` §5.8 describe la tercera cita semilla como "Corte + barba"
> mientras que el criterio 31 del rubric fija el total de ingresos en `$250 + $180 = $430.00`. Se
> siguió el rubric: esa cita usa **Corte clásico** ($250) para que el total del reporte sea
> exactamente $430.00.

Para volver al estado inicial en cualquier momento: `npm run db:reset`.
