# Start here

The project includes a **photograph-informed 3D exterior, detailed educational movement and guided assembly app for this specific Q2718110**, rather than a generic Reverso. Run it with `npm ci` and `npm run serve`, then open `http://127.0.0.1:8000/model/`. Choose Calibre or Calibre exploded for movement close views; use Play/Pause, scrub and previous/next stage controls for the guided assembly.

## Read in this order

1. Read [the owner-photo observations](docs/02-owner-photo-observations.md). The actual wrist photograph is retained privately and is not included in the public repository.
2. Read [dial details](docs/03-dials-and-exterior.md).
3. Read [the case mechanics](docs/04-case-and-reversal.md).
4. Read [the Calibre 854/1 note](docs/05-calibre-854-1.md) and [movement image atlas](references/movement-image-atlas.md).
5. Use [the Dot brief](docs/12-dot-brief.md), [scene specification](data/scene-spec.json) and [assembly inventory](data/assembly-inventory.csv).

## Four facts to retain throughout the build

- The recto has **Arabic numerals**, not the baton dial of a different Reverso.
- The GMT pusher is **above the crown** on the same moving-case flank. It is not the hidden top slider shown by a current Tribute manual.
- The recto's lower display is **small seconds**. The reverse's lower display is **24 hours**.
- The target calibre is **854/1**. The historical catalogue specifies **45 hours and 180 components**.

## Evidence labels

| Label | Meaning | Modeling use |
| --- | --- | --- |
| verified_primary | Statement supported by manufacturer content or direct cataloguing of a physical specimen | Use within the source's stated reference scope |
| observed_owner | Visible in the actual wrist photo or explicitly supplied by the owner | Use for this watch's exterior |
| observed_supplied_photo | Visible in supplied seller/reference photos | Use for appearance; do not infer unseen parts |
| derived | Calculation or logical result, with its premises recorded | Use as a mathematical constraint |
| general_mechanical | General mechanical explanation | Useful for teaching; not evidence of 854/1 geometry |
| reported_unconfirmed | A reported value lacks sufficient exact-reference confirmation | Keep outside fixed geometry |
| unknown | Not established | Use null, omit or visibly qualify |

A verified calibre specification does not prove that the owner's individual movement has been inspected. A photograph verifies visible appearance, not material composition, dimensions or originality.

## Build progression

The initial phase delivered the correct assembled exterior, case reversal and an opaque movement module. The current model replaces that block with twelve detailed educational groups and a guided assembly presentation. Exact movement reconstruction remains a separate evidence-dependent goal.

Do not delay useful educational views while searching for a complete service manual. Do not label source-inspired movement geometry as measured or exact.

## Current model boundary

The procedural sources are [model/exterior.js](model/exterior.js) and [model/movement.js](model/movement.js), authored in mm with stable assembly IDs; [model/assembly.js](model/assembly.js) supplies the shared 12-second assembly stages. The viewer implements linked displays, GMT correction, illustrative release/turn/reseat motion, whole-watch explosion and separate calibre explosion/assembly controls. GLB downloads convert mm to meters exactly once and keep four animation clips independent.

The only fixed dimensional reference is the catalogue's overall 42.2 x 26 mm case envelope. Dial typography, bracelet link geometry, thickness, controls, clearance motion and movement geometry remain editable artistic approximations. [S07's maintenance footage](https://www.youtube.com/watch?v=BohN-EtjQuw) is now visually reviewed with [recorded locators](data/disassembly-frame-log.csv), but exact calibre engraving and compatibility with the owner's unopened watch remain unconfirmed. S09 supplies an externally inspected, publisher-attributed assembled photo, not calibrated geometry. Evidence records retain null physical dimensions. Guided assembly is explanatory, not a service sequence.

Use [the acceptance checks](docs/11-quality-checks.md) for further refinement. The remaining evidence priorities are [listed here](docs/13-open-questions.md).
