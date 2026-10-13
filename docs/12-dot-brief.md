# Dot handoff: Q2718110 exploded-view project

## Objective

Create a detailed 3D model and exploded-view presentation of the owner's Jaeger-LeCoultre Reverso Duo Q2718110. Use the photographed watch as the exterior target and historical Calibre 854/1 sources for specifications.

The current deliverable includes an assembled exterior, case reversal, twelve detailed educational movement groups and guided assembly. Exact internal reconstruction remains an evidence-dependent extension; the former opaque movement block is no longer the current model.

## Required reading and evidence

Read START_HERE.md, AGENTS.md, docs/02-owner-photo-observations.md, docs/03-dials-and-exterior.md, docs/04-case-and-reversal.md and docs/05-calibre-854-1.md.

The owner's actual wrist photograph is a private reference, not a public asset or generated image. Public contributors should use docs/02-owner-photo-observations.md and the original-model renders; access to the private image is not required for the app or validation.

Use references/movement-image-atlas.md and docs/06-disassembly-reference.md for movement evidence. [S07's maintenance video](https://www.youtube.com/watch?v=BohN-EtjQuw) has been visually reviewed with real locators in data/disassembly-frame-log.csv. JLC/SWISS is visible but exact 854/1 engraving remains unread; title attribution is not authentication of the owner's movement. S09 has been externally inspected with publisher attribution, without tracing or calibration.

## Locked exterior requirements

1. Use the silver recto with black Arabic numerals, blue hands and lower round small seconds.
2. Use a dark reverse with an upper circular time display and a lower 24-hour display.
3. Put the rectangular GMT pusher above the crown, toward 12.
4. Put controls on the recto right and reverse left through correct moving-case parentage.
5. Keep both dial texts upright and readable from their own viewing side.
6. Use the photographed metal bracelet.
7. Model fixed cradle and moving case separately.
8. Keep both dials and one movement inside the moving case during normal reversal.

Do not borrow the hidden top slider, baton dial, larger case or 42-hour specification from a current Tribute.

## Locked calibre record

854/1, manual winding, historical catalogue reserve 45 h, 21,600 vibrations/h, 180 published components. Twenty-one jewels is corroborated by primary cataloguing of the same calibre in other watches. The owner's internal movement has not been directly inspected.

Do not add a rotor, date mechanism or other undocumented complication.

## Build stages

### Stage 1: exterior and orientation

Create case/cradle, crystals, dial planes/textures, six display hands, crown, visible rectangular pusher and bracelet groups. Use stable IDs from data/assembly-inventory.csv.

Use the catalogue's 42.2 × 26 mm as a provisional overall envelope, not movement dimensions. Keep missing physical dimensions unset in the evidence data. Artist-chosen proportions must remain editable.

Deliver matched recto and reverse renders. Resolve visual discrepancies before adding hidden complexity.

### Stage 2: normal reversal and display behavior

Animate release, rotation around a Y-parallel axis and reseating. Keep fixed cradle and bracelet stationary. Exact pivot location and slide stroke are illustrative until measured.

Implement one time state, linked minutes, +1-hour reverse pusher correction and the reverse 24-hour relationship. Leave the lower scale's zero orientation pending a sharp reference if necessary.

### Stage 3: explanatory explosion

Provide separate explosion control. Separate the moving module from cradle, then its recto stack, movement module and reverse stack. Keep physical assembled positions separate from presentation offsets.

The initial phase used an opaque labelled movement module. The current model replaces it with twelve direct educational groups under `M000`, authored in model/movement.js and carrying visible accuracy limits. Mainplate, bridges, winding, barrel, train and balance are source-informed artist geometry; escapement/hairspring are general educational geometry and recto/reverse/24-hour works are schematic transfers, not a verified physical train.

### Stage 4: detailed educational movement and guided assembly

The current Calibre and Calibre exploded views expose the movement groups. model/assembly.js is the shared 12-second sequence: separated groups, mainplate, barrel/train, escapement, supports, balance, then winding/display works, at progress 0 / 0.14 / 0.34 / 0.46 / 0.60 / 0.74 / 1. Play/Pause, scrub and previous/next stage controls support inspection. A separate running-movement phase animates balance, fork, escape wheel and train during seated, exploded and assembling views; Run/Pause freezes it without changing assembly progress. Balance cadence is derived from 21,600 vph; other rates, ratios and amplitudes are illustrative. This order and disconnected running motion are explanatory, not a factory or workshop assembly procedure.

Use reviewed S07 locators at 90s, 155s, 210s, 255s, 270s, 285s, 315s, 405s, 450s and 480s for visual context, with the frame log's uncertainty intact. A future evidence-traced reconstruction needs authenticated, correctly oriented faces and calibrated dimensions. Do not infer hidden depth, bores, pivot coordinates or tooth counts from appearance. Source-inspired detailed geometry does not satisfy that precision level.

## Deliverables

- Procedural exterior and movement sources, documented mm units and stable project IDs.
- Native Three.js assembled snapshot with evidence and assembly metadata, independent of the active viewer pose.
- GLB/glTF with one explicit `0.001` mm-to-meter conversion and independent reversal, whole-watch explosion, calibre explosion and calibre assembly clips; the assembly clip includes qualified running movement motion.
- Assembled recto and reverse comparison renders and case reversal sequence.
- Exploded whole-watch assembly plate.
- [Calibre assembled](../renders/calibre-assembled.png), [calibre exploded](../renders/calibre-exploded.png) and [original-model assembly MP4](../renders/calibre-assembly.mp4), with no third-party footage.
- Updated evidence data retaining null physical dimensions and the unresolved-geometry note.

## Completion rule

Use docs/11-quality-checks.md, `npm run check`, `python3 tools/validate_pack.py` and, with the local server running, `node tools/check_playback.mjs` for acceptance. The Node checks cover behavior, assembly stages and native geometry round trips. Ship the qualified exterior, educational movement and guided assembly when those pass. Continue toward a precision movement reconstruction only when new evidence can materially improve it.

The repository's schematics are guides, not geometry assets or factory drawings.
