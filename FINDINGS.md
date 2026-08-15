# Findings — pass 1 · 2026-08-13

## Resumen
36/36 criterios del rubric (SPEC.md §7) pasan.

Verificación ejecutada como usuario real tras `npm install && npm run db:reset && npm run dev`
(seed determinista, día hábil de referencia `2026-08-14`). Se usó Playwright (Chromium, instalado
en el scratchpad de esta sesión) para todos los flujos de UI y `curl` para la API. También se probó
explícitamente `GHL_MODE=live` sin credenciales (arranque en caliente con `.env` modificado y
restaurado después) y se corrió `npx tsc --noEmit`.

No se encontraron defectos en la app. Las únicas "fallas" observadas durante la evaluación fueron
condiciones de carrera en mis propios scripts de prueba (esperas insuficientes antes de leer
`[data-testid="barber-card"]`/`[data-testid="no-slots"]`, que aún no habían terminado de cargar);
al corregir la espera en el script de evaluación, los mismos escenarios pasaron de forma consistente
y repetible contra la app sin tocar código.

## Abiertos
(ninguno)

## Resueltos (verificados este pass)
- [x] C1 · infra — `npm install && npm run db:reset && npm run dev` arranca sin errores; `GET /api/health` → 200 `{"status":"ok","ghlMode":"mock",...}`.
- [x] C2 · infra — `npx tsc --noEmit` termina con código 0.
- [x] C3 · landing — `GET /` 200, contiene "Barbería La Navaja" y `[data-testid="cta-reservar"]` navega a `/reservar`.
- [x] C4 · catálogo — `GET /api/services` devuelve 5 servicios con `id/name/durationMin/priceCents` numéricos y `active:true`.
- [x] C5 · catálogo — `/reservar` renderiza 5 `[data-testid="service-card"]`, igual al catálogo activo (y sigue en paridad tras alta de un 6º servicio en C7).
- [x] C6 · catálogo — `GET /api/barbers?serviceId=<Corte+barba>` devuelve exactamente Carlos Ruiz y Miguel Ángel; Sofía Herrera excluida.
- [x] C7 · catálogo — servicio nuevo creado vía `[data-testid="service-form"]` en `/admin/servicios` aparece de inmediato en `GET /api/services` y como `service-card` en `/reservar`, sin reiniciar el server.
- [x] C8 · disponibilidad — Miguel, Corte clásico, próximo día hábil: 36 slots, ninguno a las 10:00 locales (bloqueado por cita semilla web).
- [x] C9 · disponibilidad — Carlos, Corte+barba, mismo día: sin slots que solapen 12:00–12:45 (cita semilla whatsapp).
- [x] C10 · disponibilidad — `GET /api/availability` sin `date` o con `date=abc` → 400 `INVALID_PARAMS` (no 500).
- [x] C11 · disponibilidad — Sofía, próximo lunes (día libre) → `slots:[]`; UI muestra `[data-testid="no-slots"]` con el texto exacto.
- [x] C12 · disponibilidad — domingo → `slots:[]` para cualquier barbero.
- [x] C13 · reserva — flujo Playwright completo (servicio → barbero → fecha → slot → datos) termina en `/cita/<token>` con `[data-testid="appointment-detail"]` y estado "Confirmada".
- [x] C14 · reserva — email inválido rechazado en UI (`[data-testid="form-error"]`, sin navegar) y `POST /api/appointments` con ese email → 422.
- [x] C15 · reserva — teléfono corto → 422 con `fields.phone` presente.
- [x] C16 · reserva — doble `POST` al mismo `barberId`+`startsAt`: 1º 201, 2º 409 `SLOT_TAKEN`.
- [x] C17 · reserva — slot reservado desaparece de `GET /api/availability` para ese barbero/fecha.
- [x] C18 · GHL sync — cita creada por API queda con `ghlEventId` no nulo y `ghlSyncStatus:"synced"`, visible en `GET /api/admin/appointments` autenticado.
- [x] C19 · GHL webhook — `POST /api/ghl/webhook` con secret correcto y `AppointmentCreate` en horario libre → 200, crea cita `source="whatsapp"` visible en admin, y ese horario deja de ofrecerse en `/api/availability`.
- [x] C20 · GHL webhook — sin header o con secret incorrecto → 401, no crea nada.
- [x] C21 · GHL webhook — reenviar mismo `appointment.id` no duplica (conteo de citas igual antes/después del reenvío).
- [x] C22 · self-service — `GET /api/appointments/seed-token-1` → 200 (Juan Pérez); token inexistente → 404.
- [x] C23 · self-service — reprogramar en UI (`reschedule-button` → nuevo slot → `confirm-reschedule`) actualiza el horario mostrado, mantiene "Confirmada", mismo token, y el horario anterior reaparece en `/api/availability`.
- [x] C24 · self-service — cancelar en UI (`cancel-button` → `confirm-cancel`) deja estado "Cancelada", oculta los botones de acción, y libera el slot en `/api/availability`.
- [x] C25 · self-service — `PATCH .../cancel` sobre cita ya cancelada → 409 `ALREADY_CANCELLED`.
- [x] C26 · admin — `/admin` sin sesión → redirect a `/admin/login`; `GET /api/admin/appointments` sin cookie → 401.
- [x] C27 · admin — login incorrecto → `[data-testid="login-error"]` + 401; login `admin`/`barberia123` → entra a `/admin`.
- [x] C28 · admin — dashboard muestra los 3 KPIs con valores numéricos; `[data-testid="upcoming-table"]` incluye Juan Pérez (web) y Ana López (whatsapp), ambas futuras y "Confirmada".
- [x] C29 · admin — citas creadas durante la evaluación aparecen como `[data-testid="appointment-row"]` en `/admin/citas` con nombre/teléfono del cliente.
- [x] C30 · admin — marcar "Completada" desde `/admin/citas` persiste tras recargar la página.
- [x] C31 · admin — `/admin/reportes` (últimos 30 días) muestra `report-total-revenue = $430.00` (coincide con $250+$180 del seed) y `report-by-service` con filas.
- [x] C32 · admin — `report-by-barber` lista Miguel Ángel, Carlos Ruiz y Sofía Herrera, cada uno con `% ocupación` dentro de [0,100].
- [x] C33 · admin — desactivar sábado (`schedule-active-6`) para Miguel y guardar → `GET /api/availability` de Miguel para el siguiente sábado devuelve `slots:[]` (pasó de 25 slots a 0).
- [x] C34 · docs — `.env.example` contiene `GHL_API_KEY`, `GHL_LOCATION_ID`, `GHL_CALENDAR_ID`, `GHL_MODE`, `GHL_WEBHOOK_SECRET` con esos nombres exactos.
- [x] C35 · docs — `README.md` documenta el arranque exacto, `npm run db:reset`, y una sección "Conectar GoHighLevel".
- [x] C36 · docs — con `GHL_MODE=live` y `GHL_API_KEY` vacío, la app arranca sin crashear, loguea `[GHL] credenciales incompletas → modo mock`, y `GET /api/health` reporta `ghlMode:"mock"`.

## Notas de proceso (no son defectos de la app)
- Playwright/Chromium no estaba preinstalado en el entorno; se instaló temporalmente en el
  directorio de scratchpad de esta sesión (`npm install playwright@1.62.1` + `npx playwright
  install chromium`) solo para poder ejecutar los flujos de UI. No se tocó `package.json` de la app.
- Durante la evaluación se creó una cita de prueba residual el mismo día de hoy (Test Cliente,
  vía un script de evaluación con una condición de carrera que seleccionó "Sofía" en vez de
  "Miguel" antes de corregir la espera) y varias citas de prueba adicionales (Test Cliente x2,
  Cancel Target, Servicio Eval <timestamp>). Son datos de prueba válidos generados por flujos
  reales de la app, no artefactos rotos; `npm run db:reset` los elimina y vuelve al estado
  determinista del seed.
- El servidor de desarrollo se detuvo al finalizar esta evaluación (no queda proceso en :3000).
