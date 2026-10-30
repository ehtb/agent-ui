// Card and its seven parts, converted from React.
// Source: shadcn-ui/ui, apps/v4/registry/new-york-v4/ui/card.tsx (MIT licence, (c) shadcn), copied unchanged on 2026-10-15.
// It is kept here only so the conversion can be compared with it (parity.test.mjs reads it). It is not run: this
// repository has no React dependency.
//
//   import * as React from "react"
//
//   import { cn } from "@/lib/utils"
//
//   function Card({ className, ...props }: React.ComponentProps<"div">) {
//     return (
//       <div
//         data-slot="card"
//         className={cn(
//           "flex flex-col gap-6 rounded-xl border bg-card py-6 text-card-foreground shadow-sm",
//           className
//         )}
//         {...props}
//       />
//     )
//   }
//
//   function CardHeader({ className, ...props }: React.ComponentProps<"div">) {
//     return (
//       <div
//         data-slot="card-header"
//         className={cn(
//           "@container/card-header grid auto-rows-min grid-rows-[auto_auto] items-start gap-2 px-6 has-data-[slot=card-action]:grid-cols-[1fr_auto] [.border-b]:pb-6",
//           className
//         )}
//         {...props}
//       />
//     )
//   }
//
//   function CardTitle({ className, ...props }: React.ComponentProps<"div">) {
//     return (
//       <div
//         data-slot="card-title"
//         className={cn("leading-none font-semibold", className)}
//         {...props}
//       />
//     )
//   }
//
//   function CardDescription({ className, ...props }: React.ComponentProps<"div">) {
//     return (
//       <div
//         data-slot="card-description"
//         className={cn("text-sm text-muted-foreground", className)}
//         {...props}
//       />
//     )
//   }
//
//   function CardAction({ className, ...props }: React.ComponentProps<"div">) {
//     return (
//       <div
//         data-slot="card-action"
//         className={cn(
//           "col-start-2 row-span-2 row-start-1 self-start justify-self-end",
//           className
//         )}
//         {...props}
//       />
//     )
//   }
//
//   function CardContent({ className, ...props }: React.ComponentProps<"div">) {
//     return (
//       <div
//         data-slot="card-content"
//         className={cn("px-6", className)}
//         {...props}
//       />
//     )
//   }
//
//   function CardFooter({ className, ...props }: React.ComponentProps<"div">) {
//     return (
//       <div
//         data-slot="card-footer"
//         className={cn("flex items-center px-6 [.border-t]:pt-6", className)}
//         {...props}
//       />
//     )
//   }
//
//   export {
//     Card,
//     CardHeader,
//     CardFooter,
//     CardTitle,
//     CardAction,
//     CardDescription,
//     CardContent,
//   }
// (end of the quoted source)
//
// Each part is one line of `container` (define.js): the tag, the base class and the data-slot name. A card is composed
// by nesting `use` nodes, as in React. Note that upstream renders CardTitle as a div, and so does this.
import { container } from './define.js';

export const Card = container('card', 'ui-card', 'card');
export const CardHeader = container('cardHeader', 'ui-card-header', 'card-header');
export const CardTitle = container('cardTitle', 'ui-card-title', 'card-title');
export const CardDescription = container('cardDescription', 'ui-card-description', 'card-description');
export const CardAction = container('cardAction', 'ui-card-action', 'card-action');
export const CardContent = container('cardContent', 'ui-card-content', 'card-content');
export const CardFooter = container('cardFooter', 'ui-card-footer', 'card-footer');
