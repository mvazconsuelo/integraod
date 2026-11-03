/** Imprime con un título propio: es el nombre que propone el navegador al guardar como PDF. Después restituye el título. */
export function printAs(title: string) {
  const previous = document.title;
  document.title = title;
  window.addEventListener("afterprint", () => { document.title = previous; }, { once: true });
  window.print();
}
