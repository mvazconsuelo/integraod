export interface SettingsRow {
  id: 1;
  name: string;
  logo_data_url: string | null;
  phone: string;
  email: string;
  address: string;
  professional_info: string;
  primary_color: string;
  accent_color: string;
  terms: string;
  default_validity_days: number;
  time_zone: string;
}

export const getSettings = (db: D1Database) =>
  db.prepare("SELECT * FROM clinic_settings WHERE id = 1").first<SettingsRow>() as Promise<SettingsRow>;

export async function updateProfile(db: D1Database, s: Omit<SettingsRow, "id">) {
  await db
    .prepare(
      `UPDATE clinic_settings SET name=?, logo_data_url=?, phone=?, email=?, address=?, professional_info=?,
       primary_color=?, accent_color=?, terms=?, default_validity_days=?, time_zone=?, updated_at=strftime('%Y-%m-%dT%H:%M:%fZ','now') WHERE id=1`,
    )
    .bind(s.name, s.logo_data_url, s.phone, s.email, s.address, s.professional_info, s.primary_color, s.accent_color, s.terms, s.default_validity_days, s.time_zone)
    .run();
}
