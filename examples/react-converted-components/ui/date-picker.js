// Date picker: a month grid a visitor can navigate by keyboard. shadcn/ui's Calendar wraps react-day-picker,
// which owns the displayed month, the focused day and the selection internally. Here that state is the namespace
// `date` (../primitives.js): viewYear, viewMonth, selected and focus, with prev / next / focusMove / select.
// Source: shadcn-ui/ui, apps/v4/registry/new-york-v4/ui/calendar.tsx (MIT licence, (c) shadcn), copied unchanged on 2026-10-18.
// It is kept here only so the conversion can be compared with it. It is not run: this repository has no React
// dependency (react-day-picker is not installed either).
//
//   "use client"
//
//   import * as React from "react"
//   import { cn } from "cn"
//   import {
//     ChevronDownIcon,
//     ChevronLeftIcon,
//     ChevronRightIcon,
//   } from "lucide-react"
//   import {
//     DayPicker,
//     getDefaultClassNames,
//     type DayButton,
//   } from "react-day-picker"
//
//   import { Button, buttonVariants } from "@/registry/new-york-v4/ui/button"
//
//   function Calendar({
//     className,
//     classNames,
//     showOutsideDays = true,
//     captionLayout = "label",
//     buttonVariant = "ghost",
//     formatters,
//     components,
//     ...props
//   }: React.ComponentProps<typeof DayPicker> & {
//     buttonVariant?: React.ComponentProps<typeof Button>["variant"]
//   }) {
//     const defaultClassNames = getDefaultClassNames()
//
//     return (
//       <DayPicker
//         showOutsideDays={showOutsideDays}
//         className={cn(
//           "group/calendar bg-background p-3 [--cell-size:--spacing(8)] [[data-slot=card-content]_&]:bg-transparent [[data-slot=popover-content]_&]:bg-transparent",
//           String.raw`rtl:**:[.rdp-button\_next>svg]:rotate-180`,
//           String.raw`rtl:**:[.rdp-button\_previous>svg]:rotate-180`,
//           className
//         )}
//         captionLayout={captionLayout}
//         formatters={{
//           formatMonthDropdown: (date) =>
//             date.toLocaleString("default", { month: "short" }),
//           ...formatters,
//         }}
//         classNames={{
//           root: cn("w-fit", defaultClassNames.root),
//           months: cn(
//             "relative flex flex-col gap-4 md:flex-row",
//             defaultClassNames.months
//           ),
//           month: cn("flex w-full flex-col gap-4", defaultClassNames.month),
//           nav: cn(
//             "absolute inset-x-0 top-0 flex w-full items-center justify-between gap-1",
//             defaultClassNames.nav
//           ),
//           button_previous: cn(
//             buttonVariants({ variant: buttonVariant }),
//             "size-(--cell-size) p-0 select-none aria-disabled:opacity-50",
//             defaultClassNames.button_previous
//           ),
//           button_next: cn(
//             buttonVariants({ variant: buttonVariant }),
//             "size-(--cell-size) p-0 select-none aria-disabled:opacity-50",
//             defaultClassNames.button_next
//           ),
//           month_caption: cn(
//             "flex h-(--cell-size) w-full items-center justify-center px-(--cell-size)",
//             defaultClassNames.month_caption
//           ),
//           dropdowns: cn(
//             "flex h-(--cell-size) w-full items-center justify-center gap-1.5 text-sm font-medium",
//             defaultClassNames.dropdowns
//           ),
//           dropdown_root: cn(
//             "relative rounded-md border border-input shadow-xs has-focus:border-ring has-focus:ring-[3px] has-focus:ring-ring/50",
//             defaultClassNames.dropdown_root
//           ),
//           dropdown: cn(
//             "absolute inset-0 bg-popover opacity-0",
//             defaultClassNames.dropdown
//           ),
//           caption_label: cn(
//             "font-medium select-none",
//             captionLayout === "label"
//               ? "text-sm"
//               : "flex h-8 items-center gap-1 rounded-md pr-1 pl-2 text-sm [&>svg]:size-3.5 [&>svg]:text-muted-foreground",
//             defaultClassNames.caption_label
//           ),
//           month_grid: cn("w-full border-collapse", defaultClassNames.month_grid),
//           weekdays: cn("flex", defaultClassNames.weekdays),
//           weekday: cn(
//             "flex-1 rounded-md text-[0.8rem] font-normal text-muted-foreground select-none",
//             defaultClassNames.weekday
//           ),
//           week: cn("mt-2 flex w-full", defaultClassNames.week),
//           week_number_header: cn(
//             "w-(--cell-size) select-none",
//             defaultClassNames.week_number_header
//           ),
//           week_number: cn(
//             "text-[0.8rem] text-muted-foreground select-none",
//             defaultClassNames.week_number
//           ),
//           day: cn(
//             "group/day relative aspect-square h-full w-full p-0 text-center select-none [&:last-child[data-selected=true]_button]:rounded-r-md",
//             props.showWeekNumber
//               ? "[&:nth-child(2)[data-selected=true]_button]:rounded-l-md"
//               : "[&:first-child[data-selected=true]_button]:rounded-l-md",
//             defaultClassNames.day
//           ),
//           range_start: cn(
//             "rounded-l-md bg-accent",
//             defaultClassNames.range_start
//           ),
//           range_middle: cn("rounded-none", defaultClassNames.range_middle),
//           range_end: cn("rounded-r-md bg-accent", defaultClassNames.range_end),
//           today: cn(
//             "rounded-md bg-accent text-accent-foreground data-[selected=true]:rounded-none",
//             defaultClassNames.today
//           ),
//           outside: cn(
//             "text-muted-foreground aria-selected:text-muted-foreground",
//             defaultClassNames.outside
//           ),
//           disabled: cn(
//             "text-muted-foreground opacity-50",
//             defaultClassNames.disabled
//           ),
//           hidden: cn("invisible", defaultClassNames.hidden),
//           ...classNames,
//         }}
//         components={{
//           Root: ({ className, rootRef, ...props }) => {
//             return (
//               <div
//                 data-slot="calendar"
//                 ref={rootRef}
//                 className={cn(className)}
//                 {...props}
//               />
//             )
//           },
//           Chevron: ({ className, orientation, ...props }) => {
//             if (orientation === "left") {
//               return (
//                 <ChevronLeftIcon className={cn("size-4", className)} {...props} />
//               )
//             }
//
//             if (orientation === "right") {
//               return (
//                 <ChevronRightIcon
//                   className={cn("size-4", className)}
//                   {...props}
//                 />
//               )
//             }
//
//             return (
//               <ChevronDownIcon className={cn("size-4", className)} {...props} />
//             )
//           },
//           DayButton: CalendarDayButton,
//           WeekNumber: ({ children, ...props }) => {
//             return (
//               <td {...props}>
//                 <div className="flex size-(--cell-size) items-center justify-center text-center">
//                   {children}
//                 </div>
//               </td>
//             )
//           },
//           ...components,
//         }}
//         {...props}
//       />
//     )
//   }
//
//   function CalendarDayButton({
//     className,
//     day,
//     modifiers,
//     ...props
//   }: React.ComponentProps<typeof DayButton>) {
//     const defaultClassNames = getDefaultClassNames()
//
//     const ref = React.useRef<HTMLButtonElement>(null)
//     React.useEffect(() => {
//       if (modifiers.focused) ref.current?.focus()
//     }, [modifiers.focused])
//
//     return (
//       <Button
//         ref={ref}
//         variant="ghost"
//         size="icon"
//         data-day={day.date.toLocaleDateString()}
//         data-selected-single={
//           modifiers.selected &&
//           !modifiers.range_start &&
//           !modifiers.range_end &&
//           !modifiers.range_middle
//         }
//         data-range-start={modifiers.range_start}
//         data-range-end={modifiers.range_end}
//         data-range-middle={modifiers.range_middle}
//         className={cn(
//           "flex aspect-square size-auto w-full min-w-(--cell-size) flex-col gap-1 leading-none font-normal group-data-[focused=true]/day:relative group-data-[focused=true]/day:z-10 group-data-[focused=true]/day:border-ring group-data-[focused=true]/day:ring-[3px] group-data-[focused=true]/day:ring-ring/50 data-[range-end=true]:rounded-md data-[range-end=true]:rounded-r-md data-[range-end=true]:bg-primary data-[range-end=true]:text-primary-foreground data-[range-middle=true]:rounded-none data-[range-middle=true]:bg-accent data-[range-middle=true]:text-accent-foreground data-[range-start=true]:rounded-md data-[range-start=true]:rounded-l-md data-[range-start=true]:bg-primary data-[range-start=true]:text-primary-foreground data-[selected-single=true]:bg-primary data-[selected-single=true]:text-primary-foreground dark:hover:text-accent-foreground [&>span]:text-xs [&>span]:opacity-70",
//           defaultClassNames.day,
//           className
//         )}
//         {...props}
//       />
//     )
//   }
//
//   export { Calendar, CalendarDayButton }
// (end of the quoted source)
//
// What each part became:
//   DayPicker's displayed month          -> state date.viewYear / date.viewMonth, derive date.monthLabel
//   DayPicker's focused day + ref.focus  -> state date.focus and `focus: {equals: [item('iso'), state('focus')]}`
//                                           on each day button, so the day that follows the index takes focus
//   arrow-key navigation inside DayPicker -> keydown.ArrowLeft / ArrowRight / ArrowUp / ArrowDown on the grid
//   modifiers.selected / outside         -> aria-selected and the class binding, both from the derived cell
//   captionLayout, Chevron icons         -> the month label and the two nav buttons ('\u2039' and '\u203a')
//   DayPicker inside a Popover           -> this component renders the grid inline under the trigger, with a
//                                           full-page transparent backdrop behind it (as the popover uses) that
//                                           closes on an outside click while the trigger stays above it
//   a roving tabindex                    -> not reproduced: the grammar has no conditional attribute, so every day
//                                           button stays in the tab order; the arrow keys move `focus` within the grid
//   react-day-picker itself              -> not reproduced: range selection, week numbers, dropdown captions and
//                                           localization are out of scope. This is the single-month grid.
//   "today"                              -> deliberately absent. A derived value must not read a clock, so there is
//                                           no Date.now(); a page that needs today gets it from the server.
import { defineElement, param } from '@ehtb/agent-ui/components';
import { div, span, button, when, each, state, act, item, join, equals, not } from '@ehtb/agent-ui/spec';

