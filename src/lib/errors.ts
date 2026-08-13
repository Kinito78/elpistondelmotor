export class HttpError extends Error {
  status: number;
  code: string;
  fields?: Record<string, string>;

  constructor(status: number, code: string, message: string, fields?: Record<string, string>) {
    super(message);
    this.name = "HttpError";
    this.status = status;
    this.code = code;
    this.fields = fields;
  }
}

export const notFound = (message = "No encontrado") => new HttpError(404, "NOT_FOUND", message);
export const invalidParams = (message = "Parámetros inválidos") =>
  new HttpError(400, "INVALID_PARAMS", message);
export const slotTaken = () =>
  new HttpError(409, "SLOT_TAKEN", "Ese horario ya fue reservado, elige otro");
