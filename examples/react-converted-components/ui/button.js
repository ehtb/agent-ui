// Button, converted from React.
// Source: shadcn-ui/ui, apps/v4/registry/new-york-v4/ui/button.tsx (MIT licence, (c) shadcn), copied unchanged on 2026-10-15.
// It is kept here only so the conversion can be compared with it (parity.test.mjs reads it). It is not run: this
// repository has no React dependency.
//
//   import * as React from "react"
//   import { cva, type VariantProps } from "class-variance-authority"
//   import { cn } from "cn"
//   import { Slot } from "radix-ui"
//
//   const buttonVariants = cva(
//     "inline-flex shrink-0 items-center justify-center gap-2 rounded-md text-sm font-medium whitespace-nowrap transition-all outline-none focus-visible:border-ring focus-visible:ring-[3px] focus-visible:ring-ring/50 disabled:pointer-events-none disabled:opacity-50 aria-invalid:border-destructive aria-invalid:ring-destructive/20 dark:aria-invalid:ring-destructive/40 [&_svg]:pointer-events-none [&_svg]:shrink-0 [&_svg:not([class*='size-'])]:size-4",
//     {
//       variants: {
//         variant: {
//           default: "bg-primary text-primary-foreground hover:bg-primary/90",
//           destructive:
//             "bg-destructive text-white hover:bg-destructive/90 focus-visible:ring-destructive/20 dark:bg-destructive/60 dark:focus-visible:ring-destructive/40",
//           outline:
//             "border bg-background shadow-xs hover:bg-accent hover:text-accent-foreground dark:border-input dark:bg-input/30 dark:hover:bg-input/50",
//           secondary:
//             "bg-secondary text-secondary-foreground hover:bg-secondary/80",
//           ghost:
//             "hover:bg-accent hover:text-accent-foreground dark:hover:bg-accent/50",
//           link: "text-primary underline-offset-4 hover:underline",
//         },
//         size: {
//           default: "h-9 px-4 py-2 has-[>svg]:px-3",
//           xs: "h-6 gap-1 rounded-md px-2 text-xs has-[>svg]:px-1.5 [&_svg:not([class*='size-'])]:size-3",
//           sm: "h-8 gap-1.5 rounded-md px-3 has-[>svg]:px-2.5",
//           lg: "h-10 rounded-md px-6 has-[>svg]:px-4",
//           icon: "size-9",
//           "icon-xs": "size-6 rounded-md [&_svg:not([class*='size-'])]:size-3",
//           "icon-sm": "size-8",
//           "icon-lg": "size-10",
//         },
//       },
//       defaultVariants: {
//         variant: "default",
//         size: "default",
//       },
//     }
//   )
//
//   function Button({
//     className,
//     variant = "default",
//     size = "default",
//     asChild = false,
//     ...props
//   }: React.ComponentProps<"button"> &
//     VariantProps<typeof buttonVariants> & {
//       asChild?: boolean
//     }) {
//     const Comp = asChild ? Slot.Root : "button"
//
//     return (
//       <Comp
//         data-slot="button"
//         data-variant={variant}
//         data-size={size}
//         className={cn(buttonVariants({ variant, size, className }))}
//         {...props}
//       />
//     )
//   }
//
//   export { Button, buttonVariants }
// (end of the quoted source)
//
// What each part became:
//   cva variants         -> `options` on a param: the use writes a key, the spec receives the class
//   defaultVariants      -> `default`
//   cn(..., className)   -> the `class` param joined onto the base class
//   data-variant, -size  -> {param: 'variant', key: true}: the key the use wrote, for stylesheets that select on it
//   children             -> the slot
//   onClick, ...props    -> `onClick`, the only handler; no spread, so a misspelt prop is an error
//   asChild (Slot)       -> not supported: there is one tag per component. Make a component for the tag you want
//   type                 -> optional with options: absent unless given, like the original (the browser default applies)
//   disabled             -> a plain param; it may be a literal or a binding
//   aria-label           -> `label`, for a button without text (the "icon" sizes)
import { defineElement, param, paramKey, slot } from '@ehtb/agent-ui/components';
import { button, join } from '@ehtb/agent-ui/spec';

export const Button = defineElement('button', {
  params: {
    id: { optional: true },
    variant: {
      options: {
        default: 'ui-button--default',
        destructive: 'ui-button--destructive',
        outline: 'ui-button--outline',
        secondary: 'ui-button--secondary',
        ghost: 'ui-button--ghost',
        link: 'ui-button--link',
      },
      default: 'default',
    },
    size: {
      options: {
        default: 'ui-button--md',
        xs: 'ui-button--xs',
        sm: 'ui-button--sm',
        lg: 'ui-button--lg',
        icon: 'ui-button--icon',
        'icon-xs': 'ui-button--icon-xs',
        'icon-sm': 'ui-button--icon-sm',
        'icon-lg': 'ui-button--icon-lg',
      },
      default: 'default',
    },
    type: { options: { button: 'button', submit: 'submit', reset: 'reset' }, optional: true },
    disabled: { default: false },
    label: { optional: true },
    class: { default: '' },
    onClick: { optional: true, type: 'handler' },
  },
  spec: button(
    {
      id: param('id'),
      'data-slot': 'button',
      'data-variant': paramKey('variant'),
      'data-size': paramKey('size'),
      type: param('type'),
      disabled: param('disabled'),
      'aria-label': param('label'),
      class: join('ui-button ', param('variant'), ' ', param('size'), ' ', param('class')),
      on: { click: param('onClick') },
    },
    slot(),
  ),
});
