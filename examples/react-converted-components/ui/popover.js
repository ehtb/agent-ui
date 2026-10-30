// Popover, converted from React, and closed by construction: the part Radix does with a portal, a focus trap and
// an outside-click listener is here a namespace (../primitives.js) and a few bindings.
// Source: shadcn-ui/ui, apps/v4/registry/new-york-v4/ui/popover.tsx (MIT licence, (c) shadcn), copied unchanged on 2026-10-18.
// It is kept here only so the conversion can be compared with it (parity.test.mjs reads it). It is not run: this
// repository has no React dependency.
//
//   "use client"
//
//   import * as React from "react"
//   import { cn } from "cn"
//   import { Popover as PopoverPrimitive } from "radix-ui"
//
//   function Popover({
//     ...props
//   }: React.ComponentProps<typeof PopoverPrimitive.Root>) {
//     return <PopoverPrimitive.Root data-slot="popover" {...props} />
//   }
//
//   function PopoverTrigger({
//     ...props
//   }: React.ComponentProps<typeof PopoverPrimitive.Trigger>) {
//     return <PopoverPrimitive.Trigger data-slot="popover-trigger" {...props} />
//   }
//
//   function PopoverContent({
//     className,
//     align = "center",
//     sideOffset = 4,
//     ...props
//   }: React.ComponentProps<typeof PopoverPrimitive.Content>) {
//     return (
//       <PopoverPrimitive.Portal>
//         <PopoverPrimitive.Content
//           data-slot="popover-content"
//           align={align}
//           sideOffset={sideOffset}
//           className={cn(
//             "z-50 w-72 origin-(--radix-popover-content-transform-origin) rounded-md border bg-popover p-4 text-popover-foreground shadow-md outline-hidden data-[side=bottom]:slide-in-from-top-2 data-[side=left]:slide-in-from-right-2 data-[side=right]:slide-in-from-left-2 data-[side=top]:slide-in-from-bottom-2 data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[state=closed]:zoom-out-95 data-[state=open]:animate-in data-[state=open]:fade-in-0 data-[state=open]:zoom-in-95",
//             className
//           )}
//           {...props}
//         />
//       </PopoverPrimitive.Portal>
//     )
//   }
//
//   function PopoverAnchor({
//     ...props
//   }: React.ComponentProps<typeof PopoverPrimitive.Anchor>) {
//     return <PopoverPrimitive.Anchor data-slot="popover-anchor" {...props} />
//   }
//
//   function PopoverHeader({ className, ...props }: React.ComponentProps<"div">) {
//     return (
//       <div
//         data-slot="popover-header"
//         className={cn("flex flex-col gap-1 text-sm", className)}
//         {...props}
//       />
//     )
//   }
//
//   function PopoverTitle({ className, ...props }: React.ComponentProps<"h2">) {
//     return (
//       <div
//         data-slot="popover-title"
//         className={cn("font-medium", className)}
//         {...props}
//       />
//     )
//   }
//
//   function PopoverDescription({
//     className,
//     ...props
//   }: React.ComponentProps<"p">) {
//     return (
//       <p
//         data-slot="popover-description"
//         className={cn("text-muted-foreground", className)}
//         {...props}
//       />
//     )
//   }
//
//   export {
//     Popover,
//     PopoverTrigger,
//     PopoverContent,
//     PopoverAnchor,
//     PopoverHeader,
//     PopoverTitle,
//     PopoverDescription,
//   }
// (end of the quoted source)
//
// What each part became, and what could not be:
//   Radix Popover.Root (its own open state, on its own context) -> the namespace `popover`, mounted under a name
//   PopoverTrigger                -> a button with aria-expanded / aria-controls, onClick toggles the namespace
//   PopoverContent inside a Portal -> one `when` on `open`, rendered in place. There is no portal: CSS positions
//                                    it. Nothing is moved to the end of the document, so a popover inside an
//                                    `overflow: hidden` ancestor is clipped. Say so, do not fake it.
//   Radix focus trap (useRef)     -> `popover.focusIndex` plus `focus: {equals: [state, index]}` on each item,
//                                    with keydown.Tab / keydown.Shift+Tab calling next / prev. Reading the DOM
//                                    for the focused element is not allowed, so the index is the trap. There is no
//                                    aria-modal: focus can still leave by other means, so calling it modal would
//                                    overstate it (Radix itself sets role="dialog" without aria-modal).
//   outside-click (DismissableLayer) -> the backdrop element's onClick closes the popover
//   returning focus to the trigger -> not reproduced: closing leaves focus on the (now removed) choice. The trigger's
//                                    focus prop would also fire on the first render, so it is not bound to `open`.
//   align, sideOffset, animations -> CSS only; the components share the same data-slot names for stylesheets
//   PopoverAnchor, PopoverHeader, PopoverTitle, PopoverDescription -> not needed here: the body of the popover is
//                                    the choice list the namespace already holds, so a caller writes no content
import { defineElement, param } from '@ehtb/agent-ui/components';
import { div, button, when, each, state, act, item, join, equals } from '@ehtb/agent-ui/spec';

export const Popover = defineElement('popover', {
  params: { id: {}, name: {}, label: {}, class: { default: '' } },
  spec: div(
    { id: param('id'), 'data-slot': 'popover', class: join('ui-popover ', param('class')) },
    button(
      {
        domId: join(param('id'), '-trigger'),
        type: 'button',
        'data-slot': 'popover-trigger',
        class: 'ui-popover-trigger',
        'aria-haspopup': 'dialog',
        'aria-expanded': state(join(param('name'), '.open')),
        'aria-controls': join(param('id'), '-content'),
        on: { click: act(join(param('name'), '.toggle'), {}) },
      },
      state(join(param('name'), '.label')),
    ),
    when(
      state(join(param('name'), '.open')),
      div(
        { class: 'ui-popover-layer' },
        div({ domId: join(param('id'), '-backdrop'), 'data-slot': 'popover-backdrop', class: 'ui-popover-backdrop', on: { click: act(join(param('name'), '.close'), {}) } }),
        div(
          {
            domId: join(param('id'), '-content'),
            'data-slot': 'popover-content',
            role: 'dialog',
            'aria-label': param('label'),
            class: 'ui-popover-content',
            on: {
              'keydown.Escape': act(join(param('name'), '.close'), {}),
              'keydown.Tab': act(join(param('name'), '.next'), {}, { preventDefault: true }),
              'keydown.Shift+Tab': act(join(param('name'), '.prev'), {}, { preventDefault: true }),
            },
          },
          each(
            state(join(param('name'), '.choices')),
            'value',
            button(
              {
                type: 'button',
                'data-slot': 'popover-choice',
                class: 'ui-popover-choice',
                'aria-pressed': equals(state(join(param('name'), '.value')), item('value')),
                focus: equals(state(join(param('name'), '.focusIndex')), item('index')),
                on: { click: act(join(param('name'), '.choose'), { value: item('value') }) },
              },
              item('value'),
            ),
          ),
        ),
      ),
    ),
  ),
});
