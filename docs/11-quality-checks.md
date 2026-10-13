# Quality and acceptance checks

## Exterior acceptance

| Check | Pass condition | Reject |
| --- | --- | --- |
| Reference | Q2718110 steel-bracelet target | A generic modern Tribute |
| Recto numerals | Black Arabic shapes from U01 | Baton markers or Roman numerals |
| Recto hands | Blue-toned photographed profile | Generic large dauphine hands |
| Lower recto display | Circular seconds scale near 6 | Date, central seconds or 24-hour scale |
| Pusher | Rectangular, above crown on recto right | Below crown, inside crown or hidden top slider |
| Reverse orientation | Controls on left with 12 upright | Controls remain on right because hierarchy is wrong |
| Reverse dial | Dark upper time circle plus lower 24-hour register | Light dial or exhibition movement back |
| Bracelet | Metal articulated pattern | Leather strap substituted for target |
| Scale | Overall case envelope distinguished from moving case | 42.2 × 26 mm assigned to movement |

## Movement acceptance

- Label the target 854/1.
- State the historical 45-hour reserve and 180-component catalogue specification accurately.
- Scope 21 jewels to corroborated calibre evidence, not an inspection of the owner's movement.
- Include no automatic rotor.
- Keep unsupported geometry explicitly illustrative or unresolved.
- Do not add fake OEM numbers, calibrated dimensions, screw counts or gear teeth.
- Do not present a general mechanical diagram as a factory disassembly plate.
- Keep reverse display/correction works distinct from the base timekeeping explanation.

## Source acceptance

A new internal-geometry source needs identifiable calibre, provenance, orientation, locator, inspection status and rights status.

A search snippet, AI caption, video title or a photograph of a different calibre cannot justify exact bridge outlines. A modern official source is authoritative for its own model, not automatically for an older reference.

S07 has reviewed external video locators and S09 has an inspected, publisher-attributed assembled photograph. These are not an authenticated or calibrated full frame atlas. S13 corroborates historical family functions without establishing an exact Q2718110 manual or internal geometry.

## Render acceptance

Review recto, reverse, both control flanks, released case, turned case and exploded module. Use source comparisons at the same orientation.

Check for illegible callouts, overlapping parts, mirrored lettering, opaque crystals, disconnected controls, incorrect parenting and parts that collide when the exploded offsets return to zero.

## Precision statement

Each final plate must state one of:

- Exterior matched to supplied photographs; dimensions partly provisional.
- Educational exploded assembly; internal geometry illustrative.
- Evidence-traced movement faces; hidden geometry unresolved.
- Dimensioned component reconstruction, with explicit source coverage.

Use the highest level the evidence actually supports. Attractive detail alone does not raise the precision level.

## Repository checks

Run `python3 tools/validate_pack.py`. Then visually review the final renders. The script validates reference integrity, not physical authenticity.

## Public-repository privacy and phase continuity

The initial public file set excludes the owner's wrist photograph and its private record, review screenshots, third-party media, PDFs, environment files, credentials and Netlify linkage. Public documentation contains observations and attribution, not personal serials or acquisition paperwork. The original photograph remains unchanged locally; a public clone needs no private asset to validate or build.

Train time now accumulates with the selected speed per running frame, independently of wall-clock balance/escapement phase. Browser checks preserve all motion quaternions when changing speed while paused and then setting time or correcting GMT; resume continues from the same phase. `npm run check`, `python3 tools/validate_pack.py`, the real Chromium playback check and `npm run build` passed for this publication candidate.


## Quiet-gallery redesign verification

The redesigned app was visually exercised at 1440 × 1000 and 390 × 844: angled case, both upright faces, whole bracelet, halfway reversal, whole-watch explosion, assembled calibre and mobile part inspection. Watch/Mechanism/Sources expose contextual controls. Selected-part cards clear the mobile navigation, stay bounded and resolve real source locators; no horizontal overflow or application error was observed.

The Netlify toolbar and promotional badge are disabled at the host. A fresh production page contained no injected HUD script, and a desktop-to-mobile resize produced no error. Application error reporting remains intact.

`npm run check` passed behavior, assembly, motion, outward-wound movement geometry/open bores and native round trips for 284 meshes. The real Chromium playback check also passed contextual mode changes and selection without mutating source materials. Reference validation passed 17 sources, 56 assembly records and 12 frame slots; physical evidence dimensions remain null. The build publishes a field-allowlisted factual source index, never private images or filesystem locators.

## Previous running-calibre verification

The latest local app was inspected at 1440 × 1000 and 390 × 844. Both upright dials, seated rounded pusher, polished crown, reversal and whole-watch explosion were exercised. Crown changes from right to left through C100's half-turn while C000 remains fixed. Mobile calibre focus has no horizontal overflow and the application error panel remains empty.

