#!/usr/bin/env python3
"""Reference-integrity checks. Does not certify physical or visual accuracy."""
from pathlib import Path
from urllib.parse import unquote
import csv
import json
import re

ROOT = Path(__file__).resolve().parents[1]
errors = []

PRIVATE_DIRS = {"node_modules", "dist", "private", "private-reference-review", "raw-third-party", "tmp", ".netlify", ".shots", "render-review"}

def private_path(path):
    relative = path.resolve().relative_to(ROOT)
    return bool(set(relative.parts) & PRIVATE_DIRS) or relative.parts[:2] == ("assets", "owner")

def check(condition, message):
    if not condition:
        errors.append(message)

def read_json(name):
    try:
        return json.loads((ROOT / name).read_text(encoding="utf-8"))
    except Exception as exc:
        errors.append(f"{name}: {exc}")
        return {}

sources = read_json("data/sources.json").get("sources", [])
source_ids = {item["id"] for item in sources}
check(len(source_ids) == len(sources), "Duplicate source IDs")
spec = read_json("data/specifications.json")
scene = read_json("data/scene-spec.json")
check(spec.get("reference") == "Q2718110", "Wrong watch reference")
check(spec.get("calibre") == "854/1", "Wrong calibre")
for key, value in spec.get("evidence", {}).items():
    for source in value.get("sources", []):
        check(source in source_ids, f"Unknown source {source} for {key}")
check(spec.get("evidence", {}).get("nominal_power_reserve", {}).get("value") == 45, "Wrong historical reserve")
check(spec.get("evidence", {}).get("jewels", {}).get("value") == 21, "Wrong corroborated jewel count")
check(spec.get("evidence", {}).get("published_components", {}).get("value") == 180, "Wrong published component count")
check(spec.get("evidence", {}).get("vibration_rate", {}).get("value") == 21600, "Wrong vibration rate")
for key,value in spec.get("physical_geometry_mm", {}).items():
    check(value is None, f"Unsupported physical dimension filled: {key}")

def read_csv(name):
    with (ROOT/name).open(newline="",encoding="utf-8") as stream:
        reader = csv.DictReader(stream)
        rows = list(reader)
        check(all(None not in row for row in rows), f"Extra CSV columns: {name}")
        return rows

inventory = read_csv("data/assembly-inventory.csv")
parts = {row["id"]:row for row in inventory}
check(len(parts) == len(inventory), "Duplicate assembly IDs")
for row in inventory:
    check(not row["parent_id"] or row["parent_id"] in parts, f"Unknown parent for {row['id']}")
    for source in row["source_ids"].split("|"):
        check(source in source_ids, f"Unknown source for {row['id']}")
    visited = set()
    parent = row["id"]
    while parent:
        if parent in visited:
            errors.append(f"Assembly parent cycle at {row['id']}")
            break
        visited.add(parent)
        parent = parts.get(parent,{}).get("parent_id","")

check(parts.get("I001",{}).get("parent_id") == "C100", "Crown must follow moving case")
check(parts.get("I003",{}).get("parent_id") == "C100", "Pusher must follow moving case")
check(parts.get("B000",{}).get("parent_id") == "C000", "Bracelet must follow fixed assembly")
nodes=scene.get("nodes",[])
check({n["id"] for n in nodes}==set(parts), "Scene/inventory node mismatch")
for node in nodes:
    check(node.get("physical_transform") is None, f"Unverified physical transform for {node['id']}")
    check(node.get("physical_dimensions_mm") is None, f"Unverified dimensions for {node['id']}")
    check(node.get("parent")== (parts[node["id"]]["parent_id"] or None), f"Parent mismatch for {node['id']}")

constraints=scene.get("reference_constraints",{})
check(constraints.get("recto_numerals")=="Arabic","Recto must have Arabic numerals")
check(constraints.get("gmt_pusher_position_recto")=="above_crown_right","GMT pusher must be above recto crown")
check(constraints.get("controls_reverse")=="left_pusher_above_crown","Reverse control orientation incorrect")
check(constraints.get("automatic_rotor") is False,"No automatic rotor allowed")
check(constraints.get("recto_lower_display")=="small_seconds","Wrong recto register")
check(constraints.get("reverse_lower_display")=="24_hour","Wrong reverse register")
check(scene.get("mm_to_m")==0.001,"Incorrect glTF unit conversion")

for claim in read_csv("data/claims.csv"):
    for source in claim["source_ids"].split("|"):
        check(source in source_ids,f"Unknown claim source for {claim['claim_id']}")
