"""Shared lote/pest normalization — single source of truth for S1 and S3.

Kept identical across stages on purpose: if S1's monitoring harmonization and S3's
fumigación/intervention harmonization used different lote-name maps, joins between them
would silently mismatch.
"""
from pathlib import Path

import yaml

ROOT = Path(__file__).resolve().parents[1]
CONFIG = yaml.safe_load(open(ROOT / "config.yaml"))

# Lote name normalization: raw (trimmed) -> canonical lote_key matching DB `lotes.nombre`.
# "- clonales" sub-blocks are folded into the parent lote (owner decision: lote-level only, no sublote).
LOTE_MAP = {
    "1. Piedra Paula": "1. Piedra Paula",
    "2. Salto de Tequendama": "2. Salto de Tequendama",
    "3. Australia": "3. Australia",
    "4. La Vega": "4. La Vega",
    "5. Pedregal": "5. Pedregal",
    "6. La Unión": "6. La Unión",
    "7. El Triunfo": "7. El Triunfo",  # NOT in current DB lotes table
    "8. Irlanda": "8. Irlanda",
    "8. Irlanda - clonales": "8. Irlanda",
    "9. Acueducto": "9. Acueducto",
    "9. Acueducto - clonales": "9. Acueducto",
    "10. Santa Rosa": "10. Santa Rosa",
}
DB_KNOWN_LOTES = {
    "1. Piedra Paula", "2. Salto de Tequendama", "3. Australia", "4. La Vega",
    "5. Pedregal", "6. La Unión", "8. Irlanda", "9. Acueducto", "10. Santa Rosa",
}

PEST_CASE_FIX = {
    "cladosporium": "Cladosporium",
    "otro": "Otros",
}

PEST_GROUP_OF = {}
for group_key, spec in CONFIG["focus_pests"].items():
    for member in spec["members"]:
        PEST_GROUP_OF[member.strip()] = group_key


def normalize_lote(raw, log: list) -> str | None:
    key = str(raw).strip()
    mapped = LOTE_MAP.get(key)
    if mapped is None:
        log.append(f"UNMAPPED lote raw={key!r} — dropped")
        return None
    if mapped not in DB_KNOWN_LOTES:
        log.append(f"NOTE lote {mapped!r} not in current DB lotes table (kept; likely low-volume/retired)")
    return mapped


def normalize_pest(raw, log: list) -> str:
    key = str(raw).strip()
    key = PEST_CASE_FIX.get(key.lower(), key)
    return key
