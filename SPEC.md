# SPEC.md — Agendador web para barbería ("Barbería La Navaja")

> Fuente de negocio: `PLAN.md` (assumptions ya cerrados por el humano).
> Este documento es la única fuente de verdad para el Generator y el Evaluator.

---

## 1. Objetivo

Construir un sitio web propio (Next.js) donde un cliente reserva, cancela y reprograma su cita en la barbería sin crear cuenta, con la disponibilidad y las citas sincronizadas contra el calendario de GoHighLevel (GHL) vía su API — implementada completa pero ejecutable en modo mock mientras no existan credenciales — más un panel de administración con agenda, catálogo, barberos y reportes.

---

## 2. Scope

### SÍ incluye

1. **Sitio público**
   - Landing `/` con hero, lista de servicios y CTA a reservar.
   - Wizard de reserva `/reservar` en 4 pasos: servicio → barbero → fecha y hora → datos del cliente + confirmación.
   - Página de gestión de cita `/cita/[token]`: ver, reprogramar y cancelar (self-service, sin login).
2. **API pública** (`/api/services`, `/api/barbers`, `/api/availability`, `/api/appointments`, `/api/appointments/[token]`).
3. **Integración GHL** vía adapter con dos implementaciones intercambiables por env (`GHL_MODE=mock|live`):
   - `live`: llamadas HTTP reales a la API v2 de GHL (contacts upsert, free-slots, create/update/delete appointment).
   - `mock`: mismo contrato, respaldado por una tabla local que simula el calendario externo.
4. **Webhook entrante** `/api/ghl/webhook` para que las citas creadas fuera del sitio (bot de WhatsApp de GHL) se reflejen en la base local y bloqueen horarios.
5. **Panel admin** con login por contraseña (cookie de sesión): agenda de hoy/próximas, detalle y cambio de estado de cita, CRUD de servicios, CRUD de barberos (horario semanal, días libres, servicios que ofrece), reportes de ventas y de ocupación por barbero.
6. **Modelo de datos multi-sucursal-ready**: tabla `Branch` con una sola fila seedeada y `branchId` en barberos, servicios y citas.
7. **Seed determinista** (`npm run seed`) con datos fijos que el Evaluator usa como base.
8. **README** con comandos exactos de arranque y de reseteo de estado.

### NO incluye (fuera de alcance de este build)

1. Multi-sucursal real (varias sub-cuentas/calendarios de GHL simultáneos). Solo el modelo queda preparado.
2. Pagos online (Stripe u otro). Reservar nunca requiere pago; el cobro es en el local. El modelo guarda `priceCents` y `paymentStatus`, y el admin puede marcar "pagado en local", pero **no se integra ningún proveedor de pago ni checkout**.
3. Cuentas de cliente con login, historial o portal.
4. Construcción de recordatorios/confirmaciones por WhatsApp o email: eso lo hacen los **workflows nativos de GHL**. El sitio solo garantiza que la cita quede registrada en GHL con los datos necesarios.
5. El bot conversacional de WhatsApp en sí (es Conversation AI de GHL, configuración, no código). Sí se implementa el webhook que recibe sus citas.
6. Traducciones / i18n: todo en español (es-MX).
7. Tests unitarios automatizados propios (la verificación la hace el Evaluator con Playwright + curl).

---

## 3. User flows

Zona horaria de negocio: **`America/Mexico_City`** (env `BUSINESS_TIMEZONE`). Todo timestamp se persiste en **UTC ISO-8601**; toda etiqueta visible al usuario se renderiza en la zona de negocio.

### 3.1 Flujo público — reservar

**Paso 0 · Landing `/`**
- Output: hero con nombre de la barbería, grid de servicios activos (nombre, duración, precio formateado `$350.00 MXN`), botón `data-testid="cta-reservar"` que navega a `/reservar`.

**Paso 1 · `/reservar` — elegir servicio**
- Input: click en una tarjeta de servicio.
- Output: lista de servicios activos desde `GET /api/services`. Cada tarjeta: `data-testid="service-card"` + atributo `data-service-id`. Al seleccionar, se avanza al paso 2 y el servicio elegido queda visible en el resumen lateral (`data-testid="booking-summary"`).

**Paso 2 · elegir barbero**
- Input: click en tarjeta de barbero.
- Output: `GET /api/barbers?serviceId=<id>` — **solo** barberos activos que ofrecen ese servicio. Tarjeta: `data-testid="barber-card"` + `data-barber-id`. Incluye siempre una opción "Cualquier barbero disponible" (`data-testid="barber-any"`, `data-barber-id="any"`).

**Paso 3 · elegir fecha y hora**
- Input: selector de fecha `data-testid="date-input"` (`<input type="date">`, mínimo = hoy, máximo = hoy + `BOOKING_HORIZON_DAYS`=60).
- Output: `GET /api/availability?barberId=<id|any>&serviceId=<id>&date=YYYY-MM-DD` renderizado como botones de hora `data-testid="slot-button"` con `data-start="<ISO UTC>"` y texto `HH:mm` (24h).
  - Si no hay slots: mensaje `data-testid="no-slots"` con texto "No hay horarios disponibles para este día".
  - Estado de carga: `data-testid="slots-loading"`.

**Paso 4 · datos y confirmación**
- Inputs: `data-testid="input-name"` (requerido, 2–80 chars), `data-testid="input-phone"` (requerido), `data-testid="input-email"` (opcional), `data-testid="input-notes"` (opcional, ≤300 chars), botón `data-testid="submit-booking"`.
- Validación cliente **y** servidor (Zod). Errores se muestran en `data-testid="form-error"` (uno o varios, texto en español):
  - nombre vacío → "El nombre es obligatorio".
  - teléfono con menos de 10 dígitos → "Teléfono inválido".
  - email presente pero sin formato válido → "Email inválido".
