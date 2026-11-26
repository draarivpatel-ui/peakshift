# Design

PeakShift uses a control-room ledger world. The page is an operational planning surface, not a marketing site. Near-black green surfaces, measured grid lines, phosphor green, cyan and warm amber accents make carbon intensity, time and circuit occupancy legible at a glance.

## Type

- Public Sans 400, 600 and 800 for interface copy.
- IBM Plex Mono 500 for measurements, totals, hour labels and data output.
- Display type stays below 6rem with tight but not extreme tracking.

## Color

- Background: deep green-black `#07110d` and panel green `#0d1c15`.
- Text: warm off-white `#eef7ea`.
- Muted text: green-tinted `#a8bda9`.
- Low-carbon positive: phosphor green `#70e000`.
- Grid intensity ramp: cyan `#48cae4`, amber `#ffb703`, red-orange `#fb8500`.
- Focus rings use cyan with a dark outer offset.

## Composition

The title stands alone. There is no eyebrow or tagline. The first viewport is a working planner: grid profile controls and intensity chart beside an editable appliance queue. Results appear below as a timeline, acknowledgment gate, modeled summary and per-appliance ledger. The limits panel is a first-class part of the flow.

## Components

Controls are compact and rectangular with 12px radii. Borders carry structure; shadows are reserved for the few floating states. Chart and timeline geometry is crisp SVG, with numeric labels in monospace. No emoji, decorative gradients, glass effects or generic card grids.

## Motion

Motion is minimal. Interactive states use short opacity or transform transitions, and smooth scrolling is deliberately avoided so scripted demo capture and keyboard navigation remain exact.
