"""Regenera las DOS copias Deno-side de `src/utils/hato/criaAutomatica.ts`
(ESCO-135: ficha automática de la ternera retenida al registrar un parto).

Uso, desde cualquier parte del repo:

    python3 docs/hato/regenerar-copias-cria-automatica.py            # escribe
    python3 docs/hato/regenerar-copias-cria-automatica.py --check    # solo verifica

El módulo es puro (cero imports), así que las copias son byte-idénticas al
original debajo del primer separador de sección -- mismo patrón que
`regenerar-copias-liquidacion-pomar.py`. `--check` regenera en memoria y sale
con código 1 si alguna copia difiere; lo usa
`src/__tests__/hatoCriaAutomaticaParidad.test.ts`.

NUNCA edites las copias a mano: edita `src/utils/hato/criaAutomatica.ts` y
vuelve a correr este script.
"""
import os
import sys

ROOT = os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
SRC = os.path.join(ROOT, 'src/utils/hato/criaAutomatica.ts')
MARKER = '// -------'

DESTINOS = [
    'src/supabase/functions/server/hato-cria-automatica.ts',
    'supabase/functions/make-server-1ccce916/hato-cria-automatica.ts',
]

HEADER = """// ARCHIVO: supabase/functions/server/hato-cria-automatica.ts
// DESCRIPCION: Copia Deno-side, GENERADA, de `src/utils/hato/criaAutomatica.ts`.
// Regenerar con `python3 docs/hato/regenerar-copias-cria-automatica.py`
// -- NUNCA editar a mano.
//
// POR QUE EXISTE ESTE DUPLICADO: `telegram/conversations/eventoHato.ts` y el
// Deshacer de `telegram/bot.ts` corren en el arbol de despliegue de la edge
// function y no pueden importar desde `src/utils/` -- misma restriccion que
// produjo `calculos-hato.ts` y `hato-liquidacion-pomar.ts` como copias.

"""


def generar():
    with open(SRC, encoding='utf-8') as fh:
        full = fh.read()
    return HEADER + full[full.index(MARKER):]


def main():
    contenido = generar()
    check = '--check' in sys.argv[1:]
    diferencias = []
    for rel in DESTINOS:
        dest = os.path.join(ROOT, rel)
        if check:
            actual = open(dest, encoding='utf-8').read() if os.path.exists(dest) else None
            if actual != contenido:
                diferencias.append(rel)
        else:
            with open(dest, 'w', encoding='utf-8') as fh:
                fh.write(contenido)
            print('wrote %s (%d bytes)' % (rel, len(contenido)))
    if check:
        if diferencias:
            for rel in diferencias:
                print('DIFIERE: %s' % rel)
            sys.exit(1)
        print('ok: copias al dia')


main()
