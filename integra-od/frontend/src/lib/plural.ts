/** plural(1, "solicitud", "solicitudes") -> "1 solicitud"; plural(2, ...) -> "2 solicitudes" */
export const plural = (n: number, one: string, many: string) => `${n} ${n === 1 ? one : many}`;
