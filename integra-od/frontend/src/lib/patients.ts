/** Ruta de la ficha de un contacto (el nombre puede tener espacios y tildes). */
export const patientPath = (name: string) => `/contactos/${encodeURIComponent(name.trim())}`;
