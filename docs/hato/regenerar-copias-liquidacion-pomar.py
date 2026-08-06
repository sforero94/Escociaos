"""Regenera las DOS copias Deno-side de `src/utils/hatoLiquidacionPomar.ts`.

Uso, desde cualquier parte del repo:

    python3 docs/hato/regenerar-copias-liquidacion-pomar.py

El motor es puro (cero imports), así que las copias son byte-idénticas al
original salvo por el encabezado -- mismo patrón que
`regenerar-copias-servidor.py` (calculosHato.ts) y
`regenerar-copias-hato-alertas.py` (hatoAlertas.ts).

NUNCA edites las copias a mano para silenciar una diferencia: edita
`src/utils/hatoLiquidacionPomar.ts` y vuelve a correr este script.
"""
import os

ROOT = os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
SRC = os.path.join(ROOT, 'src/utils/hatoLiquidacionPomar.ts')

HEADER = """// ARCHIVO: supabase/functions/server/hato-liquidacion-pomar.ts
// DESCRIPCION: Copia Deno-side, GENERADA, de `src/utils/hatoLiquidacionPomar.ts`.
// Regenerar con `python3 docs/hato/regenerar-copias-liquidacion-pomar.py`
// (docs/hato/regenerar-copias-liquidacion-pomar.py) -- NUNCA editar a mano.
//
// POR QUE EXISTE ESTE DUPLICADO: `hato-produccion-quincena-foto.ts` corre en
// el árbol de despliegue de la edge function y no puede importar desde
// `src/utils/` -- misma restriccion que produjo `calculos-hato.ts` y
// `hato-alertas.ts` como copias.
//
// El motor es puro (cero imports), asi que las copias son byte-identicas al
// original debajo de este encabezado. Cambiar la logica exige editar
// `src/utils/hatoLiquidacionPomar.ts` y regenerar -- nunca tocar esta copia.

"""


def main():
    with open(SRC, encoding='utf-8') as fh:
        body = fh.read()
    for rel in ('src/supabase/functions/server/hato-liquidacion-pomar.ts',
                'supabase/functions/make-server-1ccce916/hato-liquidacion-pomar.ts'):
        dest = os.path.join(ROOT, rel)
        with open(dest, 'w', encoding='utf-8') as fh:
            fh.write(HEADER + body)
        print('wrote %s (%d bytes)' % (rel, len(HEADER + body)))


main()
