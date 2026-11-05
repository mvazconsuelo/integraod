-- El logo deja de guardarse como texto en la base: es un archivo (R2, binding FILES). Acá queda solo su versión (para que el navegador
-- lo vuelva a pedir cuando cambia). NULL = sin logo. El texto viejo (logo_data_url) se pasa a archivo la primera vez que se lee y se vacía.
-- Para deshacer: ALTER TABLE clinic_settings DROP COLUMN logo_version;
ALTER TABLE clinic_settings ADD COLUMN logo_version INTEGER;
