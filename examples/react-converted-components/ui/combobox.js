// Combobox: a text input with a filtered option list. shadcn/ui does not ship one component for it; the recipe
// composes Popover + Command (cmdk), and cmdk keeps the query, the filtered list and the active index in its own
// state. Here those live in the namespace `combobox` (../primitives.js) and the component binds to it; the list
// is one `when` and one `each`, not a component with a reducer.
// Source: shadcn-ui/ui, apps/v4/registry/new-york-v4/ui/command.tsx (MIT licence, (c) shadcn), copied unchanged on 2026-10-18.
// It is kept here only so the conversion can be compared with it. It is not run: this repository has no React
// dependency (cmdk is not installed either).
//
//   "use client"
//
//   import * as React from "react"
//   import { Command as CommandPrimitive } from "cmdk"
//   import { cn } from "cn"
//   import { SearchIcon } from "lucide-react"
//
//   import {
//     Dialog,
//     DialogContent,
//     DialogDescription,
//     DialogHeader,
//     DialogTitle,
//   } from "@/registry/new-york-v4/ui/dialog"
//
//   function Command({
//     className,
//     ...props
//   }: React.ComponentProps<typeof CommandPrimitive>) {
//     return (
//       <CommandPrimitive
//         data-slot="command"
//         className={cn(
//           "flex h-full w-full flex-col overflow-hidden rounded-md bg-popover text-popover-foreground",
//           className
//         )}
//         {...props}
//       />
//     )
//   }
//
//   function CommandDialog({
//     title = "Command Palette",
//     description = "Search for a command to run...",
//     children,
//     className,
//     showCloseButton = true,
//     ...props
//   }: React.ComponentProps<typeof Dialog> & {
//     title?: string
//     description?: string
//     className?: string
//     showCloseButton?: boolean
//   }) {
//     return (
//       <Dialog {...props}>
//         <DialogHeader className="sr-only">
//           <DialogTitle>{title}</DialogTitle>
//           <DialogDescription>{description}</DialogDescription>
//         </DialogHeader>
//         <DialogContent
//           className={cn("overflow-hidden p-0", className)}
//           showCloseButton={showCloseButton}
//         >
//           <Command className="**:data-[slot=command-input-wrapper]:h-12 [&_[cmdk-group-heading]]:px-2 [&_[cmdk-group-heading]]:font-medium [&_[cmdk-group-heading]]:text-muted-foreground [&_[cmdk-group]]:px-2 [&_[cmdk-group]:not([hidden])_~[cmdk-group]]:pt-0 [&_[cmdk-input-wrapper]_svg]:h-5 [&_[cmdk-input-wrapper]_svg]:w-5 [&_[cmdk-input]]:h-12 [&_[cmdk-item]]:px-2 [&_[cmdk-item]]:py-3 [&_[cmdk-item]_svg]:h-5 [&_[cmdk-item]_svg]:w-5">
//             {children}
//           </Command>
//         </DialogContent>
//       </Dialog>
//     )
//   }
//
//   function CommandInput({
//     className,
//     ...props
//   }: React.ComponentProps<typeof CommandPrimitive.Input>) {
//     return (
//       <div
//         data-slot="command-input-wrapper"
//         className="flex h-9 items-center gap-2 border-b px-3"
//       >
//         <SearchIcon className="size-4 shrink-0 opacity-50" />
//         <CommandPrimitive.Input
//           data-slot="command-input"
//           className={cn(
//             "flex h-10 w-full rounded-md bg-transparent py-3 text-sm outline-hidden placeholder:text-muted-foreground disabled:cursor-not-allowed disabled:opacity-50",
//             className
//           )}
//           {...props}
//         />
//       </div>
//     )
//   }
//
//   function CommandList({
//     className,
//     ...props
//   }: React.ComponentProps<typeof CommandPrimitive.List>) {
//     return (
//       <CommandPrimitive.List
//         data-slot="command-list"
//         className={cn(
//           "max-h-[300px] scroll-py-1 overflow-x-hidden overflow-y-auto",
//           className
//         )}
//         {...props}
//       />
//     )
//   }
//
//   function CommandEmpty({
//     ...props
//   }: React.ComponentProps<typeof CommandPrimitive.Empty>) {
//     return (
//       <CommandPrimitive.Empty
//         data-slot="command-empty"
//         className="py-6 text-center text-sm"
//         {...props}
//       />
//     )
//   }
//
//   function CommandGroup({
//     className,
//     ...props
//   }: React.ComponentProps<typeof CommandPrimitive.Group>) {
//     return (
//       <CommandPrimitive.Group
//         data-slot="command-group"
//         className={cn(
//           "overflow-hidden p-1 text-foreground [&_[cmdk-group-heading]]:px-2 [&_[cmdk-group-heading]]:py-1.5 [&_[cmdk-group-heading]]:text-xs [&_[cmdk-group-heading]]:font-medium [&_[cmdk-group-heading]]:text-muted-foreground",
//           className
//         )}
//         {...props}
//       />
//     )
//   }
//
//   function CommandSeparator({
//     className,
//     ...props
//   }: React.ComponentProps<typeof CommandPrimitive.Separator>) {
//     return (
//       <CommandPrimitive.Separator
//         data-slot="command-separator"
//         className={cn("-mx-1 h-px bg-border", className)}
//         {...props}
//       />
//     )
//   }
//
//   function CommandItem({
//     className,
//     ...props
//   }: React.ComponentProps<typeof CommandPrimitive.Item>) {
//     return (
//       <CommandPrimitive.Item
//         data-slot="command-item"
//         className={cn(
//           "relative flex cursor-default items-center gap-2 rounded-sm px-2 py-1.5 text-sm outline-hidden select-none data-[disabled=true]:pointer-events-none data-[disabled=true]:opacity-50 data-[selected=true]:bg-accent data-[selected=true]:text-accent-foreground [&_svg]:pointer-events-none [&_svg]:shrink-0 [&_svg:not([class*='size-'])]:size-4 [&_svg:not([class*='text-'])]:text-muted-foreground",
//           className
//         )}
//         {...props}
//       />
//     )
//   }
//
//   function CommandShortcut({
//     className,
//     ...props
//   }: React.ComponentProps<"span">) {
//     return (
//       <span
//         data-slot="command-shortcut"
//         className={cn(
//           "ml-auto text-xs tracking-widest text-muted-foreground",
//           className
//         )}
//         {...props}
//       />
//     )
//   }
//
//   export {
//     Command,
//     CommandDialog,
//     CommandInput,
//     CommandList,
//     CommandEmpty,
//     CommandGroup,
//     CommandItem,
//     CommandShortcut,
//     CommandSeparator,
//   }
// (end of the quoted source)
//
// What each part became:
//   cmdk's query, filtered list, active index -> the namespace `combobox` (state + derive), no component state
//   CommandPrimitive.Input  -> an `input` with role="combobox", aria-expanded, aria-controls and
//                             aria-activedescendant, the last two built from the component's id and the derived
//                             active option
//   CommandPrimitive.List   -> a `when` on `open` around the listbox
//   CommandPrimitive.Item   -> the row of an `each` over the derived `matches`
//   CommandPrimitive.Empty  -> the `otherwise` of a `when` on the derived `isEmpty`
//   CommandDialog + Dialog  -> not reproduced: there is no modal here. The input is on the page and the list
//                             appears under it (no portal; CSS positions it)
//   DataState (data-[selected=true]) -> `data-active` bound to {equals: [item('value'), state(name.activeValue)]}
//   keyboard handling inside cmdk -> keydown.ArrowDown / ArrowUp / Enter / Escape handlers on the input
//   closing when focus leaves    -> a full-page transparent backdrop under the input, as the popover uses; it is the
//                             outside-click target and closes the list, while the input and the list sit above it so
//                             typing and choosing still work. (A focusout would close before an option can be clicked.)
import { defineElement, param } from '@ehtb/agent-ui/components';
import { div, input, ul, li, p, when, each, state, act, event, item, join, equals } from '@ehtb/agent-ui/spec';

