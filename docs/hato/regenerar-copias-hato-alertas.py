#!/usr/bin/env python3
"""Regenera las copias Deno-side de `src/utils/hatoAlertas.ts` (motor puro del
tick de alertas, S6 -- plan §7.3).

Mismo motivo y mismo patrón que `regenerar-copias-importhato.py`: a
diferencia de `calculosHato.ts` (cero imports, copia BYTE A BYTE vía
`regenerar-copias-servidor.py`), `hatoAlertas.ts` SÍ importa
`@/utils/calculosHato` y `@/utils/importHato/overridesChapeta`, así que la
copia no puede ser byte-idéntica -- lo que este script garantiza es que el
CONTENIDO es idéntico salvo por los especificadores de import, reescritos de
forma determinística para Deno:

    '@/utils/calculosHato'                  ->  './calculos-hato.ts'
        (mismo nivel: la copia vive en <server>/hato-alertas.ts, junto a
        <server>/calculos-hato.ts -- a diferencia de las copias de
        importHato/, que viven un nivel más abajo)
    '@/utils/importHato/overridesChapeta'   ->  './importHato/overridesChapeta.ts'

Uso:
    python3 docs/hato/regenerar-copias-hato-alertas.py            # escribe
    python3 docs/hato/regenerar-copias-hato-alertas.py --check     # solo verifica

`--check` NO escribe nada: regenera en memoria y compara contra el árbol.
Sale con código 1 y una lista de diffs si algo no coincide -- lo usa
`src/__tests__/hatoAlertasParidadServidor.test.ts` para que un hand-edit de
una copia (en vez de editar el original + regenerar) rompa la suite.

NUNCA edites a mano `src/supabase/functions/server/hato-alertas.ts` ni
`supabase/functions/make-server-1ccce916/hato-alertas.ts`: edita
`src/utils/hatoAlertas.ts` y vuelve a correr este script.
"""
import os
import re
import sys

ROOT = os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
ORIGEN = os.path.join(ROOT, 'src/utils/hatoAlertas.ts')

DESTINOS = [
    'src/supabase/functions/server/hato-alertas.ts',
    'supabase/functions/make-server-1ccce916/hato-alertas.ts',
]

# Cualquier línea `import ... from '...'` de `hatoAlertas.ts` usa EXACTAMENTE
# uno de estos dos especificadores (verificado al escribir este script). Si
# alguien agrega un import nuevo, el script debe fallar fuerte en vez de
# copiar mal en silencio.
RE_FROM = re.compile(r"from '([^']+)'")

REESCRITURAS = {
    '@/utils/calculosHato': './calculos-hato.ts',
    '@/utils/importHato/overridesChapeta': './importHato/overridesChapeta.ts',
}


def reescribir_import(spec: str) -> str:
    if spec in REESCRITURAS:
        return REESCRITURAS[spec]
    raise ValueError(
        f"hatoAlertas.ts: especificador de import no reconocido para reescritura Deno: {spec!r}. "
        "Este generador solo sabe traducir los imports listados en REESCRITURAS -- si agregaste "
        "un import nuevo a src/utils/hatoAlertas.ts, enséñale la regla aquí antes de regenerar."
    )


def reescribir_contenido(contenido: str) -> str:
    def repl(m: 're.Match[str]') -> str:
        return f"from '{reescribir_import(m.group(1))}'"
    return RE_FROM.sub(repl, contenido)


def encabezado(destino_rel: str) -> str:
    return f"""// ARCHIVO: {destino_rel}
// GENERADO por docs/hato/regenerar-copias-hato-alertas.py -- NUNCA edites este
// archivo a mano. Editá `src/utils/hatoAlertas.ts` y volvé a correr el script.
//
// POR QUÉ EXISTE ESTE DUPLICADO: el tick de alertas (`POST
// .../hato/alertas/tick`, `hato-alertas-tick.ts`) corre en el árbol de
// despliegue de la edge function y no puede importar desde `src/utils/` --
// cruzaría la frontera del árbol de despliegue de Deno. Misma restricción
// que ya produjo `calculos-hato.ts`/`priorizacion-scouting.ts` y las copias
// de `importHato/`.
//
// Contenido idéntico al original salvo los especificadores de import
// (reescritos para Deno: `@/utils/calculosHato` -> `./calculos-hato.ts`,
// `@/utils/importHato/overridesChapeta` -> `./importHato/overridesChapeta.ts`).
// `src/__tests__/hatoAlertasParidadServidor.test.ts` corre este mismo script
// en modo `--check` y falla si alguien hand-editó esta copia.

"""


def generar_todo() -> dict:
    with open(ORIGEN, encoding='utf-8') as fh:
        original = fh.read()
    reescrito = reescribir_contenido(original)
    return {destino: encabezado(destino) + reescrito for destino in DESTINOS}


def modo_check(salida: dict) -> int:
    diffs = []
    for rel, contenido in salida.items():
        ruta = os.path.join(ROOT, rel)
        if not os.path.exists(ruta):
            diffs.append(f'FALTA {rel} (correr sin --check para generarlo)')
            continue
        with open(ruta, encoding='utf-8') as fh:
            actual = fh.read()
        if actual != contenido:
            diffs.append(f'DESINCRONIZADO {rel} -- no coincide con lo que generaría el script ahora mismo')
    if diffs:
        print('Copias Deno de hatoAlertas desincronizadas del generador:', file=sys.stderr)
        for d in diffs:
            print(f'  - {d}', file=sys.stderr)
        print('\nCorré `python3 docs/hato/regenerar-copias-hato-alertas.py` (sin --check) y volvé a intentar.', file=sys.stderr)
        return 1
    print(f'OK: {len(salida)} copias al día con el generador.')
    return 0


def modo_escribir(salida: dict) -> int:
    for rel, contenido in salida.items():
        ruta = os.path.join(ROOT, rel)
        os.makedirs(os.path.dirname(ruta), exist_ok=True)
        with open(ruta, 'w', encoding='utf-8') as fh:
            fh.write(contenido)
        print(f'escrito {rel} ({len(contenido)} bytes)')
    return 0


def main() -> int:
    check = '--check' in sys.argv[1:]
    salida = generar_todo()
    return modo_check(salida) if check else modo_escribir(salida)


if __name__ == '__main__':
    sys.exit(main())
