import type { InputHTMLAttributes, TextareaHTMLAttributes, Ref } from "react";
import { cn } from "@/lib/utils";

const field = "w-full rounded-lg border bg-white px-3 text-sm placeholder:text-muted/70 disabled:bg-soft";

export const Input = ({ className, ref, ...p }: InputHTMLAttributes<HTMLInputElement> & { ref?: Ref<HTMLInputElement> }) => (
  <input ref={ref} className={cn(field, "h-10", className)} {...p} />
);
export const Textarea = ({ className, ref, ...p }: TextareaHTMLAttributes<HTMLTextAreaElement> & { ref?: Ref<HTMLTextAreaElement> }) => (
  <textarea ref={ref} className={cn(field, "py-2 min-h-24 resize-none", className)} {...p} />
);