export const Combobox = defineElement('combobox', {
  params: { id: {}, name: {}, label: {}, placeholder: { optional: true }, class: { default: '' } },
  spec: div(
    { id: param('id'), 'data-slot': 'combobox', class: join('ui-combobox ', param('class')) },
    input({
      domId: join(param('id'), '-input'),
      'data-slot': 'combobox-input',
      role: 'combobox',
      autocomplete: 'off',
      'aria-label': param('label'),
      'aria-expanded': state(join(param('name'), '.open')),
      'aria-controls': join(param('id'), '-list'),
      'aria-activedescendant': join(param('id'), '-option-', state(join(param('name'), '.activeValue'))),
      'aria-autocomplete': 'list',
      placeholder: param('placeholder'),
      class: 'ui-combobox-input',
      value: state(join(param('name'), '.query')),
      on: {
        input: act(join(param('name'), '.setQuery'), { value: event('target.value') }),
        focusin: act(join(param('name'), '.open'), {}),
        'keydown.ArrowDown': act(join(param('name'), '.move'), { delta: 1 }, { preventDefault: true }),
        'keydown.ArrowUp': act(join(param('name'), '.move'), { delta: -1 }, { preventDefault: true }),
        'keydown.Enter': act(join(param('name'), '.selectActive'), {}, { preventDefault: true }),
        'keydown.Escape': act(join(param('name'), '.close'), {}),
      },
    }),
    when(
      state(join(param('name'), '.open')),
      [
        // Transparent layer over the page: clicking anywhere outside closes the list. The input and the options are
        // painted above it (see the CSS z-indexes), so they stay usable; it is the CSS stand-in for a portal.
        div({
          domId: join(param('id'), '-backdrop'),
          'data-slot': 'combobox-backdrop',
          class: 'ui-combobox-backdrop',
          on: { click: act(join(param('name'), '.close'), {}) },
        }),
        when(
          state(join(param('name'), '.isEmpty')),
          p({ domId: join(param('id'), '-empty'), 'data-slot': 'combobox-empty', class: 'ui-combobox-empty' }, 'No matches'),
          ul(
            { domId: join(param('id'), '-list'), 'data-slot': 'combobox-list', role: 'listbox', class: 'ui-combobox-list' },
            each(
              state(join(param('name'), '.matches')),
              'value',
              li(
                {
                  domId: join(param('id'), '-option-', item('value')),
                  'data-slot': 'combobox-option',
                  role: 'option',
                  class: 'ui-combobox-option',
                  'aria-selected': equals(item('value'), state(join(param('name'), '.selected'))),
                  'data-active': equals(item('value'), state(join(param('name'), '.activeValue'))),
                  on: { click: act(join(param('name'), '.choose'), { value: item('value') }) },
                },
                item('label'),
              ),
            ),
          ),
        ),
      ],
    ),
  ),
});
