// Alert, AlertTitle and AlertDescription, converted from React.
// Source: shadcn-ui/ui, apps/v4/registry/new-york-v4/ui/alert.tsx (MIT licence, (c) shadcn), copied unchanged on 2026-10-15.
// It is kept here only so the conversion can be compared with it (parity.test.mjs reads it). It is not run: this
// repository has no React dependency.
//
//   import * as React from "react"
//   import { cva, type VariantProps } from "class-variance-authority"
//   import { cn } from "cn"
//
//   const alertVariants = cva(
//     "relative grid w-full grid-cols-[0_1fr] items-start gap-y-0.5 rounded-lg border px-4 py-3 text-sm has-[>svg]:grid-cols-[calc(var(--spacing)*4)_1fr] has-[>svg]:gap-x-3 [&>svg]:size-4 [&>svg]:translate-y-0.5 [&>svg]:text-current",
//     {
//       variants: {
//         variant: {
//           default: "bg-card text-card-foreground",
//           destructive:
//             "bg-card text-destructive *:data-[slot=alert-description]:text-destructive/90 [&>svg]:text-current",
//         },
//       },
//       defaultVariants: {
//         variant: "default",
//       },
//     }
//   )
//
//   function Alert({
//     className,
//     variant,
//     ...props
//   }: React.ComponentProps<"div"> & VariantProps<typeof alertVariants>) {
//     return (
//       <div
//         data-slot="alert"
//         role="alert"
//         className={cn(alertVariants({ variant }), className)}
//         {...props}
//       />
//     )
//   }
//
//   function AlertTitle({ className, ...props }: React.ComponentProps<"div">) {
//     return (
//       <div
//         data-slot="alert-title"
//         className={cn(
//           "col-start-2 line-clamp-1 min-h-4 font-medium tracking-tight",
//           className
//         )}
//         {...props}
//       />
//     )
//   }
//
//   function AlertDescription({
//     className,
//     ...props
//   }: React.ComponentProps<"div">) {
//     return (
//       <div
//         data-slot="alert-description"
//         className={cn(
//           "col-start-2 grid justify-items-start gap-1 text-sm text-muted-foreground [&_p]:leading-relaxed",
//           className
//         )}
//         {...props}
//       />
//     )
//   }
//
//   export { Alert, AlertTitle, AlertDescription }
// (end of the quoted source)
//
// Upstream has no dismiss button; an app puts one among the children. A component here has one slot, so the optional
// `action` param holds a whole node (a button) that is placed after the content, and disappears when it is not given.
import { defineElement, param, slot } from '@ehtb/agent-ui/components';
import { div, join } from '@ehtb/agent-ui/spec';
import { container } from './define.js';

export const Alert = defineElement('alert', {
  params: {
    id: { optional: true },
    variant: { options: { default: 'ui-alert--default', destructive: 'ui-alert--destructive' }, default: 'default' },
    action: { optional: true, type: 'node' },
    class: { default: '' },
  },
  spec: div({ id: param('id'), 'data-slot': 'alert', role: 'alert', class: join('ui-alert ', param('variant'), ' ', param('class')) }, slot(), param('action')),
});
export const AlertTitle = container('alertTitle', 'ui-alert-title', 'alert-title');
export const AlertDescription = container('alertDescription', 'ui-alert-description', 'alert-description');
