#!/usr/bin/env python3
"""
Validates all Grade 8 curriculum manifests against the canonical JSON Schema,
ensures objective ID uniqueness, verifies January chapter sequence linkages,
and outputs a summary of curriculum size and depth distribution.
"""
import json
from pathlib import Path
import sys

try:
    import jsonschema
except ImportError:
    print("Error: jsonschema python package is required.")
    sys.exit(1)

ROOT = Path(__file__).resolve().parent.parent
CURR_DIR = ROOT / "delivery" / "december-2026" / "curriculum"
SCHEMA_PATH = CURR_DIR / "curriculum-schema.json"

MANIFEST_FILES = [
    "cbse-grade8.json",
    "icse-grade8.json",
    "cambridge-stage9.json",
]

def validate_manifests():
    if not SCHEMA_PATH.exists():
        print(f"Error: Schema not found at {SCHEMA_PATH}")
        sys.exit(1)

    schema = json.loads(SCHEMA_PATH.read_text(encoding="utf-8"))
    validator = jsonschema.Draft7Validator(schema)

    total_objectives_across_all = 0
    manifest_summaries = []
    has_errors = False

    print("=" * 80)
    print("Grade 8 Multi-Board Curriculum Manifest Validation")
    print("=" * 80)

    for filename in MANIFEST_FILES:
        filepath = CURR_DIR / filename
        if not filepath.exists():
            print(f"FAILED: {filename} does not exist at {filepath}")
            has_errors = True
            continue

        try:
            data = json.loads(filepath.read_text(encoding="utf-8"))
        except Exception as e:
            print(f"FAILED: {filename} JSON parse error: {e}")
            has_errors = True
            continue

        # 1. JSON Schema validation
        errors = list(validator.iter_errors(data))
        if errors:
            print(f"SCHEMA ERROR in {filename}:")
            for err in errors:
                print(f"  - Path: {' -> '.join(str(p) for p in err.absolute_path)}: {err.message}")
            has_errors = True
            continue

        # 2. Objective ID uniqueness & January chapter linkage
        chapter_ids = set()
        objective_ids = set()
        duplicate_obj_ids = []
        depth_counts = {}

        for chapter in data["chapters"]:
            cid = chapter["id"]
            chapter_ids.add(cid)

            for obj in chapter["learningObjectives"]:
                oid = obj["id"]
                if oid in objective_ids:
                    duplicate_obj_ids.append(oid)
                objective_ids.add(oid)

                depth = obj["depth"]
                depth_counts[depth] = depth_counts.get(depth, 0) + 1

        if duplicate_obj_ids:
            print(f"INTEGRITY ERROR in {filename}: Duplicate objective IDs found: {duplicate_obj_ids}")
            has_errors = True

        # Check January sequence references
        jan_seq = data.get("defaultJanuarySequence", [])
        invalid_jan_refs = [ref for ref in jan_seq if ref not in chapter_ids]
        if invalid_jan_refs:
            print(f"INTEGRITY ERROR in {filename}: defaultJanuarySequence references non-existent chapter IDs: {invalid_jan_refs}")
            has_errors = True

        total_obj_count = len(objective_ids)
        total_objectives_across_all += total_obj_count

        manifest_summaries.append({
            "board": data["board"],
            "filename": filename,
            "title": data["title"],
            "edition": data["editionOrFramework"],
            "chapters": len(data["chapters"]),
            "january_chapters": len(jan_seq),
            "objectives": total_obj_count,
            "depth_counts": depth_counts,
        })
        print(f"PASSED: {filename} ({data['board']}) — {len(data['chapters'])} chapters/strands, {total_obj_count} objectives.")

    print("\n" + "-" * 80)
    print("Curriculum Manifest Summary Table")
    print("-" * 80)
    header = f"{'Board':<18} | {'Chapters':<8} | {'Jan Ch':<6} | {'Objectives':<10} | {'Depth Breakdown (U / A / An / Ev)'}"
    print(header)
    print("-" * len(header))

    for s in manifest_summaries:
        dc = s["depth_counts"]
        u = dc.get("UNDERSTAND", 0)
        a = dc.get("APPLY", 0)
        an = dc.get("ANALYZE", 0)
        ev = dc.get("EVALUATE", 0)
        depth_str = f"U:{u} | A:{a} | An:{an} | Ev:{ev}"
        print(f"{s['board']:<18} | {s['chapters']:<8} | {s['january_chapters']:<6} | {s['objectives']:<10} | {depth_str}")

    print("-" * 80)
    print(f"Total Discrete Learning Objectives Cataloged Across 3 Boards: {total_objectives_across_all}")
    print("=" * 80)

    if has_errors:
        sys.exit(1)
    else:
        print("\nAll curriculum manifests are VALID and schema-compliant.")

if __name__ == "__main__":
    validate_manifests()