- Output éxito: `POST /api/appointments` → 201, redirección a `/cita/<manageToken>?nuevo=1`.
- Output conflicto: si el slot fue tomado entre el paso 3 y el submit → 409, se muestra `data-testid="form-error"` con "Ese horario ya fue reservado, elige otro" y se vuelve al paso 3 recargando slots.

### 3.2 Flujo público — gestionar cita `/cita/[token]`

- Output: `data-testid="appointment-detail"` con servicio, barbero, fecha/hora larga (`sábado 15 de agosto, 10:30`), precio, estado (`data-testid="appointment-status"` con texto `Confirmada` | `Cancelada` | `Completada` | `No asistió`), nombre y teléfono enmascarado (`**** **** 1234`).
- Token inválido → HTTP 404 con `data-testid="not-found"`.
- **Cancelar**: botón `data-testid="cancel-button"` → modal de confirmación `data-testid="confirm-cancel"` → `PATCH /api/appointments/[token]` `{action:"cancel"}` → estado pasa a `Cancelada`, el slot se libera en GHL (mock o live) y los botones de acción desaparecen.
- **Reprogramar**: botón `data-testid="reschedule-button"` → muestra selector de fecha + slots (mismos testids que el paso 3, mismo servicio y barbero) → botón `data-testid="confirm-reschedule"` → `PATCH` `{action:"reschedule", startsAt}` → la página muestra el nuevo horario y el mismo token sigue siendo válido.
- Reglas: no se puede cancelar ni reprogramar una cita ya `cancelled`/`completed`/`no_show` (los botones no se renderizan; la API responde 409). Tampoco si faltan menos de `MIN_LEAD_MINUTES`=60 minutos para la cita (API 409, código `TOO_LATE`).

### 3.3 Flujo WhatsApp (entrante, sin UI)

1. El bot de GHL crea la cita en el calendario de GHL.
2. GHL dispara webhook → `POST /api/ghl/webhook` con header `x-ghl-webhook-secret`.
3. El sitio crea/actualiza el `Appointment` local con `source="whatsapp"` y el `GhlEvent` espejo.
4. Ese horario deja de aparecer en `GET /api/availability` y la cita aparece en el panel admin.

### 3.4 Flujo admin

- `/admin/login`: inputs `data-testid="admin-user"`, `data-testid="admin-password"`, botón `data-testid="admin-login-submit"`. Credenciales incorrectas → `data-testid="login-error"` "Credenciales inválidas" (HTTP 401). Correctas → cookie `barber_admin` (httpOnly, sameSite=lax, 12 h) y redirect a `/admin`.
- Cualquier ruta `/admin/*` (excepto login) sin cookie válida → redirect 307 a `/admin/login`. Cualquier `/api/admin/*` sin cookie → 401 JSON.
- `/admin` (dashboard): KPIs de hoy (`data-testid="kpi-citas-hoy"`, `data-testid="kpi-ingresos-hoy"`, `data-testid="kpi-ocupacion-hoy"`), tabla de citas de hoy `data-testid="today-table"` (filas `data-testid="appointment-row"` con `data-appointment-id`) y tabla de próximas 7 días `data-testid="upcoming-table"`. Si no hay citas hoy: `data-testid="today-empty"`.
- `/admin/citas`: filtros por rango de fechas, barbero y estado; acciones por fila: marcar `Completada`, `No asistió`, `Cancelada`, y toggle `Pagado en local` (`data-testid="toggle-paid"`).
- `/admin/servicios`: tabla `data-testid="services-table"`, formulario de alta `data-testid="service-form"` (nombre, duración en minutos, precio en MXN, activo), edición inline y desactivar (soft delete: `active=false`, nunca borrado físico si tiene citas).
- `/admin/barberos`: alta/edición de barbero, checkboxes de servicios que ofrece (`data-testid="barber-services"`), editor de horario semanal (7 filas: activo + hora inicio + hora fin, `data-testid="schedule-row-<0..6>"`, 0=domingo) y días libres (`data-testid="timeoff-form"`: fecha inicio, fecha fin, motivo).
- `/admin/reportes`: selector de rango (default: últimos 30 días). Muestra:
  - `data-testid="report-total-revenue"` (suma de `priceCents` de citas `completed` en el rango),
  - `data-testid="report-total-appointments"`,
  - tabla por servicio `data-testid="report-by-service"`,
  - tabla por barbero `data-testid="report-by-barber"` con columnas: citas, ingresos, **minutos ocupados / minutos disponibles** y `% ocupación`.

---

## 4. Modelo de datos

SQLite vía Prisma. Todos los IDs son `cuid()` string. Todas las fechas `DateTime` en UTC.

