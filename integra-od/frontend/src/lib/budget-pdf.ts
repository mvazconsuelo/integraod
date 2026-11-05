import { formatMoney } from "@/lib/currency";
import { KIND_LABEL, methodLabel, formatDateNumeric } from "@/lib/formatters";
import type { BudgetDetail, Settings } from "@/types";

const money = (cents: number) => formatMoney(cents).replace(/\s/g, " ");
const rgb = (hex: string): [number, number, number] => { const n = parseInt(hex.replace("#", "").padEnd(6, "0").slice(0, 6), 16); return [(n >> 16) & 255, (n >> 8) & 255, n & 255]; };

/** El logo como PNG (jsPDF no lee webp ni svg): se dibuja en un canvas. null si no se puede cargar. */
async function logoPng(url: string): Promise<{ data: string; w: number; h: number } | null> {
  try {
    const blob = await (await fetch(url)).blob();
    const bmp = await createImageBitmap(blob);
    const canvas = document.createElement("canvas");
    canvas.width = bmp.width; canvas.height = bmp.height;
    canvas.getContext("2d")!.drawImage(bmp, 0, 0);
    return { data: canvas.toDataURL("image/png"), w: bmp.width, h: bmp.height };
  } catch { return null; }
}

/** Arma el PDF del presupuesto (un archivo de verdad, no la impresión del navegador: así se descarga también en el celular). */
export async function budgetPdf(budget: BudgetDetail, settings: Settings): Promise<{ blob: Blob; name: string }> {
  const { jsPDF } = await import("jspdf");
  const doc = new jsPDF({ unit: "mm", format: "a4" });
  const W = 210, M = 14, R = W - M, bottom = 285;
  const primary = rgb(settings.primary_color), accent = rgb(settings.accent_color), ink: [number, number, number] = [38, 51, 47], muted: [number, number, number] = [110, 124, 119];
  const number = String(budget.number).padStart(4, "0");
  let y = M;

  const text = (s: string, x: number, size: number, opts: { bold?: boolean; color?: [number, number, number]; align?: "left" | "right" } = {}) => {
    doc.setFont("helvetica", opts.bold ? "bold" : "normal").setFontSize(size).setTextColor(...(opts.color ?? ink));
    doc.text(s, x, y, { align: opts.align ?? "left" });
  };
  const need = (h: number) => { if (y + h > bottom) { doc.addPage(); y = M; } };

  // Cabecera: logo y datos del negocio a la izquierda, número y fechas a la derecha.
  let left = M;
  const logo = settings.logo_url ? await logoPng(settings.logo_url) : null;
  if (logo) { const h = 20, w = Math.min(50, (logo.w / logo.h) * h); doc.addImage(logo.data, "PNG", M, y, w, (logo.h / logo.w) * w); left = M + w + 5; }
  const top = y;
  y = top + 6; text(settings.name, left, 15, { bold: true, color: primary });
  const info = [settings.professional_info, [settings.phone, settings.email].filter(Boolean).join(" · "), settings.address].filter(Boolean);
  for (const line of info) for (const part of doc.splitTextToSize(line, R - left - 56) as string[]) { y += 5; text(part, left, 9.5); }
  const leftBottom = y;
  y = top + 6; text(`Presupuesto N° ${number}`, R, 13, { bold: true, color: primary, align: "right" });
  y += 5; text(`Emitido: ${formatDateNumeric(budget.issued_on)}`, R, 9.5, { align: "right" });
  if (budget.valid_until) { y += 5; text(`Válido hasta: ${formatDateNumeric(budget.valid_until)}`, R, 9.5, { align: "right" }); }
  y = Math.max(y, leftBottom, top + (logo ? 20 : 0)) + 5;
  doc.setDrawColor(...accent).setLineWidth(0.6).line(M, y, R, y);

  y += 9; text("Destinatario: ", M, 11); const label = doc.getTextWidth("Destinatario: "); doc.setFont("helvetica", "bold"); doc.text(budget.patient_ref, M + label, y);

  // Conceptos.
  const cols = { desc: M + 2, qty: 128, price: 156, disc: 170, total: R - 2 };
  const header = () => {
    doc.setFillColor(...primary).rect(M, y, R - M, 8, "F");
    y += 5.5;
    text("Concepto", cols.desc, 9.5, { bold: true, color: [255, 255, 255] });
    text("Cant.", cols.qty, 9.5, { bold: true, color: [255, 255, 255], align: "right" });
    text("Precio", cols.price, 9.5, { bold: true, color: [255, 255, 255], align: "right" });
    text("Desc.", cols.disc, 9.5, { bold: true, color: [255, 255, 255], align: "right" });
    text("Importe", cols.total, 9.5, { bold: true, color: [255, 255, 255], align: "right" });
    y += 2.5;
  };
  y += 8; header();
  for (const i of budget.items) {
    const desc = doc.setFont("helvetica", "normal").setFontSize(10).splitTextToSize(i.description, cols.qty - cols.desc - 14) as string[];
    const detail = i.detail ? (doc.setFontSize(8.5).splitTextToSize(i.detail, cols.qty - cols.desc - 14) as string[]) : [];
    const h = desc.length * 4.8 + detail.length * 4 + 4;
    if (y + h > bottom) { doc.addPage(); y = M; header(); }
    y += 5;
    const rowTop = y;
    desc.forEach((d, n) => { y = rowTop + n * 4.8; text(d, cols.desc, 10); });
    detail.forEach((d, n) => { y = rowTop + desc.length * 4.8 + n * 4; text(d, cols.desc, 8.5, { color: muted }); });
    y = rowTop;
    text(String(i.quantity), cols.qty, 10, { align: "right" });
    text(money(i.unit_price_cents), cols.price, 10, { align: "right" });
    text(i.discount_pct ? `${i.discount_pct}%` : "-", cols.disc, 10, { align: "right" });
    text(money(i.total_cents), cols.total, 10, { align: "right" });
    y = rowTop + (desc.length - 1) * 4.8 + detail.length * 4 + 3;
    doc.setDrawColor(225, 230, 228).setLineWidth(0.2).line(M, y, R, y);
  }

  // Totales.
  const active = budget.applications.filter((a) => !a.voided_at);
  const rows: [string, string, boolean][] = [["Total", money(budget.total_cents), true]];
  if (active.length > 0) rows.push(["Pagos realizados", money(budget.applied_cents), false], ["Falta pagar", money(budget.balance_cents), true]);
  need(rows.length * 6 + 6);
  y += 3;
  for (const [l, v, bold] of rows) { y += 6; text(l, 128, 10.5, { bold }); text(v, R - 2, 10.5, { bold, align: "right" }); }

  if (active.length > 0) {
    need(14); y += 12; text("Detalle de pagos", M, 10.5, { bold: true });
    for (const a of active) { need(6); y += 5.5; text(`${formatDateNumeric(a.paid_at)} · ${KIND_LABEL[a.kind]} · ${methodLabel(a.method)} · ${money(a.amount_cents)}`, M, 10); }
  }
  if (budget.notes) {
    need(14); y += 12; text("Condiciones", M, 10.5, { bold: true });
    for (const line of doc.setFontSize(10).splitTextToSize(budget.notes, R - M) as string[]) { need(6); y += 5; text(line, M, 10); }
  }

  const clean = budget.patient_ref.replace(/[\\/:*?"<>|]+/g, "").trim();
  return { blob: doc.output("blob"), name: `Presupuesto N° ${number} - ${clean}.pdf` };
}

/** Entrega el PDF: en el celular abre "Guardar / Compartir" del sistema; en la computadora lo descarga. */
export async function deliverPdf({ blob, name }: { blob: Blob; name: string }) {
  const file = new File([blob], name, { type: "application/pdf" });
  const touch = matchMedia("(pointer: coarse)").matches;
  if (touch && navigator.canShare?.({ files: [file] })) {
    try { await navigator.share({ files: [file], title: name }); return; } catch (e) { if ((e as Error).name === "AbortError") return; }
  }
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url; a.download = name;
  document.body.appendChild(a); a.click(); a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 60_000);
}
