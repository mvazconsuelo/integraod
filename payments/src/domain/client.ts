/** Una app que usa este servicio (consultorio, peluquería…). Las claves ya vienen descifradas. */
export interface Client {
  id: string;
  name: string;
  status: "active" | "suspended";
  /** Claves vigentes para verificar los pedidos de la app (la anterior se acepta mientras dura una rotación). */
  secrets: string[];
  eventsUrl: string;
  eventsSecret: string;
  appUrl: string;
}

export const CLIENT_ID = /^[a-z0-9][a-z0-9-]{2,39}$/;