```prisma
model Branch {
  id            String   @id @default(cuid())
  name          String
  timezone      String   @default("America/Mexico_City")
  address       String?
  phone         String?
  ghlLocationId String?          // se llena cuando existan credenciales
  ghlCalendarId String?
  createdAt     DateTime @default(now())
  barbers       Barber[]
  services      Service[]
  appointments  Appointment[]
}

model Service {
  id          String   @id @default(cuid())
  branchId    String
  branch      Branch   @relation(fields: [branchId], references: [id])
  name        String
  description String?
  durationMin Int                        // múltiplo de 15, 15..240
  priceCents  Int                        // MXN en centavos
  active      Boolean  @default(true)
  sortOrder   Int      @default(0)
  createdAt   DateTime @default(now())
  updatedAt   DateTime @updatedAt
  barbers     BarberService[]
  appointments Appointment[]
  @@index([branchId, active])
}

model Barber {
  id           String   @id @default(cuid())
  branchId     String
  branch       Branch   @relation(fields: [branchId], references: [id])
  name         String
  bio          String?
  photoUrl     String?
  active       Boolean  @default(true)
  ghlUserId    String?                   // assignedUserId en GHL
  ghlCalendarId String?                  // calendario propio si existe; si no, el de Branch
  createdAt    DateTime @default(now())
  updatedAt    DateTime @updatedAt
  services     BarberService[]
  workingHours WorkingHour[]
  timeOff      TimeOff[]
  appointments Appointment[]
  @@index([branchId, active])
}

model BarberService {
  barberId  String
  serviceId String
  barber    Barber  @relation(fields: [barberId], references: [id], onDelete: Cascade)
  service   Service @relation(fields: [serviceId], references: [id], onDelete: Cascade)
  @@id([barberId, serviceId])
}

model WorkingHour {
  id         String @id @default(cuid())
  barberId   String
  barber     Barber @relation(fields: [barberId], references: [id], onDelete: Cascade)
  weekday    Int                          // 0=domingo .. 6=sábado
  startMin   Int                          // minutos desde medianoche, hora local de negocio (ej. 540 = 09:00)
  endMin     Int                          // > startMin
  active     Boolean @default(true)
  @@unique([barberId, weekday])
}

model TimeOff {
  id        String   @id @default(cuid())
  barberId  String
  barber    Barber   @relation(fields: [barberId], references: [id], onDelete: Cascade)
  startsAt  DateTime                      // UTC
  endsAt    DateTime
  reason    String?
  @@index([barberId, startsAt])
}

model Customer {
  id        String   @id @default(cuid())
  name      String
  phone     String   @unique              // E.164 normalizado, ej. +5215512345678
  email     String?
  ghlContactId String?
  createdAt DateTime @default(now())
  updatedAt DateTime @updatedAt
  appointments Appointment[]
}

model Appointment {
  id            String   @id @default(cuid())
  branchId      String
  branch        Branch   @relation(fields: [branchId], references: [id])
  barberId      String
  barber        Barber   @relation(fields: [barberId], references: [id])
  serviceId     String
  service       Service  @relation(fields: [serviceId], references: [id])
  customerId    String
  customer      Customer @relation(fields: [customerId], references: [id])
  startsAt      DateTime                  // UTC
  endsAt        DateTime                  // UTC = startsAt + durationMin
  status        String   @default("confirmed")   // confirmed | cancelled | completed | no_show
  source        String   @default("web")         // web | whatsapp | admin
  priceCents    Int                              // snapshot del precio al reservar
  paymentStatus String   @default("unpaid")      // unpaid | paid_onsite
  notes         String?
  manageToken   String   @unique                 // uuid v4, link self-service
  ghlEventId    String?  @unique
  ghlSyncStatus String   @default("pending")     // pending | synced | failed
  ghlSyncError  String?
  createdAt     DateTime @default(now())
  updatedAt     DateTime @updatedAt
  @@unique([barberId, startsAt, status], name: "uniq_barber_slot")
  @@index([branchId, startsAt])
  @@index([startsAt, status])
}

// Espejo del calendario externo. En modo mock ES el calendario externo.
model GhlEvent {
  id            String   @id @default(cuid())
  ghlEventId    String   @unique
  ghlCalendarId String
  ghlContactId  String?
  assignedUserId String?                  // mapea a Barber.ghlUserId
  barberId      String?
  title         String?
  startsAt      DateTime
  endsAt        DateTime
  status        String   @default("confirmed")  // confirmed | cancelled
  origin        String   @default("web")        // web | whatsapp | external
  raw           String?                          // JSON crudo del payload
  createdAt     DateTime @default(now())
  updatedAt     DateTime @updatedAt
  @@index([ghlCalendarId, startsAt])
}

model AdminSession {
  token     String   @id
  createdAt DateTime @default(now())
  expiresAt DateTime
}
```

**Nota sobre `@@unique([barberId, startsAt, status])`:** evita doble reserva confirmada en el mismo instante; una cita cancelada libera el slot porque el `status` cambia. Si el motor rechaza el compuesto por citas canceladas repetidas, el Generator puede sustituirlo por un índice único parcial emulado (columna `slotKey` = `barberId|startsAtISO` que se pone a `NULL` al cancelar) — **la garantía "no hay doble reserva confirmada" es obligatoria**.

---

## 5. Stack y decisiones técnicas

### 5.1 Stack

| Capa | Elección | Versión |
|---|---|---|
| Runtime | Node.js | ≥ 20.11 |
| Framework | Next.js (App Router, TypeScript) | 15.x |
| UI | React 19 + Tailwind CSS 4 | — |
| ORM / DB | Prisma + SQLite (`file:./prisma/dev.db`) | Prisma 6.x |
| Validación | Zod | 3.x |
| Fechas | `date-fns` + `date-fns-tz` | 4.x / 3.x |
| IDs/tokens | `crypto.randomUUID()` nativo + `cuid()` de Prisma | — |
| HTTP a GHL | `fetch` nativo | — |

No usar librerías de componentes pesadas (sin shadcn/MUI/Chakra). Sin Docker. Sin autenticación de terceros.

### 5.2 Estructura de carpetas