const WEEKDAYS = ['Su', 'Mo', 'Tu', 'We', 'Th', 'Fr', 'Sa'];

export const DatePicker = defineElement('datePicker', {
  params: { id: {}, name: {}, label: {}, class: { default: '' } },
  spec: div(
    { id: param('id'), 'data-slot': 'date-picker', class: join('ui-date-picker ', param('class')) },
    button(
      {
        domId: join(param('id'), '-trigger'),
        type: 'button',
        'data-slot': 'date-picker-trigger',
        class: 'ui-date-trigger',
        'aria-label': param('label'),
        'aria-haspopup': 'dialog',
        'aria-expanded': state(join(param('name'), '.open')),
        on: { click: act(join(param('name'), '.toggle'), {}) },
      },
      state(join(param('name'), '.selectedLabel')),
    ),
    when(
      state(join(param('name'), '.open')),
      [
        // Transparent layer over the page: an outside click closes the calendar. The trigger and the grid are painted
        // above it (see the CSS z-indexes), so they stay usable; it is the CSS stand-in for a portal.
        div({
          domId: join(param('id'), '-backdrop'),
          'data-slot': 'date-picker-backdrop',
          class: 'ui-date-backdrop',
          on: { click: act(join(param('name'), '.close'), {}) },
        }),
        div(
          {
            domId: join(param('id'), '-calendar'),
            'data-slot': 'calendar',
            role: 'dialog',
            'aria-label': param('label'),
            class: 'ui-calendar',
            on: {
              'keydown.Escape': act(join(param('name'), '.close'), {}),
              'keydown.ArrowLeft': act(join(param('name'), '.focusMove'), { delta: -1 }, { preventDefault: true }),
              'keydown.ArrowRight': act(join(param('name'), '.focusMove'), { delta: 1 }, { preventDefault: true }),
              'keydown.ArrowUp': act(join(param('name'), '.focusMove'), { delta: -7 }, { preventDefault: true }),
              'keydown.ArrowDown': act(join(param('name'), '.focusMove'), { delta: 7 }, { preventDefault: true }),
              'keydown.Enter': act(join(param('name'), '.select'), { iso: state(join(param('name'), '.focus')) }, { preventDefault: true }),
            },
          },
          div(
            { class: 'ui-calendar-header' },
            button({ domId: join(param('id'), '-prev'), type: 'button', class: 'ui-calendar-nav', 'aria-label': 'Previous month', on: { click: act(join(param('name'), '.prev'), {}) } }, '\u2039'),
            span({ class: 'ui-calendar-month', 'aria-live': 'polite' }, state(join(param('name'), '.monthLabel'))),
            button({ domId: join(param('id'), '-next'), type: 'button', class: 'ui-calendar-nav', 'aria-label': 'Next month', on: { click: act(join(param('name'), '.next'), {}) } }, '\u203a'),
          ),
          div(
            { role: 'grid', class: 'ui-calendar-grid' },
            div({ role: 'row', class: 'ui-calendar-weekdays' }, WEEKDAYS.map((weekday) => span({ role: 'columnheader', class: 'ui-calendar-weekday', 'aria-label': weekday }, weekday))),
            each(
              state(join(param('name'), '.weeks')),
              'key',
              div(
                { role: 'row', class: 'ui-calendar-row' },
                each(
                  item('days'),
                  'iso',
                  button(
                    {
                      domId: join(param('id'), '-day-', item('iso')),
                      type: 'button',
                      role: 'gridcell',
                      'data-slot': 'calendar-day',
                      class: 'ui-calendar-day',
                      classes: {
                        'ui-calendar-day--outside': not(item('inMonth')),
                        'ui-calendar-day--selected': equals(item('iso'), state(join(param('name'), '.selected'))),
                      },
                      'aria-label': item('label'),
                      'aria-selected': equals(item('iso'), state(join(param('name'), '.selected'))),
                      focus: equals(item('iso'), state(join(param('name'), '.focus'))),
                      on: { click: act(join(param('name'), '.select'), { iso: item('iso') }) },
                    },
                    item('day'),
                  ),
                ),
              ),
            ),
          ),
        ),
      ],
    ),
  ),
});
