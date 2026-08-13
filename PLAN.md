# PLAN.md — Contexto de negocio

## Producto
Agendador web para una barbería, con reservas tanto desde una página web propia como por WhatsApp (vía el bot conversacional nativo de GoHighLevel). El calendario de GHL es la única fuente de verdad de disponibilidad, para que una cita reservada por web y otra por WhatsApp nunca choquen en el mismo horario.

## Alcance actual
- Una sola sucursal por ahora. El modelo de datos debe poder extenderse a multi-sucursal en el futuro (no es requisito de este build, pero no debe hacer imposible agregarlo después).
- Sitio con dominio/hosting propio (NO se construye dentro del builder/funnels de GHL). Se conecta a GHL exclusivamente vía su API.

## Reservas
- Dos canales, mismo backend de disponibilidad (GHL Calendar API):
  1. Página web pública: el cliente elige barbero, servicio y horario, y confirma.
  2. WhatsApp: usa el bot conversacional de GHL (Conversation AI) contra el mismo calendario.
- Sin cuenta ni login de cliente. Identificación por **nombre + teléfono** (el teléfono es el identificador único y coincide con el contacto de WhatsApp/GHL).
- El cliente puede cancelar o reprogramar su propia cita (self-service), desde un link o por WhatsApp.

## Servicios y barberos
- Catálogo de servicios administrable: nombre, duración, precio.
- Gestión de barberos: horario/disponibilidad por barbero, qué servicios ofrece cada uno, días libres.

## Pagos
- Opcional, no bloqueante. Reservar no requiere pago — normalmente se paga en el local. Si se implementa pago online, es un extra opcional (proveedor a decidir por el Planner, ej. Stripe).

## Panel de administración
- Vista de citas del día / próximas.
- Reportes de ventas / ingresos.
- Ocupación por barbero.

## Integración con GoHighLevel
- Ya existe cuenta de GHL, pero **aún no hay API key ni Location ID**. La integración debe quedar completamente implementada y documentada (variables de entorno claramente nombradas, ej. `GHL_API_KEY`, `GHL_LOCATION_ID`), lista para conectar en cuanto se tengan las credenciales. Esto no debe bloquear el resto del desarrollo — usar mocks/stubs de la API de GHL mientras tanto si hace falta para probar el resto del sitio.
- Cada cita creada (por web o por WhatsApp) debe sincronizarse como Appointment + Contact en GHL, con los datos necesarios para que los workflows nativos de GHL (recordatorios por WhatsApp, confirmaciones) puedan dispararse. **No se construyen recordatorios a mano** — eso lo hace GHL vía sus propios workflows; el sitio solo debe garantizar que la cita queda bien registrada.

## Fuera de alcance (por ahora)
- Multi-sucursal real (varias sub-cuentas o calendarios simultáneos).
- Pago obligatorio / depósitos forzosos.
- Cuentas de cliente con login.
- Construcción manual de flujos de recordatorio (eso es configuración dentro de GHL, no código de este build).

## Notas para el Planner
- Estos assumptions ya están decididos por el humano — no hace falta re-preguntarlos, solo documentarlos en el SPEC.
- El stack técnico queda a criterio del Planner (elegir algo simple y estándar).
- El rubric de evaluación debe incluir al menos: creación de cita desde la web escribe correctamente en GHL (o en el stub, si no hay credenciales aún), catálogo de servicios se refleja en el flujo de reserva, disponibilidad de barbero bloquea horarios ya tomados, cancelación/reprogramación funciona end-to-end, panel admin muestra citas y reportes correctamente.