```
/
├─ SPEC.md
├─ PLAN.md
├─ README.md
├─ .env                      # defaults de dev, commiteado (no hay secretos reales)
├─ .env.example              # documenta TODAS las vars, incl. GHL
├─ package.json
├─ prisma/
│  ├─ schema.prisma
│  ├─ migrations/
│  └─ seed.ts
└─ src/
   ├─ app/
   │  ├─ layout.tsx  globals.css  page.tsx           # landing
   │  ├─ reservar/page.tsx                            # wizard (client component)
   │  ├─ cita/[token]/page.tsx
   │  ├─ admin/
   │  │  ├─ layout.tsx  page.tsx                      # dashboard
   │  │  ├─ login/page.tsx
   │  │  ├─ citas/page.tsx
   │  │  ├─ servicios/page.tsx
   │  │  ├─ barberos/page.tsx
   │  │  └─ reportes/page.tsx
   │  └─ api/
   │     ├─ health/route.ts
   │     ├─ services/route.ts
   │     ├─ barbers/route.ts
   │     ├─ availability/route.ts
   │     ├─ appointments/route.ts
   │     ├─ appointments/[token]/route.ts
   │     ├─ ghl/webhook/route.ts
   │     └─ admin/
   │        ├─ login/route.ts   logout/route.ts
   │        ├─ appointments/route.ts   appointments/[id]/route.ts
   │        ├─ services/route.ts       services/[id]/route.ts
   │        ├─ barbers/route.ts        barbers/[id]/route.ts
   │        ├─ barbers/[id]/schedule/route.ts
   │        ├─ barbers/[id]/time-off/route.ts
   │        └─ reports/sales/route.ts  reports/occupancy/route.ts
   ├─ lib/
   │  ├─ db.ts                 # PrismaClient singleton
   │  ├─ env.ts                # lectura+validación de env con Zod
   │  ├─ time.ts               # helpers de zona horaria y slots
   │  ├─ availability.ts       # cálculo de slots (única implementación)
   │  ├─ booking.ts            # crear / cancelar / reprogramar (transaccional + GHL)
   │  ├─ auth.ts               # sesión admin
   │  ├─ validation.ts         # esquemas Zod compartidos
   │  ├─ format.ts             # precio, teléfono, fechas legibles
   │  └─ ghl/
   │     ├─ types.ts           # contrato GhlClient
   │     ├─ client.ts          # getGhlClient() según GHL_MODE
   │     ├─ live.ts            # implementación HTTP real
   │     └─ mock.ts            # implementación local sobre GhlEvent
   └─ components/             # componentes React reutilizables
```

### 5.3 Variables de entorno

```env
DATABASE_URL="file:./dev.db"
BUSINESS_TIMEZONE="America/Mexico_City"
BUSINESS_NAME="Barbería La Navaja"
DEFAULT_COUNTRY_CODE="+52"
BOOKING_HORIZON_DAYS=60
MIN_LEAD_MINUTES=60
SLOT_STEP_MINUTES=15

# Admin
ADMIN_USER="admin"
ADMIN_PASSWORD="barberia123"

# GoHighLevel — pendientes de credenciales reales
GHL_MODE="mock"                  # mock | live
GHL_API_KEY=""                   # Private Integration Token / API key v2
GHL_LOCATION_ID=""
GHL_CALENDAR_ID=""
GHL_API_BASE="https://services.leadconnectorhq.com"
GHL_API_VERSION="2021-04-15"
GHL_WEBHOOK_SECRET="dev-webhook-secret"
```

Regla de arranque: **si `GHL_MODE=live` y falta `GHL_API_KEY`, `GHL_LOCATION_ID` o `GHL_CALENDAR_ID`, la app hace fallback a `mock` y loguea `[GHL] credenciales incompletas → modo mock`.** Nunca crashea por credenciales faltantes.

### 5.4 Contrato del adapter GHL

```ts
export interface GhlClient {
  mode: "mock" | "live";
  upsertContact(input: { name: string; phone: string; email?: string }): Promise<{ contactId: string }>;
  getBusySlots(input: { calendarId: string; assignedUserId?: string; from: Date; to: Date }): Promise<Array<{ startsAt: Date; endsAt: Date; ghlEventId: string }>>;
  createAppointment(input: {
    calendarId: string; contactId: string; assignedUserId?: string;
    startsAt: Date; endsAt: Date; title: string; notes?: string;
  }): Promise<{ ghlEventId: string }>;
  updateAppointment(input: { ghlEventId: string; startsAt: Date; endsAt: Date }): Promise<void>;
  cancelAppointment(input: { ghlEventId: string }): Promise<void>;
}
```

**Implementación `live` (API v2 de GHL).** Headers en toda petición: `Authorization: Bearer ${GHL_API_KEY}`, `Version: ${GHL_API_VERSION}`, `Content-Type: application/json`, `Accept: application/json`. Endpoints:

| Operación | Método y path |
|---|---|
| upsertContact | `POST /contacts/upsert` (body incluye `locationId`) |
| getBusySlots | `GET /calendars/{calendarId}/free-slots?startDate=<ms>&endDate=<ms>&timezone=<tz>[&userId=]` → se derivan los ocupados por diferencia contra el horario del barbero |
| createAppointment | `POST /calendars/events/appointments` |
| updateAppointment | `PUT /calendars/events/appointments/{eventId}` |
| cancelAppointment | `DELETE /calendars/events/{eventId}` |

Reglas de la implementación live: timeout de 10 s (`AbortSignal.timeout`), 1 reintento en 5xx/red, y **todo path/campo exacto queda aislado en `src/lib/ghl/live.ts` con un comentario `// TODO(verify-on-connect)`** porque no hay credenciales para validarlo contra la API real. El resto de la app solo conoce la interfaz `GhlClient`.

