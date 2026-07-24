# Homepage Design QA

## Visual truth

- Source design: `assets/ui/home/design/home-reference.png`
- Supplied production slices: `assets/ui/home/slices/`
- Normalized source evidence: `reports/home-reference-normalized.png`
- Desktop implementation: `reports/home-redesign-desktop-light.png`
- Compact desktop implementation: `reports/home-redesign-desktop-compact.png`
- Dark theme implementation: `reports/home-redesign-desktop-dark.png`
- Mobile implementation: `reports/home-redesign-mobile-light.png`
- Full desktop comparison: `reports/home-design-comparison.png`
- Focused card comparison: `reports/home-card-comparison.png`

The source design is 3840 x 2160. Desktop QA normalized it to a 2048 x
1152 comparison canvas. The implementation screenshot uses a 2048 x 1152
CSS viewport at device scale 1.

## Tested state

- Homepage in light theme.
- New Concept English 1 and 2 are available and clickable.
- New Concept English 3 and 4 are visible but locked.
- Course counts and sentence counts come from the current content data.
- Practice counts come from persisted local learning records.
- Theme selection persists and dark mode has a dedicated visual treatment.

## Fidelity review

- Typography: Chinese and Latin hierarchy, size, weight, and line height closely
  follow the reference without negative letter spacing.
- Spacing: header height, hero crop, four-card grid, card padding, metadata band,
  locked-state copy, and CTA alignment match the reference proportions.
- Color: the supplied background and transparent course covers are used directly.
  Each card retains its course tint and accent color.
- Imagery: no replacement artwork or CSS-drawn course covers are used.
- Copy: the product copy follows the reference. Mock statistics were intentionally
  replaced with real content and learning data.
- Responsive behavior: four columns on desktop, two columns on tablet, and one
  column on mobile without horizontal overflow.
- Course-card proportions: the four-column layout follows the source card ratio
  of 904:850, with fluid internal spacing instead of a fixed minimum height.

## Interaction review

- The full New Concept English 1 and 2 cards open their respective course pages.
- The New Concept English 3 and 4 cards remain non-interactive and communicate
  their locked state.
- The light/dark control works from both icon targets.
- Returning from a course restores the homepage.
- Existing course, preview, practice, answer-validation, and analysis flows remain
  available.
- Browser console errors during the automated homepage flow: 0.

## Iteration history

The first implementation pass exposed four visible differences: course cards were
too white, header controls were too far from the right edge, lower card content
sat too high, and dark-mode logo/icon contrast was weak.

The final pass added per-course tinted surfaces, asymmetric header padding,
stable summary/status heights, and dark-theme asset filters. Post-fix evidence is
captured in `reports/home-design-comparison.png` and
`reports/home-redesign-desktop-dark.png`.

## Intentional differences

- New Concept English 1 shows 72 lessons and 956 sentence units.
- New Concept English 2 shows 96 lessons and 1217 sentence units.
- New Concept English 3 and 4 show pending-import statistics.
- The header uses an `S` avatar placeholder because authentication and user
  profile imagery are outside this homepage iteration.

## Verification

- Static production build: passed.
- Homepage desktop/mobile browser test: passed.
- Existing New Concept English 1 token-analysis browser regression: passed.
- Horizontal overflow: none at tested desktop and mobile viewports.
- Primary navigation and theme interactions: passed.

final result: passed
