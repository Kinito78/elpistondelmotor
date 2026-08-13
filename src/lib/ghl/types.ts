export interface GhlBusySlot {
  startsAt: Date;
  endsAt: Date;
  ghlEventId: string;
}

export interface GhlClient {
  mode: "mock" | "live";
  upsertContact(input: {
    name: string;
    phone: string;
    email?: string;
  }): Promise<{ contactId: string }>;
  getBusySlots(input: {
    calendarId: string;
    assignedUserId?: string;
    from: Date;
    to: Date;
  }): Promise<GhlBusySlot[]>;
  createAppointment(input: {
    calendarId: string;
    contactId: string;
    assignedUserId?: string;
    startsAt: Date;
    endsAt: Date;
    title: string;
    notes?: string;
  }): Promise<{ ghlEventId: string }>;
  updateAppointment(input: {
    ghlEventId: string;
    startsAt: Date;
    endsAt: Date;
  }): Promise<void>;
  cancelAppointment(input: { ghlEventId: string }): Promise<void>;
}
