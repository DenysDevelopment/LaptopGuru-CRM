import * as React from "react"
import { cva, type VariantProps } from "class-variance-authority"

import { cn } from "@/lib/utils"

const buttonVariants = cva(
  "inline-flex shrink-0 items-center justify-center gap-2 rounded-lg border border-transparent text-sm font-medium whitespace-nowrap transition-colors outline-none select-none focus-visible:ring-2 focus-visible:ring-brand-muted disabled:pointer-events-none disabled:opacity-50 [&_svg]:pointer-events-none [&_svg]:shrink-0 [&_svg:not([class*='size-'])]:size-4 cursor-pointer",
  {
    variants: {
      variant: {
        default:
          "bg-brand text-white hover:bg-brand-hover",
        outline:
          "border-gray-200 bg-white text-gray-700 hover:bg-gray-50",
        secondary:
          "bg-gray-100 text-gray-700 hover:bg-gray-200",
        ghost:
          "text-gray-600 hover:bg-gray-100 hover:text-gray-900",
        destructive:
          "bg-red-500 text-white hover:bg-red-600",
        link:
          "text-brand underline-offset-4 hover:underline",
      },
      size: {
        default: "h-10 px-4 py-2.5",
        xs: "h-6 px-2 text-xs",
        sm: "h-8 px-3 text-[0.8rem]",
        lg: "h-12 rounded-xl px-6 text-base font-bold",
        icon: "size-10",
        "icon-xs": "size-6",
        "icon-sm": "size-8",
        "icon-lg": "size-12",
      },
    },
    defaultVariants: {
      variant: "default",
      size: "default",
    },
  }
)

type ButtonProps = React.ComponentProps<"button"> &
  VariantProps<typeof buttonVariants>

function Button({
  className,
  variant = "default",
  size = "default",
  type = "button",
  ...props
}: ButtonProps) {
  return (
    <button
      type={type}
      data-slot="button"
      className={cn(buttonVariants({ variant, size, className }))}
      {...props}
    />
  )
}

export { Button, buttonVariants }
