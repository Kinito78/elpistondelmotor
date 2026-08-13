import type { Appointment, Barber, Customer, Service } from "@prisma/client";
import { formatPrice, maskPhone, statusLabel } from "./format";
import { labelHHmm, labelLong } from "./time";

export type AppointmentWithRelations = Appointment & {
  barber: Barber;
  service: Service;
  customer: Customer;
};

/** Vista pública (self-service): nunca expone datos de otros clientes. */
export function publicAppointment(a: AppointmentWithRelations) {
  return {
    id: a.id,
    startsAt: a.startsAt.toISOString(),
    endsAt: a.endsAt.toISOString(),
    status: a.status,
    statusLabel: statusLabel(a.status),
    source: a.source,
    priceCents: a.priceCents,
    priceLabel: formatPrice(a.priceCents),
    paymentStatus: a.paymentStatus,
    notes: a.notes,
    manageToken: a.manageToken,
    manageUrl: `/cita/${a.manageToken}`,
    dateLabel: labelLong(a.startsAt),
    timeLabel: labelHHmm(a.startsAt),
    service: {
      id: a.service.id,
      name: a.service.name,
      durationMin: a.service.durationMin,
    },
    barber: {
      id: a.barber.id,
      name: a.barber.name,
    },
    customer: {
      name: a.customer.name,
      phoneMasked: maskPhone(a.customer.phone),
    },
  };
}

/** Vista admin: incluye teléfono completo y estado de sincronización. */
export function adminAppointment(a: AppointmentWithRelations) {
  return {
    ...publicAppointment(a),
    ghlEventId: a.ghlEventId,
    ghlSyncStatus: a.ghlSyncStatus,
    ghlSyncError: a.ghlSyncError,
    createdAt: a.createdAt.toISOString(),
    customer: {
      id: a.customer.id,
      name: a.customer.name,
      phone: a.customer.phone,
      phoneMasked: maskPhone(a.customer.phone),
      email: a.customer.email,
    },
  };
}

export type PublicAppointment = ReturnType<typeof publicAppointment>;
export type AdminAppointment = ReturnType<typeof adminAppointment>;
