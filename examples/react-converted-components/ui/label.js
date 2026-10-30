// Label, converted from React.
// Source: shadcn-ui/ui, apps/v4/registry/new-york-v4/ui/label.tsx (MIT licence, (c) shadcn), copied unchanged on 2026-10-15.
// It is kept here only so the conversion can be compared with it (parity.test.mjs reads it). It is not run: this
// repository has no React dependency.
//
//   "use client"
//
//   import * as React from "react"
//   import { cn } from "cn"
//   import { Label as LabelPrimitive } from "radix-ui"
//
//   function Label({
//     className,
//     ...props
//   }: React.ComponentProps<typeof LabelPrimitive.Root>) {
//     return (
//       <LabelPrimitive.Root
//         data-slot="label"
//         className={cn(
//           "flex items-center gap-2 text-sm leading-none font-medium select-none group-data-[disabled=true]:pointer-events-none group-data-[disabled=true]:opacity-50 peer-disabled:cursor-not-allowed peer-disabled:opacity-50",
//           className
//         )}
//         {...props}
//       />
//     )
//   }
//
//   export { Label }
// (end of the quoted source)
//
// Radix's label renders a native label. So does this: `for` names the input's id (React's `htmlFor`).
import { defineElement, param, slot } from '@ehtb/agent-ui/components';
import { label, join } from '@ehtb/agent-ui/spec';

export const Label = defineElement('label', {
  params: { id: { optional: true }, for: {}, class: { default: '' } },
  spec: label({ id: param('id'), 'data-slot': 'label', for: param('for'), class: join('ui-label ', param('class')) }, slot()),
});
