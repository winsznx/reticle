# Reticle design system

Mark: the crosshair design itself, a 16x16 bitmap that is also taped out as a circuit. One flat colour, centre dot in amber. Minimum size 16 px. Clear space is one grid cell on every side.

Themes
- Light, the printed photomask: paper `#F2EFE6`, ink `#0B0B0C`.
- Dark, the cleanroom: near-black `#0A0A0B`, text `#E9E4D6`, amber safelight accent.
- One accent in both: litho amber `#E8A33D`. Amber is a fill and a rule. Text that must be amber on paper uses `#8A5A0B`.

Type: Hanken Grotesk for text, JetBrains Mono for every number, hash and address.

Shape: hard 1 px rules, square corners, no shadows, no glass, no gradients. Density comes from tabular mono numbers and thin borders.

Motion: row-by-row paint-in for chain renders, 120 ms colour transitions, nothing decorative. Respects reduced motion.

Tokens live in `web/src/styles/tokens.css` and mirror `brand.json`.