**Implementación `mock`:** misma interfaz, persistida en la tabla `GhlEvent`; `ghlEventId` = `mock_<uuid>`; `contactId` = `mockct_<hash del teléfono>` (estable entre llamadas). `getBusySlots` devuelve los `GhlEvent` con `status="confirmed"` del calendario/usuario en el rango. Es decir: **el mock se comporta como calendario externo real, incluyendo eventos que el sitio no creó** (los del webhook de WhatsApp).

### 5.5 Cálculo de disponibilidad (`src/lib/availability.ts`)

Única implementación, usada por la API pública y por la validación del POST:

1. Resolver `service.durationMin` y la lista de barberos candidatos (uno, o todos los activos que ofrecen el servicio si `barberId=any`).
2. Para cada barbero: tomar `WorkingHour` del `weekday` local de la fecha pedida. Si no hay o `active=false` → sin slots.
3. Generar candidatos desde `startMin` cada `SLOT_STEP_MINUTES`, aceptando solo los que cumplan `slotStart + durationMin <= endMin`.
4. Descartar el candidato si:
   - solapa con un `TimeOff` del barbero;
   - solapa con una `Appointment` local del barbero con `status="confirmed"`;
   - solapa con un busy de `ghl.getBusySlots()` para ese calendario/usuario;
   - `slotStart < now + MIN_LEAD_MINUTES`.
   Solape = `aStart < bEnd && bStart < aEnd`.
5. Con `barberId=any`, la respuesta es la unión de slots; cada slot expone el `barberId` concreto que se asignará (el barbero activo con menos citas ese día, desempate por `name` asc → determinista).

### 5.6 Creación de cita (`src/lib/booking.ts`) — orden obligatorio

1. Validar payload (Zod) → 422 con `{ error, fields: {campo: mensaje} }`.
2. Normalizar teléfono a E.164 con `DEFAULT_COUNTRY_CODE`; upsert de `Customer` por `phone`.
3. Recalcular disponibilidad del slot exacto → si no está libre, 409 `{ error: "SLOT_TAKEN" }`.
4. Transacción: crear `Appointment` (`status=confirmed`, `ghlSyncStatus=pending`, `manageToken=randomUUID()`, `priceCents` = snapshot del servicio).
5. Fuera de la transacción: `upsertContact` + `createAppointment` en GHL → guardar `ghlEventId`, `ghlSyncStatus="synced"`, y `Customer.ghlContactId`.
6. Si GHL falla: **la cita local se conserva** con `ghlSyncStatus="failed"` + `ghlSyncError`, la respuesta sigue siendo 201, y el panel admin marca la fila con `data-testid="sync-warning"`. Reintento manual desde admin con `POST /api/admin/appointments/[id]` `{action:"resync"}`.
7. Cancelar → `status="cancelled"` + `ghl.cancelAppointment`. Reprogramar → validar nuevo slot, actualizar `startsAt/endsAt` + `ghl.updateAppointment` (mismo `manageToken`, mismo `ghlEventId`).

### 5.7 Contrato de la API (resumen normativo)

Todas las respuestas son JSON. Errores: `{ "error": "<CODE>", "message": "<texto en español>", "fields"?: {...} }`.

| Método y ruta | Request | Respuestas |
|---|---|---|
| `GET /api/health` | — | 200 `{status:"ok", ghlMode:"mock"\|"live", timezone}` |
| `GET /api/services` | `?barberId=` opcional | 200 `{services:[{id,name,description,durationMin,priceCents,active}]}` (solo `active=true`) |
| `GET /api/barbers` | `?serviceId=` opcional | 200 `{barbers:[{id,name,bio,photoUrl,serviceIds:[]}]}` |
| `GET /api/availability` | `?barberId=&serviceId=&date=YYYY-MM-DD` (los 3 requeridos) | 200 `{date,timezone,durationMin,slots:[{start,end,label,barberId}]}` · 400 `INVALID_PARAMS` si falta/mal formato · 404 `NOT_FOUND` si el servicio o barbero no existe |
| `POST /api/appointments` | `{barberId,serviceId,startsAt,customer:{name,phone,email?},notes?}` | 201 `{appointment:{...,manageToken,manageUrl}}` · 422 `VALIDATION_ERROR` · 409 `SLOT_TAKEN` · 404 `NOT_FOUND` |
| `GET /api/appointments/[token]` | — | 200 `{appointment:{...}}` (sin datos de otros clientes) · 404 `NOT_FOUND` |
| `PATCH /api/appointments/[token]` | `{action:"cancel"}` o `{action:"reschedule",startsAt}` | 200 `{appointment}` · 409 `SLOT_TAKEN`/`ALREADY_CANCELLED`/`TOO_LATE` · 404 |
| `POST /api/ghl/webhook` | header `x-ghl-webhook-secret`; body `{type:"AppointmentCreate"\|"AppointmentUpdate"\|"AppointmentDelete", appointment:{id,calendarId,contactId,assignedUserId?,startTime,endTime,title?}, contact?:{name,phone,email?}}` | 200 `{ok:true, appointmentId}` · 401 `UNAUTHORIZED` si el secret no coincide · 400 `INVALID_PAYLOAD` |
| `POST /api/admin/login` | `{user,password}` | 200 + Set-Cookie · 401 `INVALID_CREDENTIALS` |
| `POST /api/admin/logout` | — | 200, cookie borrada |
| `GET /api/admin/appointments` | `?date=` o `?from=&to=` + `barberId`, `status` | 200 `{appointments:[...]}` · 401 |
| `PATCH /api/admin/appointments/[id]` | `{status?}`, `{paymentStatus?}` o `{action:"resync"}` | 200 · 401 · 404 |
| `POST /api/admin/appointments` | `{barberId,serviceId,startsAt,customer:{...}}` (walk-in, `source="admin"`) | 201 · 409 · 401 |
| `GET/POST /api/admin/services`, `PATCH/DELETE /api/admin/services/[id]` | CRUD | 200/201 · 401 · 422 |
| `GET/POST /api/admin/barbers`, `PATCH /api/admin/barbers/[id]` | CRUD | 200/201 · 401 · 422 |
| `PUT /api/admin/barbers/[id]/schedule` | `{hours:[{weekday,startMin,endMin,active}]}` | 200 · 401 · 422 |
| `POST/DELETE /api/admin/barbers/[id]/time-off` | `{startsAt,endsAt,reason?}` | 201/200 · 401 |
| `GET /api/admin/reports/sales` | `?from=&to=` | 200 `{totalRevenueCents,totalAppointments,byService:[{serviceId,name,count,revenueCents}],byBarber:[...],byDay:[{date,count,revenueCents}]}` |
| `GET /api/admin/reports/occupancy` | `?from=&to=` | 200 `{byBarber:[{barberId,name,bookedMinutes,availableMinutes,occupancyPct,appointments}]}` |

