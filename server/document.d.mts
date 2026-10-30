/** Puts the rendered markup and the state script into a page template. Idempotent. */
export function injectMarkup(pageHtml: string, parts: { html: string; stateScript: string; shell?: boolean }): string;
/** What a page says about its document: title, description, attributes of <html> and <body>, and the elements of <head> and the end of <body>. Idempotent. */
export function injectHead(
  pageHtml: string,
  description: {
    title?: string;
    description?: string;
    html?: Record<string, string | number | boolean>;
    body?: Record<string, string | number | boolean>;
    tags?: { tag: string; attributes: Record<string, string | number | boolean>; text?: string }[];
    bodyTags?: { tag: string; attributes: Record<string, string | number | boolean>; text?: string }[];
  },
): string;
/** The finished document for one render: markup, state, and (with describePage) the page's title and description. */
export function renderDocument(
  template: string,
  result: { html: string; stateScript: string; state: Record<string, unknown>; shell?: boolean },
  options?: { describePage?: ((state: Record<string, unknown>) => Parameters<typeof injectHead>[1]) | null },
): string;
