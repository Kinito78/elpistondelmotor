/**
 * Seed determinista. Idempotente: borra y recrea todo.
 * Ver SPEC.md §5.8.
 */
import "dotenv/config";
import { PrismaClient } from "@prisma/client";
import { createHash, randomUUID } from "crypto";
import { fromZonedTime, formatInTimeZone } from "date-fns-tz";

const prisma = new PrismaClient();

const TZ = process.env.BUSINESS_TIMEZONE || "America/Mexico_City";
const BUSINESS_NAME = process.env.BUSINESS_NAME || "Barbería La Navaja";
const CALENDAR_ID = "mock-calendar-1";

const pad = (n: number) => String(n).padStart(2, "0");

function localToUtc(date: string, hour: number, minute = 0): Date {
  return fromZonedTime(`${date}T${pad(hour)}:${pad(minute)}:00`, TZ);
}

function todayLocal(): string {
  return formatInTimeZone(new Date(), TZ, "yyyy-MM-dd");
}

function addDays(date: string, days: number): string {
  const [y, m, d] = date.split("-").map(Number);
  const dt = new Date(Date.UTC(y, m - 1, d));
  dt.setUTCDate(dt.getUTCDate() + days);
  return `${dt.getUTCFullYear()}-${pad(dt.getUTCMonth() + 1)}-${pad(dt.getUTCDate())}`;
}

function weekdayOf(date: string): number {
  const [y, m, d] = date.split("-").map(Number);
  return new Date(Date.UTC(y, m - 1, d)).getUTCDay();
}

/** Próximo día hábil (lun–sáb) estrictamente posterior a hoy. */
function nextBusinessDay(from: string): string {
  let cur = addDays(from, 1);
  while (weekdayOf(cur) === 0) cur = addDays(cur, 1);
  return cur;
}

/** Próximo lunes estrictamente posterior a hoy. */
function nextMonday(from: string): string {
  let cur = addDays(from, 1);
  while (weekdayOf(cur) !== 1) cur = addDays(cur, 1);
  return cur;
}

function mockContactId(phone: string): string {
  return `mockct_${createHash("sha1").update(phone).digest("hex").slice(0, 12)}`;
}

