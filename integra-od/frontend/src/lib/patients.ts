/** Ruta de la ficha de un cliente (el nombre puede tener espacios y tildes). */
export const patientPath = (name: string) => `/clientes/${encodeURIComponent(name.trim())}`;
