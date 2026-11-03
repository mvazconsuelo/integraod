import { cn } from "@/lib/utils";

const TONES = ["bg-success/15 text-success", "bg-warning/20 text-[#8a5d2b]", "bg-secondary/15 text-secondary", "bg-primary/10 text-primary", "bg-danger/10 text-danger"];

/** Las iniciales de una persona en un círculo; el color sale del nombre, así cada cliente se reconoce de un vistazo. */
export function Avatar({ name, size = "md", className }: { name: string; size?: "sm" | "md" | "lg"; className?: string }) {
  const words = name.trim().split(/\s+/).filter(Boolean);
  const initials = ((words[0]?.[0] ?? "?") + (words.length > 1 ? words[words.length - 1][0] : "")).toUpperCase();
  const hue = [...name.trim().toLowerCase()].reduce((h, c) => (h * 31 + c.charCodeAt(0)) >>> 0, 7) % TONES.length;
  return (
    <span aria-hidden className={cn("grid shrink-0 place-items-center rounded-full font-semibold", TONES[hue], size === "sm" ? "h-9 w-9 text-xs" : size === "lg" ? "h-14 w-14 text-lg" : "h-11 w-11 text-sm", className)}>{initials}</span>
  );
}
