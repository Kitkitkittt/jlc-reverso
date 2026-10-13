# Data records

- sources.json: source IDs, exact inspected URLs, locators and inspection scope.
- specifications.json: values with evidence labels. Unknown physical geometry is null.
- scene-spec.json: project hierarchy, axes, display constraints and unresolved transforms.
- assembly-inventory.csv: 56 project groups/candidate components, not a 180-part OEM bill of materials.
- claims.csv: 28 statements with evidence scope and limitations.
- disassembly-frame-log.csv: 12 requested views with per-frame inspection statuses; S07 has 8 reviewed_partial slots, 1 reviewed slot and 3 not_reviewed slots.

Blank quantities mean unknown. Blank frame fields mean not reviewed. A functional group can be confirmed as a function while its physical geometry remains unknown.

The same-calibre jewel count is scoped to other catalogued specimens. The owner's movement has not been directly inspected.
