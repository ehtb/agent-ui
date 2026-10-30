# Registration

A complex form in which state changes reshape the form. Nothing is changed by hand: actions write state, derived values decide what is shown, and the spec binds to them.

| What you do | What happens |
|---|---|
| Open the page | The country list is fetched; the select says "Loading countries…" and is disabled until it arrives. If the request fails, the form says so and offers to try again. |
| Choose a country | Its regions are fetched and a region field appears. A country without a list (Japan has no `regions/JP.json`) hides the field: a 404 is an answer, not an error. Choosing another country empties the old region, and only the latest request counts. The postal code label becomes "ZIP code" for the United States. |
| Choose "Business" | The company fields appear. The VAT number is required only when the country is in the EU. |
| Untick "Ship to the address above" | The shipping address appears and becomes required. |
| Tick the newsletter | A frequency select appears. |
| Open "Advanced options" | A collapsible panel (a button with `aria-expanded`); ticking "You may call me" inside it reveals a phone field. |
| Tick "Show password" | Both password inputs switch type; the strength is derived as you type. |
| Press "Create account" | Errors appear (only from the first attempt), with a count; when the form is valid it shows exactly what would be sent. Hidden fields are neither checked nor sent. |

```
npm install
npm start        # http://localhost:8080/
npm test
```

What to read: `pages/rules.js` (validation and payload as plain functions; `visibility` is the single definition of what is on screen, used by the rules, the payload and the spec), `pages/page.js` (the namespaces: the derived values and the two `resources`), `pages/view.js` (the spec: how a section of the form is a small function returning spec data), `app.test.mjs` (every dependency between fields, a slow answer, a missing list and a failed request, all on the headless DOM with a fetch the test controls).
