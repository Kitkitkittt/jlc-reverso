# Controls, time relationships and animation

This defines display-simulation behavior. It is not a reference-specific servicing procedure.

Historical family evidence comes from S13, the privately supplied Jaeger-LeCoultre-attributed Reverso Duoface booklet, not an exact-reference-confirmed Q2718110 manual. PDF p.4 / printed p.27 describes clockwise manual winding with the crown in position 1; PDF p.5 / printed p.28 describes time setting in crown position 2, clockwise hand movement and return to position 1. These are source observations, not a servicing guide or measured stem/stroke geometry. Publication/version and reference-match limitations are recorded in [the source register](../references/source-register.md).

## One time state

Let `t` be elapsed seconds represented on the recto and `o` a whole-hour reverse offset.

```text
recto_time   = t
reverse_time = t + 3600 * o
o            = o mod 24
```

Hours and minutes are displayed conventionally on each face. The recto small-seconds display follows elapsed seconds. The reverse 24-hour indicator follows the reverse's time, including its offset.

The exact physical gear train that implements these relationships remains unresolved.

## Angles for a display model

Use clockwise angles as seen by a viewer facing the particular dial:

```text
minute_angle          = 360 * ((time_seconds mod 3600) / 3600)
hour_angle            = 360 * ((time_seconds mod 43200) / 43200)
recto_seconds_angle   = 360 * ((t mod 60) / 60)
reverse_24h_angle     = dial_zero_angle
                        + 360 * ((reverse_time mod 86400) / 86400)
```

`dial_zero_angle` is the 24-hour track's actual zero position. It is deliberately unset until the exact reverse track is checked in a sharp reference. Do not assume 00:00 is printed at the top.

The reverse face points outward through -Z in the assembled recto frame. Its world rotation sign must produce clockwise motion when viewed from that face. Copying the recto's signed Z rotation without checking the viewer frame can make the reverse hands run backwards.

## GMT pusher

One full actuation increments the reverse hour offset by +1 (S01's forward-hour correction). Minutes remain linked: S13 PDF p.5 / printed p.29 explicitly states identical minutes on both dials and excludes fractional-hour time differences. That page instructs adjustment by the pushpiece at 10 o'clock on the back, or the corrector with a tool, while accounting for the 24-hour day/night indication. The family manual does not independently specify the +1-per-press direction, exact control coordinates or stroke.

For the simulator, changing only the hour offset must also update the 24-hour indication. Twelve presses return the reverse hour hand to the same 12-hour position but change the day/night phase. Twenty-four presses restore the full offset state.

A desired correction of -7 hours can be expressed as +17 presses in this forward-only conceptual model. This follows modular arithmetic and the catalogue's forward-hour correction. It is not permission to force a physical control or evidence of an unobserved alternate setting mode.

## Motion axes

| Object | Conceptual motion |
| --- | --- |
| Crown | Rotation about its stem axis; stem direction must be confirmed for a detailed mechanism |
| Pusher | Short inward translation from its side of the moving case; actual stroke unknown |
| Complete moving case | Release/slide, Y-parallel half-turn, reseat |
| Recto hour/minute hands | Different angular speeds about their shared display center |
| Recto seconds hand | Separate lower pivot |
| Reverse hour/minute hands | Separate reverse display center |
| Reverse 24-hour hand | Separate lower pivot, 24-hour period |

Crown and pusher have separate objects and functions. The pusher should animate above the crown, not inside it.

## Viewer controls

The app in `model/` provides recto/reverse/oblique selection, normal case reversal, explosion amount, calibre-module visibility, labels and an evidence legend. Unknown technical values are not exposed as measured specifications. Clock speed is a display-simulation control, not a mechanical rate adjustment.

Keep explosion disabled during a normal case-reversal demo. An exploded display stack can be shown in a separate presentation mode.

Reversal releases the whole moving case, demonstrates a Y-parallel half-turn with illustrative clearance, then reseats it. Cradle and bracelet remain stationary. The actual slide stroke, clearance path and pivot placement are unresolved. GLB includes separate reversal and explosion clips; do not play them simultaneously.

## Running educational calibre

Balance, fork, escape wheel and train motion are presentation animation, including while the groups are separated or being seated. Disconnected parts visibly running in an exploded view do not imply a functioning disassembled mechanism. The winding/setting wheels and stationary supports do not spin during normal running.

The catalogue's 21,600 vibrations/hour gives six beats/second and three full balance oscillations/second. This constrains cadence only; amplitudes, escape-wheel increments, train speeds and ratios are illustrative. Train phase accumulates per running frame using the selected speed, while balance/escapement phase uses unscaled elapsed time. Speed changes affect only subsequent frames, never past phase. Time-setting and GMT correction change displays without resetting either phase. Run/Pause controls movement independently of guided-assembly Play/Pause.


## Functional review

Check matched minutes, +1-hour reverse correction, 24-hour phase through a 12-hour change, a full 24-press cycle, readable reverse text and clockwise hands on both faces.

These checks test the simulator's documented behavior. They do not validate the physical internal mechanism.
