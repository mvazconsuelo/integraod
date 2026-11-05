export interface SettingsRow {
  id: 1;
  name: string;
  /** Texto viejo del logo: ya no se escribe (el logo es un archivo); se vacía al migrarlo. */
  logo_data_url: string | null;
  /** Versión del archivo del logo (null: sin logo). */
  logo_version: number | null;
  phone: string;
  email: string;
  address: string;
  professional_info: string;
  primary_color: string;
  accent_color: string;
  terms: string;
  /** Datos para transferir: titular, CBU/CVU y alias (vacío si no se cargaron). */
  bank_holder: string;
  bank_cbu: string;
  bank_alias: string;
  /** Ya no se usa (cada presupuesto tiene su fecha límite opcional): queda la columna, sin escribirse. */
  default_validity_days: number;
  time_zone: string;
}

export const getSettings = (db: D1Database) =>
  db.prepare("SELECT * FROM clinic_settings WHERE id = 1").first<SettingsRow>() as Promise<SettingsRow>;

export async function updateProfile(db: D1Database, s: Omit<SettingsRow, "id" | "logo_data_url" | "logo_version" | "default_validity_days">) {
  await db
    .prepare(
      `UPDATE clinic_settings SET name=?, phone=?, email=?, address=?, professional_info=?,
       primary_color=?, accent_color=?, terms=?, bank_holder=?, bank_cbu=?, bank_alias=?, time_zone=?, updated_at=strftime('%Y-%m-%dT%H:%M:%fZ','now') WHERE id=1`,
    )
    .bind(s.name, s.phone, s.email, s.address, s.professional_info, s.primary_color, s.accent_color, s.terms, s.bank_holder, s.bank_cbu, s.bank_alias, s.time_zone)
    .run();
}
