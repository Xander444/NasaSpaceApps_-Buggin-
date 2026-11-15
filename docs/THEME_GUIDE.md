# Flame in Freefall theme guide

This guide keeps new pages and features consistent with the approved fire-and-space visual system. The interface should feel calm, technical, and traceable. It should not look like a generic AI product.

## Core palette

| Token | Hex | Use |
| --- | --- | --- |
| Space | `#06090c` | Main background |
| Space raised | `#0b1117` | Panels and control groups |
| Panel | `#101820` | Secondary surfaces |
| Line | `#253443` | Standard dividers and borders |
| Line bright | `#365571` | Interactive control borders |
| Text | `#eef5fa` | Primary text |
| Muted | `#94a6b5` | Supporting text |
| Flame orange | `#ff7a3d` | Primary actions, hazard emphasis, step numbers |
| Flame soft | `#ffa06f` | Section labels and secondary emphasis |
| Outer-flame blue | `#3a8dcc` | Data structure and selected states |
| Blue bright | `#67b9ec` | Links, focus states, and source navigation |

Orange and blue have different jobs. Orange calls attention to action or fire-related meaning. Blue communicates structure, navigation, evidence, and selection.

## Typography and layout

- Use Inter or a system sans-serif for normal text.
- Use IBM Plex Mono for identifiers, small labels, values, and technical metadata.
- Prefer large plain headings, strong spacing, and thin dividers to decorative cards.
- Keep body text readable at 16 pixels or larger on project pages.
- Keep control labels above their inputs.
- Use four-pixel corner radii or less.
- Keep pointer and touch targets at least 44 pixels high where practical.
- Make the main navigation visible and horizontally scrollable on narrow screens. Do not hide important pages in an unexplained icon.

## Interface rules

Do:

- Separate sections with borders and whitespace.
- Place source links close to the claims they support.
- Show reported values, user-entered values, modeled values, and assumptions as different categories.
- Use text with color for every status, so color is never the only signal.
- Keep the current page visible in the navigation.
- Make primary actions orange and source or evidence links blue.

Do not:

- Use gradient text or an “AI” rainbow effect.
- Use pulsing, flashing, or glowing status circles.
- Put ordinary text in floating or lifted bubbles.
- add broad shadows to cards, controls, or headings.
- Add decorative imagery to the wordmark. The approved header is text only.
- Present a modeled output as a measurement.

## Language rules

Use these phrases consistently:

- **relative screening index**, not probability, risk probability, or safety score;
- **candidate hotspot**, not dangerous location;
- **modeled influence**, not airflow speed unless a physical speed was supplied;
- **unknown**, not zero, when a value is absent;
- **illustrative coefficient** when a parameter was not calibrated from a cited experiment.

Use a short sentence when punctuation would make an important limitation harder to scan. For example: “If a value is missing, show unknown. Never invent it.”

## Page roles

- `/` explains the challenge, the team’s approach, and where to begin.
- `/evidence` searches and compares sourced investigation records.
- `/simulator` imports or loads a cabin, confirms assumptions, and ranks candidate hotspots.
- `/sources` lists primary records and the official challenge resources.
- `/about` introduces the team. Replace all sample text before submission.

## Before merging a frontend change

- [ ] The page works at mobile and desktop widths.
- [ ] Every interactive control has a visible keyboard focus state.
- [ ] No gradient text, flashing status, glow, or broad shadow was added.
- [ ] Missing data is shown as unknown rather than inferred as zero.
- [ ] Screening output is called a relative screening index.
- [ ] Any scientific claim links to its source or clearly says that it is an assumption.
- [ ] The change does not hide mesh confirmation, metre-unit confirmation, or the simulator validity boundary.

