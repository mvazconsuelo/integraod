/** Zona horaria del consultorio (se configura en Configuración; el servidor usa la misma). */
export const DEFAULT_TIME_ZONE = "America/Argentina/Mendoza";

let zone = DEFAULT_TIME_ZONE;

const valid = (tz: string) => { try { new Intl.DateTimeFormat("en-US", { timeZone: tz }); return true; } catch { return false; } };
export const setClinicTimeZone = (tz: string | undefined) => { zone = tz && valid(tz) ? tz : DEFAULT_TIME_ZONE; };
export const clinicTimeZone = () => zone;

/** El día (YYYY-MM-DD) del consultorio de un instante. */
export const dayOf = (at: Date) => new Intl.DateTimeFormat("en-CA", { timeZone: zone, year: "numeric", month: "2-digit", day: "2-digit" }).format(at);

/** Zonas más usadas, con nombre claro. */
export const TIME_ZONES: { value: string; label: string }[] = [
  { value: "America/Argentina/Mendoza", label: "Argentina (UTC-3)" },
  { value: "America/Montevideo", label: "Uruguay (UTC-3)" },
  { value: "America/Santiago", label: "Chile" },
  { value: "America/Asuncion", label: "Paraguay" },
  { value: "America/La_Paz", label: "Bolivia (UTC-4)" },
  { value: "America/Sao_Paulo", label: "Brasil · São Paulo" },
  { value: "America/Lima", label: "Perú (UTC-5)" },
  { value: "America/Bogota", label: "Colombia (UTC-5)" },
  { value: "America/Mexico_City", label: "México · Ciudad de México" },
  { value: "Europe/Madrid", label: "España" },
];
