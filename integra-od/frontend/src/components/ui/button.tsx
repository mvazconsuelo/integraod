import { Slot } from "@radix-ui/react-slot";
import { cva, type VariantProps } from "class-variance-authority";
import type { ButtonHTMLAttributes } from "react";
import { cn } from "@/lib/utils";

const variants = cva(
  "inline-flex flex-row-reverse items-center justify-center gap-2 [&_svg]:shrink-0 [&_svg]:stroke-[2.25] rounded-lg text-sm font-medium transition-colors disabled:opacity-50 disabled:pointer-events-none cursor-pointer",
  {
    variants: {
      variant: {
        primary: "bg-primary text-white hover:bg-primary/90",
        secondary: "bg-white border text-foreground hover:bg-soft",
        ghost: "text-muted hover:bg-soft hover:text-foreground",
        danger: "bg-white border border-danger/40 text-danger hover:bg-danger/5",
      },
      size: { md: "h-10 px-4", sm: "h-8 px-3", icon: "h-10 w-10" },
    },
    defaultVariants: { variant: "primary", size: "md" },
  },
);

type Props = ButtonHTMLAttributes<HTMLButtonElement> & VariantProps<typeof variants> & { asChild?: boolean };

export function Button({ className, variant, size, asChild, ...props }: Props) {
  const Comp = asChild ? Slot : "button";
  return <Comp className={cn(variants({ variant, size }), className)} {...props} />;
}
