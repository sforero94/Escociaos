"""Regenera las DOS copias Deno-side de `src/utils/calculosHato.ts`.

Uso, desde cualquier parte del repo:

    python3 docs/hato/regenerar-copias-servidor.py

El motor es puro (cero imports), así que las copias son byte-idénticas al
original salvo por el encabezado. `src/__tests__/calculosHatoParidad.test.ts`
lo exige y falla si divergen.

NUNCA edites las copias a mano para silenciar una falla de paridad: edita
`src/utils/calculosHato.ts` y vuelve a correr este script.
"""
import os

# Raíz del repo, derivada de la ubicación de este archivo (docs/hato/…).
ROOT = os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
SRC = os.path.join(ROOT, 'src/utils/calculosHato.ts')
MARKER = '// ============================================================================\n// Tipos compartidos'

HEADER = """// ARCHIVO: supabase/functions/server/calculos-hato.ts
// DESCRIPCIÓN: Copia Deno-side, mantenida a mano, de `src/utils/calculosHato.ts`.
//
// POR QUÉ EXISTE ESTE DUPLICADO: `chat.tsx` (y el tick de alertas de S6) no
// pueden importar desde `src/utils/` — cruzarían la frontera del árbol de
// despliegue de la edge function. Es exactamente la misma restricción que
// produjo `priorizacion-scouting.ts` como copia de `priorizacionMonitoreo.ts`.
//
// CONTRATO DE PARIDAD — `src/__tests__/calculosHatoParidad.test.ts` exige que
// TODO lo que va debajo del marcador "Tipos compartidos" sea BYTE-IDÉNTICO al
// archivo del frontend, y además corre ambas implementaciones contra los
// mismos fixtures. El motor es puro (cero imports), así que no hay ninguna
// razón legítima para que los cuerpos difieran: si necesitas cambiar la lógica
// del hato, cambia AMBOS archivos en el MISMO commit o el test falla. Eso es
// intencional — es el único mecanismo que impide que el P&G del hato que ve
// Esco/Telegram se desincronice del que ve la app.
//
// NO edites este archivo a mano para "arreglar" una falla de paridad: edita
// `src/utils/calculosHato.ts` y regenera la copia.

"""


def main():
    with open(SRC, encoding='utf-8') as fh:
        full = fh.read()
    idx = full.index(MARKER)
    body = full[idx:]
    for rel in ('src/supabase/functions/server/calculos-hato.ts',
                'supabase/functions/make-server-1ccce916/calculos-hato.ts'):
        dest = os.path.join(ROOT, rel)
        with open(dest, 'w', encoding='utf-8') as fh:
            fh.write(HEADER + body)
        print('wrote %s (%d bytes)' % (rel, len(HEADER + body)))
    print('body bytes copied: %d' % len(body))


main()