Actual running spokes changed orientation at assembly progress `.42` without changing their pivot position or bridge orientation. Run/Pause froze both phase and spoke pose; setting time and pressing GMT left that phase unchanged. The real Chromium playback check passed movement pause/resume plus reversal and guided-assembly Play/scrub/hold/resume/stages/completion/reset. `npm run check` passed behavior, assembly, motion boundaries and native round-trip checks for 277 meshes.

All nine PNG plates and both model exports were regenerated. The generated native scene and GLB reopened with twelve M000 groups; complete scene bounds match through exactly one `0.001` conversion. The four GLB clips remain independent; the 12-second assembly now contains 50 tracks including running wheel/oscillator rotations. Playing the reopened assembly clip changed a train spoke quaternion. Native export restores assembled positions and paused phase metadata.

The regenerated original-model MP4 was decoded and visually inspected across opening, intermediate stages and assembled dwell: 1280 × 960, H.264/yuv420p, 24 fps, 336 frames, 14 seconds, no audio. Fixed framing, stage titles and explicit illustrative-motion limits remain visible. These local changes have not been deployed to production.


## Previous app verification (before running-calibre corrections)

The improved exterior, both upright dials and controls, reversal poses, whole-watch explosion and calibre assembled/exploded plates were inspected in the running browser. Crown and pusher remain parented to C100; calibre focus hides the fixed assembly through ancestor visibility and restores the user's crystal/bracelet choices on exit.

The live smoke exercised assembly Play, exact .42 scrub hold, resume, .46/.34 stage navigation, stopped completion at 1, fixed C000, visibility restoration and named recto reset. It also exercised reversal hold, linked reverse minutes and twenty-four-press GMT restoration without assembly changing the clock.

Before the running-calibre corrections, `npm run check`, `node tools/check_playback.mjs http://127.0.0.1:8704` and `python3 tools/validate_pack.py` passed. The real Chromium regression verified reversal and calibre assembly: focused/unfocused scrub holds, resume, stages, completion and recto reset. Reference validation passed 17 sources, 56 assembly records and 12 frame slots, including unchanged owner-photo integrity and null physical geometry.

Procedural finish textures use exportable canvas-backed normal/roughness maps. PNG callouts retain separate wrapped names and evidence badges instead of compressing the entire label into one unreadable line.

Before the latest corrections, the generated native JSON and GLB reopened with `ObjectLoader` and `GLTFLoader`. Complete display-model bounds, including bracelet, matched between formats after the single `0.001` conversion. Those scene bounds are illustrative, not measured watch dimensions. Both retained twelve direct M000 groups and C100 control parentage. Four independent clips kept C000 fixed, and the calibre clips kept C100 fixed: case reversal (6 s), whole-watch explosion (4 s), calibre explosion (4 s) and educational assembly (12 s).

The previous native geometry regression retained 281 meshes with complete vertex data, assembled mm bounds, centered case and curved bracelet after JSON/ObjectLoader round trip. Modified geometry serializes buffers rather than stale constructor parameters. The compact native snapshot avoids whitespace overhead and the actual download path avoids base64 transport copies.

The previous original-model assembly MP4 was decoded and visually inspected at opening, intermediate stages and assembled dwell: H.264/yuv420p, 1280 x 960, 24 fps, 336 frames, 14 seconds. Camera framing stayed fixed. Stage titles and the educational accuracy boundary remained visible; no source footage, copied frames or audio were present.

Previous production [deploy 6acdba878ad255bacdec7724](https://6acdba878ad255bacdec7724--jlc-reverso-q2718110.netlify.app/model/) is available at [the public app](https://jlc-reverso-q2718110.netlify.app/model/). That deployment predates the running-calibre and latest case/control corrections. Actual 1440 x 1000 desktop and 390 x 844 mobile sessions exercised boot, assembly Play/scrub/hold/resume/stages, fixed cradle and controls-panel collapse. Desktop also exercised stopped assembly completion, reversal hold and the 24-press GMT cycle. Upright reverse orientation and mobile callouts were visually inspected; neither viewport overflowed horizontally and the application error panel stayed empty.

All three production export buttons produced files: GLB, compact native JSON and captioned PNG. Published GLB, native JSON, assembly MP4, calibre assembled/exploded PNGs and the whole-watch exploded PNG returned HTTP 200 with byte counts and SHA-256 matching the local artifacts. Owner photo, source records and the playback regression page each returned HTTP 404 and were not published.

The managed browser reported an injected Netlify toolbar `sendViewport` / `TypeError: Illegal invocation` at `/.netlify/scripts/hud?variant=public`, separate from the application. No application error suppression or hosting-setting change was applied.

Accuracy level: photograph-informed exterior with provisional proportions and source-informed educational movement/assembly, not exact 854/1 geometry or workshop order. Eight frame slots are partly reviewed, one is reviewed and three remain unreviewed; calibre identity and calibrated internal measurements remain unconfirmed. Physical evidence dimensions stay null and third-party media stays external.