Ingresos = suma de `priceCents` de citas con `status="completed"`. `occupancyPct = round(bookedMinutes / availableMinutes * 100)` con `availableMinutes` = suma de ventanas de `WorkingHour` del rango menos `TimeOff`; si `availableMinutes=0` → `occupancyPct=0`.

### 5.8 Seed determinista (`prisma/seed.ts`)

Idempotente (borra y recrea). Contenido exacto:

- **Branch**: `Barbería La Navaja`, tz `America/Mexico_City`, `ghlCalendarId="mock-calendar-1"`.
- **Servicios** (todos activos, en este orden): `Corte clásico` 30 min $250 · `Corte + barba` 45 min $400 · `Afeitado con navaja` 30 min $220 · `Arreglo de barba` 20 min* → **usar 15 min múltiplos: 30 min** $180 · `Corte infantil` 30 min $180.
  (Duraciones finales: 30, 45, 30, 30, 30 minutos; precios en centavos: 25000, 40000, 22000, 18000, 18000.)
- **Barberos** (activos): `Miguel Ángel` (ghlUserId `mock-user-miguel`), `Carlos Ruiz` (`mock-user-carlos`), `Sofía Herrera` (`mock-user-sofia`).
  - Miguel y Carlos ofrecen los 5 servicios. Sofía ofrece `Corte clásico`, `Corte infantil` y `Arreglo de barba`.
  - Horario para los 3: lunes(1)–viernes(5) 09:00–19:00 (`startMin=540`, `endMin=1140`), sábado(6) 10:00–17:00 (600/1020), domingo(0) inactivo.
- **TimeOff**: Sofía libre el **próximo lunes** completo (00:00–23:59 hora local), motivo "Vacaciones".
- **Citas semilla** (se calcula `D` = próximo día hábil lun–sáb estrictamente posterior a hoy):
  1. `web` — Miguel, `Corte clásico`, `D` 10:00 local, cliente `Juan Pérez` / `+525512345678`, status `confirmed`, con `GhlEvent` espejo.
  2. `whatsapp` — Carlos, `Corte + barba`, `D` 12:00 local, cliente `Ana López` / `+525598765432`, status `confirmed`, con `GhlEvent` (`origin="whatsapp"`).
  3. `web` — Miguel, `Corte + barba`, ayer 11:00 local, cliente `Luis Gómez` / `+525511112222`, status `completed`, `paymentStatus="paid_onsite"` (alimenta reportes).
  4. `web` — Sofía, `Corte infantil`, hace 3 días 16:00 local, cliente `Rosa Díaz` / `+525533334444`, status `completed`, `paid_onsite`.
  5. `web` — Carlos, `Afeitado con navaja`, hace 2 días 15:00 local, `Pedro Ramos` / `+525544445555`, status `no_show`.
- Todas las citas semilla llevan `manageToken` fijo y predecible para pruebas: `seed-token-1` … `seed-token-5`.

### 5.9 Comandos

```jsonc
// package.json scripts
"dev":      "next dev -p 3000",
"build":    "prisma generate && prisma migrate deploy && next build",
"start":    "next start -p 3000",
"seed":     "tsx prisma/seed.ts",
"db:push":  "prisma db push",
"db:reset": "prisma migrate reset --force --skip-generate && npm run seed",
"setup":    "npm install && prisma generate && prisma migrate deploy && npm run seed",
"typecheck":"tsc --noEmit",
"lint":     "next lint"
```

Arranque limpio para el Evaluator (documentado en README):

```bash
npm install
npm run db:reset      # recrea SQLite + seed determinista
npm run dev           # http://localhost:3000
```

La app **debe** correr en `http://localhost:3000`. El README incluye además la sección "Conectar GoHighLevel" con los pasos: llenar `GHL_API_KEY`, `GHL_LOCATION_ID`, `GHL_CALENDAR_ID`, poner `GHL_MODE=live`, mapear `Barber.ghlUserId`, y registrar el webhook de GHL apuntando a `POST /api/ghl/webhook` con el header secreto.

---

## 6. Assumptions

Decisiones tomadas por el Planner ante ambigüedad del prompt/PLAN. No requieren confirmación.