async function main() {
  // Reset completo (orden de dependencias)
  await prisma.adminSession.deleteMany();
  await prisma.ghlEvent.deleteMany();
  await prisma.appointment.deleteMany();
  await prisma.timeOff.deleteMany();
  await prisma.workingHour.deleteMany();
  await prisma.barberService.deleteMany();
  await prisma.customer.deleteMany();
  await prisma.barber.deleteMany();
  await prisma.service.deleteMany();
  await prisma.branch.deleteMany();

  const branch = await prisma.branch.create({
    data: {
      name: BUSINESS_NAME,
      timezone: TZ,
      address: "Av. Insurgentes Sur 1234, Ciudad de México",
      phone: "+525555555555",
      ghlLocationId: null,
      ghlCalendarId: CALENDAR_ID,
    },
  });

  const serviceDefs = [
    { name: "Corte clásico", durationMin: 30, priceCents: 25000, description: "Corte a tijera y máquina con acabado a navaja." },
    { name: "Corte + barba", durationMin: 45, priceCents: 40000, description: "Corte completo más perfilado y arreglo de barba." },
    { name: "Afeitado con navaja", durationMin: 30, priceCents: 22000, description: "Afeitado clásico con toalla caliente." },
    { name: "Arreglo de barba", durationMin: 30, priceCents: 18000, description: "Perfilado, recorte y aceite para barba." },
    { name: "Corte infantil", durationMin: 30, priceCents: 18000, description: "Corte para niños menores de 12 años." },
  ];

  const services = [];
  for (let i = 0; i < serviceDefs.length; i++) {
    services.push(
      await prisma.service.create({
        data: { ...serviceDefs[i], branchId: branch.id, active: true, sortOrder: i },
      })
    );
  }
  const byName = (name: string) => services.find((s) => s.name === name)!;

  const barberDefs = [
    { name: "Miguel Ángel", ghlUserId: "mock-user-miguel", bio: "20 años de oficio. Especialista en corte clásico.", all: true },
    { name: "Carlos Ruiz", ghlUserId: "mock-user-carlos", bio: "Fades, diseños y barba a navaja.", all: true },
    { name: "Sofía Herrera", ghlUserId: "mock-user-sofia", bio: "Corte infantil y arreglo de barba.", all: false },
  ];

  const barbers = [];
  for (const def of barberDefs) {
    const barber = await prisma.barber.create({
      data: {
        branchId: branch.id,
        name: def.name,
        bio: def.bio,
        active: true,
        ghlUserId: def.ghlUserId,
      },
    });
    const offered = def.all
      ? services
      : [byName("Corte clásico"), byName("Corte infantil"), byName("Arreglo de barba")];
    for (const service of offered) {
      await prisma.barberService.create({
        data: { barberId: barber.id, serviceId: service.id },
      });
    }
    // Horario: lun–vie 09:00–19:00, sábado 10:00–17:00, domingo inactivo.
    for (let weekday = 0; weekday <= 6; weekday++) {
      const isSunday = weekday === 0;
      const isSaturday = weekday === 6;
      await prisma.workingHour.create({
        data: {
          barberId: barber.id,
          weekday,
          startMin: isSaturday ? 600 : 540,
          endMin: isSaturday ? 1020 : 1140,
          active: !isSunday,
        },
      });
    }
    barbers.push(barber);
  }

  const miguel = barbers.find((b) => b.name === "Miguel Ángel")!;
  const carlos = barbers.find((b) => b.name === "Carlos Ruiz")!;
  const sofia = barbers.find((b) => b.name === "Sofía Herrera")!;

  // TimeOff: Sofía libre el próximo lunes completo.
  const today = todayLocal();
  const monday = nextMonday(today);
  await prisma.timeOff.create({
    data: {
      barberId: sofia.id,
      startsAt: localToUtc(monday, 0, 0),
      endsAt: localToUtc(monday, 23, 59),
      reason: "Vacaciones",
    },
  });

  const D = nextBusinessDay(today);
  const yesterday = addDays(today, -1);
  const threeDaysAgo = addDays(today, -3);
  const twoDaysAgo = addDays(today, -2);

  const customerDefs = [
    { name: "Juan Pérez", phone: "+525512345678", email: "juan.perez@example.com" },
    { name: "Ana López", phone: "+525598765432", email: null },
    { name: "Luis Gómez", phone: "+525511112222", email: null },
    { name: "Rosa Díaz", phone: "+525533334444", email: null },
    { name: "Pedro Ramos", phone: "+525544445555", email: null },
  ];
  const customers = [];
  for (const def of customerDefs) {
    customers.push(
      await prisma.customer.create({
        data: { ...def, ghlContactId: mockContactId(def.phone) },
      })
    );
  }
  const customerByPhone = (phone: string) => customers.find((c) => c.phone === phone)!;

  type SeedAppt = {
    token: string;
    barberId: string;
    serviceName: string;
    date: string;
    hour: number;
    minute?: number;
    phone: string;
    status: string;
    source: string;
    paymentStatus?: string;
    ghl?: { origin: string } | null;
  };

  const seedAppointments: SeedAppt[] = [
    {
      token: "seed-token-1",
      barberId: miguel.id,
      serviceName: "Corte clásico",
      date: D,
      hour: 10,
      phone: "+525512345678",
      status: "confirmed",
      source: "web",
      ghl: { origin: "web" },
    },
    {
      token: "seed-token-2",
      barberId: carlos.id,
      serviceName: "Corte + barba",
      date: D,
      hour: 12,
      phone: "+525598765432",
      status: "confirmed",
      source: "whatsapp",
      ghl: { origin: "whatsapp" },
    },
    {
      // Cita completada que alimenta los reportes ($250.00).
      token: "seed-token-3",
      barberId: miguel.id,
      serviceName: "Corte clásico",
      date: yesterday,
      hour: 11,
      phone: "+525511112222",
      status: "completed",
      source: "web",
      paymentStatus: "paid_onsite",
      ghl: { origin: "web" },
    },
    {
      // Cita completada que alimenta los reportes ($180.00).
      token: "seed-token-4",
      barberId: sofia.id,
      serviceName: "Corte infantil",
      date: threeDaysAgo,
      hour: 16,
      phone: "+525533334444",
      status: "completed",
      source: "web",
      paymentStatus: "paid_onsite",
      ghl: { origin: "web" },
    },
    {
      token: "seed-token-5",
      barberId: carlos.id,
      serviceName: "Afeitado con navaja",
      date: twoDaysAgo,
      hour: 15,
      phone: "+525544445555",
      status: "no_show",
      source: "web",
      ghl: { origin: "web" },
    },
  ];

  for (const def of seedAppointments) {
    const service = byName(def.serviceName);
    const customer = customerByPhone(def.phone);
    const barber = barbers.find((b) => b.id === def.barberId)!;
    const startsAt = localToUtc(def.date, def.hour, def.minute ?? 0);
    const endsAt = new Date(startsAt.getTime() + service.durationMin * 60_000);

    let ghlEventId: string | null = null;
    if (def.ghl) {
      ghlEventId = `mock_${randomUUID()}`;
      await prisma.ghlEvent.create({
        data: {
          ghlEventId,
          ghlCalendarId: CALENDAR_ID,
          ghlContactId: customer.ghlContactId,
          assignedUserId: barber.ghlUserId,
          barberId: barber.id,
          title: `${service.name} - ${customer.name}`,
          startsAt,
          endsAt,
          status: def.status === "cancelled" ? "cancelled" : "confirmed",
          origin: def.ghl.origin,
          raw: JSON.stringify({ seed: true }),
        },
      });
    }

    const occupies = def.status === "confirmed" || def.status === "completed";

    await prisma.appointment.create({
      data: {
        branchId: branch.id,
        barberId: barber.id,
        serviceId: service.id,
        customerId: customer.id,
        startsAt,
        endsAt,
        status: def.status,
        source: def.source,
        priceCents: service.priceCents,
        paymentStatus: def.paymentStatus ?? "unpaid",
        manageToken: def.token,
        slotKey: occupies ? `${barber.id}|${startsAt.toISOString()}` : null,
        ghlEventId,
        ghlSyncStatus: ghlEventId ? "synced" : "pending",
      },
    });
  }

  console.log("Seed listo:");
  console.log(`  Sucursal:  ${branch.name} (${TZ})`);
  console.log(`  Servicios: ${services.length}`);
  console.log(`  Barberos:  ${barbers.length}`);
  console.log(`  Citas:     ${seedAppointments.length} (día hábil de referencia: ${D})`);
  console.log(`  Sofía libre: ${monday}`);
}

main()
  .then(async () => {
    await prisma.$disconnect();
  })
  .catch(async (err) => {
    console.error(err);
    await prisma.$disconnect();
    process.exit(1);
  });
