# Assembly map and exploded-view grouping

The machine-readable [inventory](../data/assembly-inventory.csv) assigns stable **project IDs**. They are not Jaeger-LeCoultre part numbers.

Rows are conceptual groups or candidate components. Their quantity is blank where not established. A logical collection is not a physical part, and group rows must not be summed into the published 180-component count.

## Display grouping

| Group | Physical/display role | Explosion suggestion |
| --- | --- | --- |
| Fixed cradle | Baseline support | Keep fixed |
| Moving case | Holds calibre and display stacks | Move laterally as a complete module first |
| Recto crystal | Outer recto protective surface | +Z explanatory offset |
| Recto hands | Hour, minute, seconds | +Z, separate by register |
| Recto dial | Numeral and seconds face | +Z below its hands |
| Calibre module | One movement, `M000` with twelve detailed educational groups | Central baseline after case separation; separate calibre explosion for close study |
| Reverse dial | Second-zone and 24-hour face | -Z |
| Reverse hands | Hour, minute, 24-hour indicator | -Z beyond reverse dial |
| Reverse crystal | Outer reverse protective surface | -Z |
| Crown and pusher | Two independent controls | Separate along their own flank if illustrating input |
| Bracelet and clasp | Wrist attachment | Keep visible and separate from moving module |

These are presentation directions, not removal directions. Crystal retention, gaskets and dial fasteners have not been verified. Showing a layer separately does not prove it is a detachable single piece in that exact way.

## Internal calibre grouping

The current [movement source](../model/movement.js) creates `M000` with twelve direct subgroups. Shapes are original procedural educational geometry, not authenticated parts or calibrated coordinates.

| ID | Current group | Evidence boundary |
| --- | --- | --- |
| M001 | Mainplate | Source-informed artist support geometry |
| M002 | Upper bridges | Source-informed sculpted support geometry; S07 285s/315s and S09 context |
| M010 | Winding / setting | Source-informed artist wheels and levers; S07 450s context |
| M020 | Barrel | Source-informed artist barrel and conceptual mainspring; S07 210s context |
| M030 | Wheel train | Source-informed artist layout; S07 255s/270s context, not verified tooth counts |
| M040 | Escapement | General educational geometry, not an authenticated pallet/escape-wheel design |
| M050 | Balance | Source-informed artist balance; S07 90s/405s context, general hairspring |
| M060 | Recto works | Schematic display transfer, not a physical train claim |
| M070 | Reverse works | Schematic display transfer/correction, not a physical train claim |
| M080 | 24-hour works | Schematic indicator drive, not a physical train claim |
| M090 | Bearings | Illustrative support accents, not verified jewel locations or count |
| M091 | Fasteners | Illustrative fasteners, not verified bores or a service parts inventory |

[S07](https://www.youtube.com/watch?v=BohN-EtjQuw) is visually reviewed at [recorded locators](../data/disassembly-frame-log.csv); exact 854/1 engraving remains unread. [S09](../references/movement-image-atlas.md) is an inspected publisher-attributed assembled photo, not a traced or calibrated drawing. Neither authenticates the owner's unopened movement. The original opaque-module phase is no longer the current representation.

## Guided calibre assembly

[model/assembly.js](../model/assembly.js) is the shared source for viewer stages, calibre explosion and export animation. In Calibre or Calibre exploded view, use Play/Pause, scrub or previous/next stage controls to inspect the 12-second sequence.

| Progress | Seated groups / explanation |
| --- | --- |
| 0 | Separated groups; enlarged gaps aid identification |
| 0.14 | Mainplate |
| 0.34 | Barrel and wheel train |
| 0.46 | Escapement |
| 0.60 | Bridges, bearings and fasteners |
| 0.74 | Balance |
| 1 | Winding / setting and schematic display works |

This is an explanatory sequence, not factory assembly order, disassembly instructions or proof of mechanical fit. The mainspring/hairspring and small fasteners teach functional groups without claiming original dimensions. Native scene export is assembled regardless of the current view; GLB provides independent reversal, whole-watch explosion, calibre explosion and calibre assembly clips. [The original-model MP4](../renders/calibre-assembly.mp4) contains no third-party footage.

## Scene parentage

A project graph provides grouping, not manufacturing truth:

- Fixed assembly contains the cradle and bracelet.
- Moving assembly contains case body, controls, movement and both display stacks.
- Calibre contains structural, winding, timekeeping and display-work groups.
- Scene overlays contain labels, leaders, source badges and accuracy indicators.

All nodes below the moving assembly follow normal case reversal. Explosion transforms are a separate presentation layer.

## Part identity workflow

For a new observed component, record its source image and locator, visible boundaries, uncertainty, material status, quantity scope and parent relation. If a part cannot be identified, create a temporary `unidentified_...` node with a source locator rather than assigning an invented function.

Promote a candidate into a confirmed component only when the evidence supports that identity. Preserve the earlier uncertainty in the change record.

## Counts

The six output hands follow the documented display functions: three recto and three reverse. That is a display-object count, not the manufacturer's movement-part count.

Likewise, two modeled crystal objects follow two visible protective display faces. Exact crystal construction, retention, gaskets and service replacements remain separate evidence questions.