frames=read_csv("data/disassembly-frame-log.csv")
frame_sources = {source["id"]: source for source in sources}
check(len({frame.get("frame_id") for frame in frames}) == len(frames), "Duplicate frame IDs")
for frame in frames:
    frame_id = frame.get("frame_id", "<missing>")
    status = frame.get("inspection_status", "")
    source = frame_sources.get(frame.get("source_id"))
    timestamp = frame.get("timestamp") or ""
    page = frame.get("page") or ""
    file_path = frame.get("file_path") or ""
    check(source is not None, f"Unknown frame source: {frame_id}")
    check(status in {"not_reviewed", "reviewed_partial", "reviewed"}, f"Invalid frame inspection status: {frame_id}")
    check(frame.get("calibre_identity_confirmed") in {"false", "unknown"}, f"Unsupported frame calibre identity: {frame_id}")
    if timestamp:
        valid_timestamp = re.fullmatch(r"[0-9]{2}:[0-5][0-9]", timestamp) is not None
        check(valid_timestamp, f"Invalid frame timestamp (mm:ss required): {frame_id}")
        if valid_timestamp:
            minutes, seconds = map(int, timestamp.split(":"))
            runtime = (source or {}).get("runtime_seconds")
            check((source or {}).get("type") == "video", f"Timestamp on non-video frame source: {frame_id}")
            if runtime is not None:
                check(isinstance(runtime, (int, float)) and not isinstance(runtime, bool) and 0 <= minutes * 60 + seconds < runtime,
                      f"Frame timestamp outside source runtime: {frame_id}")
    if status == "not_reviewed":
        check(not timestamp and not page and not file_path, f"Unreviewed frame has a locator: {frame_id}")
    elif status in {"reviewed_partial", "reviewed"}:
        check(bool(timestamp or page.strip() or file_path.strip()), f"Reviewed frame missing locator: {frame_id}")
        if source and source.get("type") == "video":
            check(bool(timestamp), f"Reviewed video frame missing timestamp: {frame_id}")
        check(bool(frame.get("side")) and bool(frame.get("orientation")) and bool(frame.get("scale_reference")),
              f"Reviewed frame missing view metadata: {frame_id}")
        check(frame.get("rights_status") == "no_redistribution", f"Reviewed frame rights not recorded: {frame_id}")
        check((source or {}).get("rights") == "no_redistribution" and (source or {}).get("bundled") is False,
              f"Reviewed frame source redistribution policy mismatch: {frame_id}")
        check(not file_path, f"Restricted source frame must remain external: {frame_id}")
        if page.startswith(("https://", "http://")) and source:
            locator_url = page.split(" ", 1)[0]
            allowed_urls = {url for url in (source.get("url"), source.get("publisher_url")) if url}
            if timestamp and re.fullmatch(r"[0-9]{2}:[0-5][0-9]", timestamp) and source.get("url"):
                minutes, seconds = map(int, timestamp.split(":"))
                separator = "&" if "?" in source["url"] else "?"
                allowed_urls.add(f"{source['url']}{separator}t={minutes * 60 + seconds}s")
            check(locator_url in allowed_urls, f"Frame locator does not match source/timestamp: {frame_id}")

owner_source = frame_sources.get("U01", {})
check(owner_source.get("bundled") is False, "Owner photograph must not be bundled publicly")
check(owner_source.get("url") is None, "Owner photograph must not have a public URL")

for doc in ROOT.rglob("*.md"):
    if private_path(doc):
        continue
    content=doc.read_text(encoding="utf-8")
    check("\u2014" not in content,f"Em dash found: {doc.relative_to(ROOT)}")
    for target in re.findall(r"!?\[[^\]]*\]\(([^)]+)\)",content):
        target=target.split(" ",1)[0]
        if target.startswith(("https://","http://","#","mailto:")):
            continue
        path=unquote(target.split("#",1)[0])
        if path:
            resolved = (doc.parent / path).resolve()
            check(resolved.is_relative_to(ROOT), f"Link leaves public repository in {doc.relative_to(ROOT)}")
            if resolved.is_relative_to(ROOT):
                check(not private_path(resolved), f"Public link targets private material in {doc.relative_to(ROOT)}")
                check(resolved.exists(), f"Broken local link in {doc.relative_to(ROOT)}: {target}")

for name in ["exterior-layout","case-motion","display-layers","movement-functions"]:
    check((ROOT/f"assets/schematics/{name}.svg").exists(),f"Missing schematic {name}")

if errors:
    for error in errors:
        print("FAIL:",error)
    raise SystemExit(1)
status_counts = {}
for frame in frames:
    status = frame.get("inspection_status", "")
    status_counts[status] = status_counts.get(status, 0) + 1
status_summary = "; ".join(f"{count} {status}" for status, count in sorted(status_counts.items()))
print(f"PASS: {len(source_ids)} source records; {len(parts)} assembly records; {len(frames)} frame slots ({status_summary}).")
print("PASS: local links, private owner-photo policy, reference constraints and null physical geometry.")
print("This validates documentation integrity, not watch authenticity or an exact movement reconstruction.")
