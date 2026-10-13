# Instructions for agents working in this repository

## Objective

Build reference documentation and later a 3D exploded model for the photographed Jaeger-LeCoultre Reverso Duo Q2718110, Calibre 854/1.

## Reference authority

1. The privately retained owner wrist photograph controls the recto appearance and visible control placement. Public contributors use its recorded observations and original-model renders.
2. The inspected supplied-photo observations control the provisional reverse appearance.
3. Historical manufacturer material controls exact-reference specifications.
4. Direct movement photographs and reviewed teardown frames control internal geometry when available.
5. Current Tribute documents are comparison material. Do not transplant their dial, slider or specifications into this project.

Read START_HERE.md and docs/12-dot-brief.md before modeling.

## Non-negotiable constraints

- Recto: silver, black Arabic numerals, blue hands, circular lower small seconds.
- Recto: crown on right; rectangular GMT pusher above crown.
- Reverse: dark two-register dial; crown and pusher appear on left with 12 kept at the top.
- One manual movement. No automatic rotor.
- Use 45-hour reserve and 180 components for the historical 854/1 catalogue record.
- Keep the 21-jewel record scoped to corroborated calibre data.
- Do not fill unknown movement footprint, pivot coordinates, screw lengths or gear tooth counts with plausible-looking numbers.
- Do not turn project object IDs into OEM part numbers.
- Preserve the owner's source photograph privately without AI alteration; exclude `assets/owner/` and image derivatives from Git and public distribution.
- Keep serial numbers, acquisition paperwork, certificates, contacts and credentials outside this public project.
- Do not copy third-party manuals or footage into the repo without appropriate rights.

## Work style

Make reversible modeling choices autonomously and label illustrative choices. Use mm for authoring, an explicit meter conversion for glTF, and stable project object IDs.

Render and check both dials, both control orientations, reversal states and exploded states after meaningful changes. Update evidence records when a stronger source is added. Existing uncertainty is not a reason to stop exterior modeling.

## Verification

Run python3 tools/validate_pack.py after edits to documentation or data. This is a reference-integrity check, not a substitute for visual inspection.

Ship the exterior and case animation before expanding into unsupported internal detail.
