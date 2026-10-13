# Materials and rendering

These are artist-facing choices. They do not establish metallurgical composition or factory finishing processes.

## Material targets

| Surface | Appearance target | Evidence / treatment |
| --- | --- | --- |
| Case and cradle exterior | Reflective polished steel | U01; steel reference from S01 |
| Bracelet | Bright articulated metal links | U01; exact polishing of each hidden face unknown |
| Recto dial | Light silver with distinct numeral and textured central zones | U01/U02 |
| Recto hands | Blue-black reflective steel appearance | U01/U02; exact bluing process not tested |
| Reverse dial | Dark grey/black, fine patterned field | U03 |
| Reverse hands | Silver/light with inset treatment | U03; lume composition unknown |
| Crystals | Clear transparent protective faces | S08 reports sapphire; owner's material not independently tested |
| Movement supports | Sculpted metallic mainplate and bridges | Source-informed artist geometry from reviewed S07 and inspected S09; no color-to-alloy inference |
| Wheels | Brass-looking volumes with circular brushing | Source-inspired color and procedural finish, not measured alloy or authentic tooth counts |
| Bearings / jewel accents | Restrained colored support accents | Illustrative locations; accent count does not establish the published 21 jewels |

Do not name an exact steel grade such as 316L without an adequate source. Do not turn every highlight into a separate metal strip.

## PBR setup

Use physically plausible metal and transmission materials with restrained roughness. Any numeric roughness, IOR, bevel radius or lighting value is an artistic rendering parameter until independently specified.

Use low-cost texture-based guilloche. The current crown uses geometric grip ridges and polished steel without a dark color texture; the single beveled case shell provides continuous highlights instead of extra metal strips. Add geometric relief only when close views justify it. Keep source-derived outlines independent of decorative detail so a material pass cannot silently change dimensions.

The detailed movement uses original procedural perlage and tangent-oriented brushing on steel/brass-looking volumes, with circular brushing on wheels. These are rendering choices, not verified JLC finishing processes. Mainplate, bridges, winding, barrel, train and balance are source-informed artist geometry; escapement/hairspring are general educational shapes and display works are schematic. Reviewed [S07 footage](https://www.youtube.com/watch?v=BohN-EtjQuw) and the inspected [S09 photo](../references/movement-image-atlas.md) provide appearance context without calibrated internals or owner authentication.

## Camera and lighting

Use an orthographic or long-lens render for reference comparisons, followed by a three-quarter hero view. Match both dial orientations under the same neutral light before trying dramatic lighting.

A large soft light helps reveal case grooves and crown/pusher separation. Avoid lighting that washes out recto numerals or makes the dark dial appear as an exposed movement.

## Exploded plate requirements

- Clearly separate case, displays and movement.
- Use stable project IDs in callouts.
- Show which parts belong to one module.
- Include an accuracy legend: source-traced, inferred, schematic or unresolved.
- State that layer gaps are enlarged for explanation.
- Give the movement its own assembled and exploded close views, with the educational accuracy boundary visible.

Avoid falsely implying micrometer precision with fine dimensions around an illustrative mechanism.

## Export deliverables

The current build supplies procedural exterior and detailed movement sources in mm, native Three.js JSON with evidence/assembly metadata, meter-scaled GLB with four independent clips, matched exterior renders, a whole-watch exploded plate and captioned PNG capture. The movement is no longer an opaque envelope.

Movement deliverables are [calibre assembled](../renders/calibre-assembled.png), [calibre exploded](../renders/calibre-exploded.png) and [guided calibre assembly MP4](../renders/calibre-assembly.mp4). The 12-second assembly uses shared stages from [model/assembly.js](../model/assembly.js); viewer Play/Pause, scrub and previous/next controls expose those stages interactively. The MP4 renders the original model, not S07 footage. Stage order and enlarged gaps are explanatory, not a workshop procedure. Native scene export stays assembled; GLB converts mm with one `0.001` scale and keeps reversal, whole-watch explosion, calibre explosion and calibre assembly separate.

The MP4 is 1280 x 960, H.264/yuv420p at 24 fps: 12 seconds of deterministic assembly sampled from the shared stages, followed by 2 seconds fully assembled. Frames render the original viewer with a fixed camera, stage title and educational accuracy caption; encoding uses FFmpeg with `-framerate 24 -c:v libx264 -crf 18 -pix_fmt yuv420p -movflags +faststart -an`. The movement remains visibly animated throughout; separated groups running are a teaching device, not a functioning disassembled mechanism. Balance cadence comes from 21,600 vph; other motion rates and amplitudes remain illustrative.

These are educational exterior/movement/assembly deliverables, not factory CAD. Physical evidence dimensions remain null where unmeasured; no render texture, bore, pivot or gear implies a calibrated internal measurement.
