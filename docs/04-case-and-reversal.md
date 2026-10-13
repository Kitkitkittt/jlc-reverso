# Case construction and reversal

## What is established

The watch has a fixed supporting cradle and a reversible moving case. The crown, pusher, both dials, both hand sets and movement belong to the moving case assembly.

S05 supports the sliding and turning concept. U01 and U03 establish the visible control-side change. The mechanism's exact rail, hinge, detent, spring and retaining geometry has not been established for this specimen.

## Model hierarchy

| Assembly | Includes | Motion |
| --- | --- | --- |
| Fixed support | Cradle, stationary lug/end structure, bracelet attachments | Stays attached to the wrist |
| Moving case | Case body, two display faces, movement, crown and pusher | Slides, turns and reseats |
| Reversal mechanism | Sliding and pivot interfaces | Keep as an unresolved interface until referenced |
| Bracelet | Repeating links and clasp | Articulates independently of case reversal |

Do not animate the cradle and bracelet through the same half-turn as the moving case.

## Coordinate convention

Use an assembled recto coordinate frame:

- +X: toward the crown, on the recto's right.
- +Y: toward the 12 end.
- +Z: out through the recto crystal.
- Origin: project datum at the assembled cradle center, not a manufacturer datum.

Case reversal is a half-turn about an axis parallel to Y. The axis's exact offset and the slide distance remain unresolved.

A simple rotation about the origin gives `(x, y, z) -> (-x, y, -z)`. This explains why right-side controls become left-side controls while the 12 end stays at the top. It is a mathematical orientation relationship, not a measured hinge location.

## Animation states

| State | Display | Required relationship |
| --- | --- | --- |
| Recto seated | Silver dial outward | Moving case flush with cradle |
| Released | Same dial partly displaced | Clearance before reversal |
| Turning | Case rotating relative to fixed support | Controls, crystals and displays move together |
| Reverse seated | Dark dial outward | Upright 12 end; controls on left |

Use a project slide parameter and pivot offset until measurements are available. Label them as animation choices. Do not publish a guessed rail stroke as a factory dimension.

## Explosion versus normal reversal

A normal reversal does not disassemble the watch. It leaves the two dial stacks and movement together inside the moving case.

An exploded view intentionally separates modeled groups for explanation. Provide a distinct control for explosion. Do not imply that moving the Reverso case out of its cradle causes the crystals, dials or movement to detach.

For the exploded view, use the fixed support as the baseline and move the complete moving-case module aside. Explode its displays and movement only in a subsequent explanatory state.

## Geometry still needed

Rail profiles, pivot shoulders, retaining pins, detent locations, spring geometry, cradle interior finish and all clearances remain unknown for exact reconstruction. A simplified rail or pivot may help an educational model, provided it is marked illustrative.

The submitted generic case sketch is not evidence of those exact hidden details.
