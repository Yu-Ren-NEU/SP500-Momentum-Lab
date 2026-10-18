# Mobile layout review and fixes

Reviewed the local React/Vite app at 375px and 390px phone widths, 768px tablet width, and the existing desktop view. Scope: layout and touch usability; market-data computations are unchanged.

## P1 - Should fix

- [x] **#1 Header squeezes the title into a narrow column.**
  - Fix applied: Stack title and utility region on phones; restore the horizontal header at 640px.
- [x] **#2 Legend competes with the axis caption for horizontal space.**
  - Fix applied: Stack the plot metadata on phones, wrap legend entries, and reserve an independent line for the axis caption.
- [x] **#3 Dense weights and annual tables require local scrolling.**
  - Fix applied: Give the weights scroller its own flex row, allow grid children to shrink, add named keyboard-focusable scroll regions, and show a mobile annual-table swipe hint.
- [x] **#4 Compact desktop inputs are too small for touch and can trigger iOS zoom.**
  - Fix applied: Use 44px controls and 16px input text on phones/coarse pointers; retain compact desktop fields and the user-selected 14px theme glyph.
- [x] **#5 Inside-chart drag competes with vertical page navigation.**
  - Fix applied: Disable inside dragging for narrow chart containers, retain the slider, enlarge its height, and reduce narrow-chart side padding. Native physical-device gesture behavior still requires device testing.

## Validation

- Measured viewport/content widths: 375/375px, 390/390px and 768/768px; no whole-page horizontal overflow. Phone field heights are 44px; compact tablet fields remain 36px.
- Narrow frames render the real app, with English and Chinese labels and Top 10/Top 3 allocations.
- Both themes are visually checked. Table overflow is intentional and confined to the named regions.
- Existing focus-visible outlines and reduced-motion behavior remain in place.
- An iframe viewport check is not a substitute for testing a physical iPhone or Android browser.

| Finding | Priority | Type | Action |
| --- | --- | --- | --- |
| 1-5 | P1 | fixed | applied |
