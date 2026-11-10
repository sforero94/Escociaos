#!/usr/bin/env python3
"""Rebuild the licensed D3 font subset; install fonttools==4.60.1 in a temp venv.
Input is the unmodified public NotoSans-Regular.ttf identified in the D3 manifest.
No network, credentials, product inputs or production effects.
"""
import argparse
import hashlib
from importlib.metadata import version
from pathlib import Path
from fontTools import subset
from fontTools.ttLib import TTFont

SOURCE_SHA256 = 'b85c38ecea8a7cfb39c24e395a4007474fa5a4fc864f6ee33309eb4948d232d5'
UNICODES = list(range(0x20, 0x100)) + list(range(0x2000, 0x2070)) + [0x20AC, 0x2192, 0x2260, 0x2212]
NAMES = {1: 'Esco Sans Subset', 2: 'Regular', 3: 'Esco Sans Subset Regular 1',
         4: 'Esco Sans Subset Regular', 6: 'EscoSansSubset-Regular',
         16: 'Esco Sans Subset', 17: 'Regular'}

def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--source', type=Path, required=True)
    parser.add_argument('--output', type=Path, required=True)
    args = parser.parse_args()
    if version('fonttools') != '4.60.1':
        raise SystemExit('Use fonttools==4.60.1 for reproducible output.')
    if hashlib.sha256(args.source.read_bytes()).hexdigest() != SOURCE_SHA256:
        raise SystemExit('Source SHA-256 mismatch; no output written.')
    font = TTFont(args.source, recalcTimestamp=False)
    options = subset.Options()
    options.layout_features = ['*']
    options.name_IDs = ['*']
    options.name_legacy = True
    options.name_languages = ['*']
    operation = subset.Subsetter(options=options)
    operation.populate(unicodes=UNICODES)
    operation.subset(font)
    for record in font['name'].names:
        if record.nameID in NAMES:
            record.string = NAMES[record.nameID].encode(record.getEncoding())
    font.save(args.output)
    print(hashlib.sha256(args.output.read_bytes()).hexdigest(), args.output.stat().st_size)

if __name__ == '__main__':
    main()
