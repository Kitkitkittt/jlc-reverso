# Geometry, coordinates and measurements

## Units and dimensions

Author in millimeters. Convert to meters exactly once for glTF, using `1 mm = 0.001 m`. A Blender workflow must set scene units deliberately rather than assuming an STL import has units.

The app's native procedural source is `model/exterior.js`, with editable artistic proportions under `PARAMETERS.illustrative`. Native Three.js JSON downloads remain in mm. GLB downloads use a single `Q2718110_meters` parent scaled by `0.001`; meshes and animation translations inherit that conversion. Do not apply another conversion when importing the GLB.

To reopen a native snapshot, load the JSON with `new THREE.ObjectLoader().parse(json)`. This preserves procedural textures, stable node names, evidence metadata and assembled transforms. The procedural source remains the authority for editable proportions; exported snapshots are generated assets.

S01's 42.2 × 26 mm provides an initial overall case envelope. Do not apply those dimensions to the moving case, dial opening or calibre.

Unknown values are JSON `null`, not zero. A zero-length pivot, zero-thickness dial or zero pusher stroke is not a valid representation of missing evidence.

## Coordinate frame

Use +X toward the recto crown, +Y toward 12 and +Z toward the recto viewer. Record this frame in every asset export.

Both dials are authored upright in their own visible frame. Reverse geometry faces outward through -Z in the assembled recto frame. Its visible text must read normally when viewed from that side.

Internal photographs need their own calibrated frame. Do not reuse exterior +X as the movement stem direction until the relationship is observed.

## Priority measurements

| Measurement | Required reference | Why it matters |
| --- | --- | --- |
| Overall case boundaries | Caliper photo showing the measured surfaces | Fixes size convention |
| Central moving case length/width | Released case, perpendicular image and dimension | Prevents envelope conflation |
| Total thickness | Side view with measured extrema | Fixes cradle/crystal stack |
| Visible dial aperture on both sides | Perpendicular macro view | Corrects numeral and hand proportions |
| Crown center, diameter, height | Recto flank macro plus scale | Controls silhouette |
| Pusher center, outer dimensions | Same flank and scale | Locks its position above crown |
| Bracelet attachment opening | End view with scale | Avoids ambiguous lug-width reports |
| Reversal axis and slide stroke | Sequence of released case views | Makes clearance animation accurate |
| Movement footprint and stack | Matched calibre drawing or calibrated movement photos | Enables accurate internal fit |

These are evidence requests, not dimensions already available.

## Photogrammetry limits

A single on-wrist oblique photo constrains visible appearance. It does not uniquely determine depth, hidden geometry or millimeter scale across different planes.

Perspective correction can help a planar dial texture. It cannot recover an obscured groove, turn the curved bracelet into an orthographic drawing or invent missing lettering. Preserve the original source and document any transformation used later.

## Model parameters

Keep two separate groups:

1. Physical parameters: sourced dimensions and their uncertainty.
2. Presentation parameters: explosion spacing, label offsets, camera position and light size.

Presentation choices may have explicit numbers. They must be labelled as such. Never copy an explosion gap into an assembled part thickness.

## Unknown internals

Movement length, width, bridge thicknesses, pivot coordinates, gear modules, tooth counts, arbor diameters, jewel bores and fastener dimensions remain unset. The model can still show subsystem groups without inventing those values.

A future exact reconstruction needs views and measurements that constrain all three dimensions. A pretty exploded rendering is not validation of fit.
