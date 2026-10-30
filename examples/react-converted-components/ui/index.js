// The kit: every component by the name a spec uses it with ({ use: 'button' }), as the function defineElement made, so a page
// can call it (Button({ variant: 'outline' }, 'Save')) or write the raw use node. React names the components the same way: Button, CardHeader.
import { Button } from './button.js';
import { Badge } from './badge.js';
import { Card, CardHeader, CardTitle, CardDescription, CardAction, CardContent, CardFooter } from './card.js';
import { Alert, AlertTitle, AlertDescription } from './alert.js';
import { Label } from './label.js';
import { Input, Checkbox, FieldError } from './input.js';
import { Popover } from './popover.js';
import { Combobox } from './combobox.js';
import { DatePicker } from './date-picker.js';
import { Sortable, SortableItem } from './sortable.js';

export {
  Button, Badge, Card, CardHeader, CardTitle, CardDescription, CardAction, CardContent, CardFooter, Alert, AlertTitle, AlertDescription, Label, Input, Checkbox, FieldError,
  Popover, Combobox, DatePicker, Sortable, SortableItem,
};

export const components = [
  Button, Badge, Card, CardHeader, CardTitle, CardDescription, CardAction, CardContent, CardFooter, Alert, AlertTitle, AlertDescription, Label, Input, Checkbox, FieldError,
  Popover, Combobox, DatePicker, Sortable, SortableItem,
];
