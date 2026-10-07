#!/usr/bin/env python3
"""Regenera las copias autocontenidas del motor de consultas Esco (#311)."""
from pathlib import Path
root = Path(__file__).resolve().parent.parent
source = (root / 'src/utils/escoConsultas.ts').read_bytes()
for tree in ['src/supabase/functions/server', 'supabase/functions/make-server-1ccce916']:
    (root / tree / 'esco-consultas.ts').write_bytes(source)
(root / 'supabase/functions/make-server-1ccce916/chat.tsx').write_bytes((root / 'src/supabase/functions/server/chat.tsx').read_bytes())