1. **Nombre y datos del negocio**: "Barbería La Navaja", zona horaria `America/Mexico_City`, moneda MXN, idioma es-MX. Configurables por env.
2. **Stack**: Next.js 15 App Router + TypeScript + Prisma + SQLite. SQLite basta para una sucursal y hace el harness reproducible sin servicios externos; migrar a Postgres es cambiar `provider` + `DATABASE_URL`.
3. **Pagos**: NO se integra ningún proveedor en este build. Reservar nunca cobra. El modelo guarda `priceCents` y `paymentStatus` (`unpaid`/`paid_onsite`) para reportes; un proveedor (Stripe) se puede añadir después sin migración de datos.
4. **Auth admin**: usuario+contraseña únicos desde env (`admin` / `barberia123` en dev), sesión por cookie httpOnly de 12 h persistida en `AdminSession`. Sin multiusuario ni roles.
5. **Identidad del cliente**: teléfono normalizado a E.164 es la clave única. Dos reservas con el mismo teléfono reusan el mismo `Customer`. El nombre se actualiza al último proporcionado.
6. **Link self-service**: `manageToken` UUID v4 en la URL `/cita/<token>`, sin OTP ni verificación adicional. Es un secreto no adivinable; se considera suficiente para este alcance.
7. **Granularidad de slots**: 15 minutos. Sin buffer de limpieza entre citas. Antelación mínima para reservar/cancelar/reprogramar: 60 minutos.
8. **Horizonte de reserva**: 60 días.
9. **"Cualquier barbero"**: se asigna determinísticamente el barbero elegible con menos citas confirmadas ese día; empate resuelto por nombre ascendente.
10. **Fuente de verdad**: GHL es la autoridad de disponibilidad; la BD local es espejo operativo y respaldo. En `GHL_MODE=mock` la tabla `GhlEvent` cumple ese rol de calendario externo, incluyendo eventos que el sitio no originó.
11. **Fallo de GHL**: nunca bloquea la reserva del cliente (se guarda local con `ghlSyncStatus="failed"` y se reintenta desde admin). Perder la cita del cliente es peor que una desincronización visible y reparable.
12. **Credenciales GHL ausentes**: `GHL_MODE=live` sin credenciales completas hace fallback automático a `mock` con warning en logs; la app nunca falla al arrancar. Los paths exactos de la API v2 quedan aislados en `live.ts` con `// TODO(verify-on-connect)`.
13. **Webhook de GHL**: autenticado por header compartido `x-ghl-webhook-secret`. Es idempotente por `ghlEventId` (reenvíos no duplican citas). Si el `assignedUserId` no mapea a ningún barbero, la cita se registra igual contra el primer barbero activo y se marca `ghlSyncStatus="failed"` para revisión en admin.
14. **Recordatorios y confirmaciones**: fuera de este código; los ejecutan los workflows de GHL. El sitio solo garantiza Contact + Appointment bien formados.
15. **Multi-sucursal**: `Branch` existe con una fila; toda query filtra por la sucursal activa resuelta con `getActiveBranch()` (primera fila). Añadir sucursales después no requiere migración destructiva.
16. **Cancelación por parte del cliente**: permitida hasta 60 min antes, sin penalización. Estado `cancelled` libera el horario inmediatamente en web y en GHL.
17. **Borrado**: servicios y barberos se desactivan (soft delete), nunca se borran si tienen citas históricas, para no romper reportes.
18. **Reportes**: los ingresos cuentan solo citas `completed`; `no_show` y `cancelled` cuentan para ocupación histórica solo si estaban confirmadas en su momento — para simplificar, ocupación cuenta `confirmed` + `completed`.
19. **Sin i18n, sin modo oscuro, sin PWA.** Diseño responsive simple con Tailwind (mobile-first, la mayoría reserva desde el celular).
20. **Puerto fijo 3000** y base de datos SQLite local versionada solo como archivo generado (`prisma/dev.db` en `.gitignore`; las migraciones sí se commitean).

---

## 7. Rubric de evaluación

Cada criterio es binario y verificable con `curl` o Playwright sobre la app corriendo en `http://localhost:3000` después de `npm run db:reset && npm run dev`. "PASA" = se cumple exactamente lo descrito.

### Infraestructura y arranque

1. `npm install && npm run db:reset && npm run dev` arranca sin errores y `GET /api/health` responde 200 con `{"status":"ok"}` e incluye el campo `ghlMode`.
2. `npx tsc --noEmit` termina con código 0 (sin errores de tipos).
3. `GET /` responde 200 y el HTML contiene el nombre del negocio y un elemento `[data-testid="cta-reservar"]` que navega a `/reservar`.

### Catálogo y datos

4. `GET /api/services` responde 200 con un array de **5** servicios, cada uno con `id`, `name`, `durationMin` y `priceCents` numéricos y `active=true`.
5. En `/reservar`, el número de elementos `[data-testid="service-card"]` es igual al número de servicios activos devueltos por `GET /api/services` (el catálogo se refleja en el flujo de reserva).
6. `GET /api/barbers?serviceId=<id de "Corte + barba">` devuelve exactamente 2 barberos (Miguel Ángel y Carlos Ruiz) y **no** incluye a Sofía Herrera.
7. Tras crear un servicio nuevo desde `/admin/servicios` (o `POST /api/admin/services`), ese servicio aparece en `GET /api/services` y como `[data-testid="service-card"]` en `/reservar` sin reiniciar el server.

### Disponibilidad

