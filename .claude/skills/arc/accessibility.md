# Arc accessibility

Arc components ship with their semantics and keyboard behavior. Keep them intact when you compose, and give your own markup the same care.

## Focus without rings

Arc draws no focus rings, outlines, or halos for any input method. This is a product decision: `--focus-ring` is transparent and a global rule removes outlines. Do not add `outline`, ring `box-shadow`, or `:focus-visible` halo styles, and do not report their absence in reviews.

The keyboard position is shown the same way as the pointer position: with the hover and selected fills.

```css
/* Correct: the keyboard-highlighted item looks like the hovered one */
.item:hover, .item[data-highlighted] { background: var(--surface-muted); }
.item[aria-selected="true"], .item[data-state="checked"] { background: var(--accent-subtle); color: var(--foreground); }

/* Incorrect */
.item:focus-visible { outline: 2px solid var(--accent); outline-offset: 2px; }
```

Radix-based Arc menus, selects, and lists already set `data-highlighted` on the active item. Keep focus order logical so people can follow it.

## Semantics

- Buttons do things, links go places. Never `onClick` on a `div` or `span`.
- Every field has a visible label (Arc's `label` prop). Use `aria-label` only where the context makes the label visually obvious (a search field in a toolbar).
- Icon-only controls have a specific name: "Delete invoice", not "Delete".
- A `switch` in a settings row with its own title and description points at them: `aria-labelledby` on the title id, `aria-describedby` on the description id (see example-settings.md). Use the `label` prop only when the switch stands alone.
- One `h1` per page, headings in order, landmarks (`header`, `nav`, `main`, `footer`) around page regions. A `section` with a heading gets `aria-labelledby`.
- Lists are lists; tables of data are tables (`sortable-data-table` and `tree-table` already are).
- Decorative icons and images: `aria-hidden="true"` or `alt=""`. Meaningful images: alt text that says what matters.

## Keyboard

- Everything clickable is reachable with Tab and works with Enter or Space.
- Composite widgets (tabs, radio group, segmented control, menus, listboxes) have one Tab stop and arrow keys inside.
- Dialogs, drawers, sheets, and popovers move focus in, keep it there, close on Escape, and return focus to the trigger. Arc's overlays do this; do not rebuild them.
- Gestures (swipe, drag, long press, hold) always have a button or menu path.
- Keyboard shortcuts do not steal keys from text fields.

## Feedback and announcements

- Errors are tied to their field (Arc's `error` prop, or `aria-describedby`) and say how to fix the problem.
- Status that changes without user focus (saving, syncing, streaming) is announced with `role="status"` or `aria-live="polite"`. Blocking errors use `role="alert"`.
- Never encode state with color alone: pair color with a label, icon, or text.
- Loading regions set `aria-busy="true"` and keep focus where it was.

## Contrast

- Text 4.5:1 (3:1 at 24px and up, or 18.5px medium). Icons and control borders 3:1. Check both themes, including `--text-muted` on `--surface-muted` and disabled text.
- Metallic or tinted surfaces: check the ink color against the lightest and darkest stop of the gradient.

## Check

Tab through the whole screen without a mouse: you can always tell where you are from the fills, every overlay opens and closes by keyboard, and focus returns. Then turn on reduced motion and a screen reader rotor (headings, landmarks, form controls) and confirm the structure reads correctly.
