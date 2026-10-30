// Input and Checkbox, converted from React, and FieldError (new: there is no upstream equivalent).
// Source: shadcn-ui/ui, apps/v4/registry/new-york-v4/ui/input.tsx (MIT licence, (c) shadcn), copied unchanged on 2026-10-15.
// It is kept here only so the conversion can be compared with it (parity.test.mjs reads it). It is not run: this
// repository has no React dependency.
//
//   import * as React from "react"
//
//   import { cn } from "@/lib/utils"
//
//   function Input({ className, type, ...props }: React.ComponentProps<"input">) {
//     return (
//       <input
//         type={type}
//         data-slot="input"
//         className={cn(
//           "h-9 w-full min-w-0 rounded-md border border-input bg-transparent px-3 py-1 text-base shadow-xs transition-[color,box-shadow] outline-none selection:bg-primary selection:text-primary-foreground file:inline-flex file:h-7 file:border-0 file:bg-transparent file:text-sm file:font-medium file:text-foreground placeholder:text-muted-foreground disabled:pointer-events-none disabled:cursor-not-allowed disabled:opacity-50 md:text-sm dark:bg-input/30",
//           "focus-visible:border-ring focus-visible:ring-[3px] focus-visible:ring-ring/50",
//           "aria-invalid:border-destructive aria-invalid:ring-destructive/20 dark:aria-invalid:ring-destructive/40",
//           className
//         )}
//         {...props}
//       />
//     )
//   }
//
//   export { Input }
// (end of the quoted source)
//
// Source: shadcn-ui/ui, apps/v4/registry/new-york-v4/ui/checkbox.tsx (MIT licence, (c) shadcn), copied unchanged on 2026-10-15.
// It is kept here only so the conversion can be compared with it (parity.test.mjs reads it). It is not run: this
// repository has no React dependency.
//
//   "use client"
//
//   import * as React from "react"
//   import { CheckIcon } from "lucide-react"
//   import { Checkbox as CheckboxPrimitive } from "radix-ui"
//
//   import { cn } from "@/lib/utils"
//
//   function Checkbox({
//     className,
//     ...props
//   }: React.ComponentProps<typeof CheckboxPrimitive.Root>) {
//     return (
//       <CheckboxPrimitive.Root
//         data-slot="checkbox"
//         className={cn(
//           "peer size-4 shrink-0 rounded-[4px] border border-input shadow-xs transition-shadow outline-none focus-visible:border-ring focus-visible:ring-[3px] focus-visible:ring-ring/50 disabled:cursor-not-allowed disabled:opacity-50 aria-invalid:border-destructive aria-invalid:ring-destructive/20 data-[state=checked]:border-primary data-[state=checked]:bg-primary data-[state=checked]:text-primary-foreground dark:bg-input/30 dark:aria-invalid:ring-destructive/40 dark:data-[state=checked]:bg-primary",
//           className
//         )}
//         {...props}
//       >
//         <CheckboxPrimitive.Indicator
//           data-slot="checkbox-indicator"
//           className="grid place-content-center text-current transition-none"
//         >
//           <CheckIcon className="size-3.5" />
//         </CheckboxPrimitive.Indicator>
//       </CheckboxPrimitive.Root>
//     )
//   }
//
//   export { Checkbox }
// (end of the quoted source)
//
// In React the value, the change handler and the error flag are props that the form code threads through by hand, or a
// form library supplies. Here they come from one `field` name, the namespace the field's feature is mounted as
// (../features.js): field "email" has state email.value, derived email.invalid and email.message, actions email.set and
// email.touch (and, for checkboxes, email.state: "checked" or "unchecked"). The component builds those names when the
// page is built (a join of literals is folded into one string), so the result is an ordinary binding such as
// {state: 'email.value'}.
//
// Radix's checkbox is a button with role="checkbox", data-state and a hidden input. A native checkbox input does the
// same job with less, and carries the same data-state attribute. The validator requires an aria-label on every input,
// so `label` is a required param for both.
import { defineElement, param } from '@ehtb/agent-ui/components';
import { input, p, when, state, act, event, join } from '@ehtb/agent-ui/spec';

// The state a field's namespace (made by textField or checkField in features.js, mounted under the name `field`) defines.
const fieldValue = state(join(param('field'), '.value'));
const fieldInvalid = state(join(param('field'), '.invalid'));

export const Input = defineElement('input', {
  params: {
    id: {},
    domId: { optional: true },
    field: {},
    label: {},
    type: { options: { text: 'text', email: 'email', password: 'password', number: 'number' }, default: 'text' },
    placeholder: { optional: true },
    disabled: { default: false },
    class: { default: '' },
  },
  spec: input({
    id: param('id'),
    domId: param('domId'),
    'data-slot': 'input',
    type: param('type'),
    'aria-label': param('label'),
    placeholder: param('placeholder'),
    disabled: param('disabled'),
    value: fieldValue,
    'aria-invalid': fieldInvalid,
    class: join('ui-input ', param('class')),
    on: {
      input: act(join(param('field'), '.set'), { value: event('target.value') }),
      focusout: act(join(param('field'), '.touch'), {}),
    },
  }),
});

export const Checkbox = defineElement('checkbox', {
  params: { id: {}, domId: { optional: true }, field: {}, label: {}, disabled: { default: false }, class: { default: '' } },
  spec: input({
    id: param('id'),
    domId: param('domId'),
    'data-slot': 'checkbox',
    type: 'checkbox',
    'aria-label': param('label'),
    disabled: param('disabled'),
    checked: fieldValue,
    'data-state': state(join(param('field'), '.state')),
    'aria-invalid': fieldInvalid,
    class: join('ui-checkbox ', param('class')),
    on: {
      change: act(join(param('field'), '.set'), { value: event('target.checked') }),
      focusout: act(join(param('field'), '.touch'), {}),
    },
  }),
});

export const FieldError = defineElement('fieldError', {
  params: { id: { optional: true }, field: {} },
  spec: when(fieldInvalid, p({ id: param('id'), 'data-slot': 'field-error', class: 'ui-field-error' }, state(join(param('field'), '.message')))),
});