8. `GET /api/availability?barberId=<Miguel>&serviceId=<Corte clásico>&date=<próximo día hábil>` responde 200 con `slots` no vacío, y **ningún** slot tiene `start` igual a las 10:00 locales de ese día (bloqueado por la cita semilla web).
9. La misma consulta para Carlos Ruiz en el próximo día hábil **no** ofrece slots que solapen las 12:00–12:45 locales (bloqueado por la cita semilla creada vía WhatsApp/GHL).
10. `GET /api/availability` sin el parámetro `date` (o con `date=abc`) responde **400**, no 500.
11. `GET /api/availability?barberId=<Sofía>&serviceId=<Corte clásico>&date=<próximo lunes>` responde 200 con `slots: []` (día libre por `TimeOff`), y la UI muestra `[data-testid="no-slots"]`.
12. Para un domingo, `GET /api/availability` de cualquier barbero devuelve `slots: []` (sin horario laboral).

### Reserva end-to-end (web)

13. Flujo completo en Playwright: servicio → barbero → fecha → slot → nombre "Test Cliente" + teléfono "5511223344" → submit, termina en una URL `/cita/<token>` mostrando `[data-testid="appointment-detail"]` con estado "Confirmada".
14. El form rechaza email inválido: con `input-email = "no-es-email"` y el resto válido, no se crea cita y se muestra `[data-testid="form-error"]`; `POST /api/appointments` con ese email responde **422**.
15. `POST /api/appointments` con teléfono de menos de 10 dígitos responde **422** con `fields.phone` presente.
16. Doble reserva: dos `POST /api/appointments` al mismo `barberId` + `startsAt` → el primero 201, el segundo **409** con `error="SLOT_TAKEN"`.
17. Después de reservar un slot vía API, ese `start` ya no aparece en `GET /api/availability` para ese barbero y fecha.

### Sincronización con GHL

18. Tras un `POST /api/appointments` exitoso (modo mock), la cita queda con `ghlEventId` no nulo y `ghlSyncStatus="synced"` — verificable en `GET /api/admin/appointments` (autenticado) o en el detalle admin de la cita.
19. `POST /api/ghl/webhook` con `x-ghl-webhook-secret` correcto y `type="AppointmentCreate"` en un horario libre responde 200 y (a) crea una cita con `source="whatsapp"` visible en el panel admin, y (b) ese horario deja de ofrecerse en `GET /api/availability`.
20. `POST /api/ghl/webhook` sin el header secreto o con secreto incorrecto responde **401** y no crea nada.
21. Reenviar el mismo payload de webhook (mismo `appointment.id`) dos veces no duplica la cita: el conteo de citas del panel no cambia entre el primer y el segundo envío.

### Self-service: cancelar y reprogramar

22. `GET /api/appointments/seed-token-1` responde 200 con la cita de Juan Pérez; `GET /api/appointments/token-inexistente` responde **404**.
23. Reprogramar en UI: en `/cita/<token>` de una cita futura, click en `[data-testid="reschedule-button"]`, elegir otro slot y confirmar → la página muestra el nuevo horario, la cita sigue `Confirmada`, y el horario anterior vuelve a estar disponible en `GET /api/availability`.
24. Cancelar en UI: click en `[data-testid="cancel-button"]` + confirmar → `[data-testid="appointment-status"]` dice "Cancelada", los botones de acción desaparecen, y el horario liberado reaparece en `GET /api/availability`.
25. `PATCH /api/appointments/<token>` con `{"action":"cancel"}` sobre una cita ya cancelada responde **409**.

### Panel de administración

26. `/admin` sin sesión redirige a `/admin/login`; `GET /api/admin/appointments` sin cookie responde **401**.
27. Login con credenciales incorrectas muestra `[data-testid="login-error"]` y responde 401; login con `admin`/`barberia123` entra a `/admin`.
28. El dashboard `/admin` muestra `[data-testid="kpi-citas-hoy"]`, `[data-testid="kpi-ingresos-hoy"]` y `[data-testid="kpi-ocupacion-hoy"]` con valores numéricos, y la tabla de próximas citas `[data-testid="upcoming-table"]` contiene al menos las 2 citas futuras del seed (una `web`, una `whatsapp`).
29. Una cita creada desde la web durante la evaluación aparece como fila `[data-testid="appointment-row"]` en `/admin/citas` con el nombre y teléfono del cliente.
30. Cambiar el estado de una cita a "Completada" desde `/admin/citas` persiste tras recargar la página.
31. `/admin/reportes` (rango últimos 30 días) muestra `[data-testid="report-total-revenue"]` con un importe > $0 y una tabla `[data-testid="report-by-service"]` con al menos una fila; el total coincide con la suma de `priceCents` de las citas `completed` del seed ($250 + $180 = **$430.00**).
32. `[data-testid="report-by-barber"]` lista los 3 barberos con columna de `% ocupación` entre 0 y 100 para cada uno.
33. `/admin/barberos` permite editar el horario de un barbero (p. ej. sábado inactivo) vía `[data-testid="schedule-row-6"]`, y tras guardar, `GET /api/availability` de ese barbero para el próximo sábado devuelve `slots: []`.

### Documentación y preparación de credenciales

34. `.env.example` existe y contiene, con esos nombres exactos, `GHL_API_KEY`, `GHL_LOCATION_ID`, `GHL_CALENDAR_ID`, `GHL_MODE` y `GHL_WEBHOOK_SECRET`.
35. `README.md` documenta el comando exacto de arranque, el de reseteo de datos (`npm run db:reset`) y una sección de cómo conectar GHL cuando lleguen las credenciales.
36. Con `GHL_MODE=live` y `GHL_API_KEY` vacío, la app arranca igual (no crashea) y `GET /api/health` sigue respondiendo 200 reportando `ghlMode:"mock"`.

**Definición de terminado:** 36/36 criterios PASAN.
