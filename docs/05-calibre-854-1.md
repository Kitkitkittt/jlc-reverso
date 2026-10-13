# Calibre 854/1

## Calibre record

| Property | Value | Evidence |
| --- | --- | --- |
| Winding | Manual | S01; S13 PDF p.4 / printed p.27 |
| Published component count | 180 | S01 |
| Nominal reserve | Approximately 45 h | S01; S13 PDF p.4 / printed p.27 |
| Beat rate | 21,600 vibrations/h | S01; S13 PDF p.4 / printed p.27 |
| Balance frequency | 3 Hz | Derived from 21,600 / 3,600 / 2 |
| Beats per second | 6 | Derived from 21,600 / 3,600 |
| Jewels | 21 | S02 and S03, same calibre in other inspected specimens |
| Recto | Hours, minutes, small seconds | S01; S13 PDF p.3 / printed p.24, Reverso Duoface legend |
| Reverse | Second-zone hours/minutes and 24-hour indicator | S01; S13 PDF p.3 / printed p.24, Reverso Duoface legend |
| Correction | Reverse time advances one hour per pusher actuation | S01 |
| Linked minutes | Identical on both dials; no fractional-hour zone offset | S13 PDF p.5 / printed p.29 |

Published specifications apply to the historical calibre. They do not measure the reserve or condition of the owner's watch.

S13 is a privately supplied Jaeger-LeCoultre-attributed historical family booklet, not an exact-reference-confirmed Q2718110 manual. It covers Reverso Duoface and Grande Reverso Ultra Thin 1931 Duoface variants; the 854/1 technical characteristics appear on printed p.27. It independently strengthens functional specifications and linked-display behavior, but supplies no component count or jewel count and does not change the scopes of S01's 180 components or S02/S03's 21 jewels. Its diagrams establish no exact internal geometry. See [the source register](../references/source-register.md) for provenance/version limits.

## Why two faces need only one movement

The manufacturer describes two time displays powered by one movement. Both are parts of one mechanical timekeeping system. The reverse adds a second-zone indication and 24-hour information.

For a display simulation, maintain one underlying elapsed-time state and a whole-hour reverse offset. Do not build two unrelated clocks that drift independently.

The reverse transfer train, correction coupling and indicator drive are shown schematically, not reconstructed as a verified physical train. A functional diagram of those relationships is different from a parts drawing.

## General mechanical explanation

The following combines general hand-wound mechanical-watch theory with source-informed educational geometry. Reviewed S07 footage and the inspected S09 assembled photo inform visible shapes, not measured 854/1 dimensions or the owner's actual internal arrangement.

| Subsystem | Function | What a model can explain now | What requires 854/1 evidence |
| --- | --- | --- | --- |
| Winding mechanism | Stores energy through crown input | Source-informed artist wheels and levers, with S07 450s context | Exact wheels, click, springs, dimensions and locations |
| Barrel and mainspring | Stores and delivers mechanical energy | Source-informed barrel and conceptual mainspring, with S07 210s context | Barrel dimensions, arbor, spring length and section |
| Going train | Transfers energy toward escapement | Source-informed artist train, with S07 255s/270s context | Pivot centers, wheel sequence details and tooth counts |
| Escapement | Couples train energy to oscillator and meters release | General educational escape wheel and pallet | Authenticated escape wheel and pallet geometry |
| Balance and hairspring | Oscillating time regulator | Source-informed balance, general hairspring and 3-Hz conceptual oscillation | Balance dimensions, hairspring geometry and support coordinates |
| Recto motion works | Drives hour and minute displays | Schematic display relationship | Pinions, setting interface and physical levels |
| Small-seconds drive | Drives lower recto seconds | Schematic one-revolution-per-minute display behavior | Exact physical drive path |
| Reverse display works | Drives reverse hour and minute indication | Schematic linked minutes with a whole-hour offset | Actual transfer/correction architecture |
| 24-hour works | Differentiates the reverse's day and night | Schematic one-revolution-per-day display behavior | Wheel ratios and coupling details |
| Plates, bridges, jewels | Support moving elements | Source-informed artist supports, with S07 285s/315s and S09 context | Exact profiles, bores, fasteners and jewel locations |

The assembly inventory names these subsystems for modeling. It is not an OEM bill of materials. `M000` now contains twelve direct groups: `M001`, `M002`, `M010`, `M020`, `M030`, `M040`, `M050`, `M060`, `M070`, `M080`, `M090` and `M091`. Their original procedural geometry is detailed educational work, not a count of the manufacturer's 180 components. See [the assembly map](07-assembly-map.md) for stage and source boundaries.

## Important exclusions

- A manually wound 854/1 does not require an automatic rotor.
- The target's documented displays do not include a date, chronograph, tourbillon or power-reserve hand.
- The dark dial is not an exposed movement or a transparent caseback.
- Twenty-one jewels does not identify twenty-one externally visible red circles.
- One hundred eighty components does not tell us how many meshes to create. Small parts may be grouped, and exact counting requires the manufacturer's counting convention.
- A current 854 image with a top slider is not a verified older 854/1 parts layout.

## Movement imagery

See [the image atlas](../references/movement-image-atlas.md). The S09 photo has been externally inspected and its publisher's 854/1 attribution recorded. No bridge or pivot tracing, calibration or authentication against the owner's movement has been performed.

[S07](https://www.youtube.com/watch?v=BohN-EtjQuw), uploaded by Timekeeper's Corner on 2023-06-20, has now been visually reviewed. The 608.3-second, 1280 x 720 source shows a balance side at 90s, partial parts at 155s, barrel/mainspring at 210s, exposed train at 255s, train in place at 270s, an isolated sculpted bridge at 285s, installed bridge at 315s, running balance at 405s, winding/setting levers at 450s and an assembled view at 480s. [The frame log](../data/disassembly-frame-log.csv) records locators and limits. JLC/SWISS is visible, but exact 854/1 engraving remains unread. Its title attributes the calibre; it does not authenticate the owner's unopened movement or establish factory assembly order.

## Modeling precision levels

1. **Opaque calibre module:** the initial exterior phase's label-only representation, now replaced in the app.
2. **Detailed educational subsystem view:** the current twelve groups, source-informed artist supports, winding, barrel, train and balance, plus general escapement/hairspring and schematic display transfers. Calibre and Calibre exploded views, a 12-second guided assembly and original-model PNG/MP4 deliverables expose this level with explicit limits.
3. **Evidence-traced movement faces:** correctly oriented silhouettes, bridge profiles and visible coordinates traced from authenticated photographs. Not achieved by source-inspired geometry alone.
4. **Exact part reconstruction:** calibrated dimensions, both sides, individual parts and validated physical relationships.

The current app is level 2. Levels 3 and 4 still require authenticated, calibrated internal evidence; visual source review does not fill unknown physical dimensions.
