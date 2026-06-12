<!-- BEGIN:nextjs-agent-rules -->
# This is NOT the Next.js you know
This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` before writing any code. Heed deprecation notices.
<!-- END:nextjs-agent-rules -->

# Project: parametric dressmaking pattern app

A browser app that turns body measurements + style choices into printable sewing
patterns. Built slowly, block by block. The owner works from Aldrich's Metric
Pattern Cutting and owns the pattern maths; the AI helps with the front end.

## Tech stack
- Next.js (App Router) + TypeScript
- SVG for all pattern/figure drawing. No canvas, no 3D, no cloth simulation.
- PDF output (later) via a library, not the browser print dialogue.

## Architecture — do not break these
- All geometry is in millimetres: one canonical unit throughout the domain layer.
  The UI may display other units but converts at the boundary.
- The domain layer is pure: draft functions take measurements + style and return a
  `Pattern` (pieces of geometry). No React, no rendering inside them.
- `Pattern` is the single shared output. Several views render it: the flat pattern,
  a stylised on-avatar preview (later), and a print PDF (later). Keep them separate.
- One block = one draft function (e.g. `draftGatheredSkirt`). Blocks are distinct,
  not variations of one another; each has its own measurements and style params.
- Shared construction (e.g. `draftStraightWaistband`) lives in its own reusable
  function, composed by the blocks that need it.
- Variations are per-garment and come in two kinds: parameters (numeric tweaks like
  length, fullness) and features (added pieces like pockets). No global variation system.

## Code conventions
- Small, single-purpose functions; clear names; explicit types. No `any`.
- `@/` alias points to the project root. Domain logic in `lib/`, UI in `app/`.

## CRITICAL: pattern-drafting maths
- NEVER invent or guess drafting formulas, ease, measurements, or construction steps.
  They come only from the owner (via Aldrich). If a rule is missing, ASK — do not fill
  it in from general knowledge. Wrong geometry makes unwearable garments.

## Ways of working
- Prefer code the owner can read; explain anything non-obvious.
- Front-end framework code and debugging: help freely.
- Pattern geometry: implement only what the owner has specified; flag anything that
  looks like a drafting decision rather than making it yourself.

## Commands
- Dev: npm run dev
- Build: npm run build