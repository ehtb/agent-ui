// Badge, converted from React.
// Source: shadcn-ui/ui, apps/v4/registry/new-york-v4/ui/badge.tsx (MIT licence, (c) shadcn), copied unchanged on 2026-10-15.
// It is kept here only so the conversion can be compared with it (parity.test.mjs reads it). It is not run: this
// repository has no React dependency.
//
//   import * as React from "react"
//   import { cva, type VariantProps } from "class-variance-authority"
//   import { Slot } from "radix-ui"
//
//   import { cn } from "@/lib/utils"
//
//   const badgeVariants = cva(
//     "inline-flex w-fit shrink-0 items-center justify-center gap-1 overflow-hidden rounded-full border border-transparent px-2 py-0.5 text-xs font-medium whitespace-nowrap transition-[color,box-shadow] focus-visible:border-ring focus-visible:ring-[3px] focus-visible:ring-ring/50 aria-invalid:border-destructive aria-invalid:ring-destructive/20 dark:aria-invalid:ring-destructive/40 [&>svg]:pointer-events-none [&>svg]:size-3",
//     {
//       variants: {
//         variant: {
//           default: "bg-primary text-primary-foreground [a&]:hover:bg-primary/90",
//           secondary:
//             "bg-secondary text-secondary-foreground [a&]:hover:bg-secondary/90",
//           destructive:
//             "bg-destructive text-white focus-visible:ring-destructive/20 dark:bg-destructive/60 dark:focus-visible:ring-destructive/40 [a&]:hover:bg-destructive/90",
//           outline:
//             "border-border text-foreground [a&]:hover:bg-accent [a&]:hover:text-accent-foreground",
//           ghost: "[a&]:hover:bg-accent [a&]:hover:text-accent-foreground",
//           link: "text-primary underline-offset-4 [a&]:hover:underline",
//         },
//       },
//       defaultVariants: {
//         variant: "default",
//       },
//     }
//   )
//
//   function Badge({
//     className,
//     variant = "default",
//     asChild = false,
//     ...props
//   }: React.ComponentProps<"span"> &
//     VariantProps<typeof badgeVariants> & { asChild?: boolean }) {
//     const Comp = asChild ? Slot.Root : "span"
//
//     return (
//       <Comp
//         data-slot="badge"
//         data-variant={variant}
//         className={cn(badgeVariants({ variant }), className)}
//         {...props}
//       />
//     )
//   }
//
//   export { Badge, badgeVariants }
// (end of the quoted source)
//
// Same conversion as the button: variants are `options`, `className` is the `class` param, `...props` is gone, and
// `asChild` is not supported.
import { defineElement, param, paramKey, slot } from '@ehtb/agent-ui/components';
import { span, join } from '@ehtb/agent-ui/spec';

export const Badge = defineElement('badge', {
  params: {
    id: { optional: true },
    variant: {
      options: {
        default: 'ui-badge--default',
        secondary: 'ui-badge--secondary',
        destructive: 'ui-badge--destructive',
        outline: 'ui-badge--outline',
        ghost: 'ui-badge--ghost',
        link: 'ui-badge--link',
      },
      default: 'default',
    },
    class: { default: '' },
  },
  spec: span({ id: param('id'), 'data-slot': 'badge', 'data-variant': paramKey('variant'), class: join('ui-badge ', param('variant'), ' ', param('class')) }, slot()),
});
