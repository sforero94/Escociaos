#!/usr/bin/env python3
"""Regenera las copias Deno-side del pipeline `src/utils/importHato/` que
necesita el endpoint B0/V10 (`POST .../hato/chequeo/preview`).

A diferencia de `regenerar-copias-servidor.py` (que copia `calculosHato.ts`
BYTE A BYTE porque ese motor no tiene imports), estos módulos SÍ importan
entre sí y desde `@/utils/calculosHato` -- así que la copia no puede ser
byte-idéntica. Lo que este script garantiza en cambio es que el CONTENIDO es
idéntico salvo por los especificadores de import, que se reescriben de forma
determinística para Deno:

    '@/utils/calculosHato'  ->  '../calculos-hato.ts'   (sube un nivel: las
                                 copias viven en <server>/importHato/, el
                                 motor puro vive en <server>/calculos-hato.ts)
    './xxx'                 ->  './xxx.ts'              (Deno exige extensión
                                 explícita en imports relativos; Vite no)

Uso:
    python3 docs/hato/regenerar-copias-importhato.py            # escribe
    python3 docs/hato/regenerar-copias-importhato.py --check     # solo verifica

`--check` NO escribe nada: regenera en memoria y compara contra lo que ya
está en el árbol. Sale con código 1 y una lista de diffs si algo no coincide
-- lo usa `src/__tests__/importHatoParidadServidor.test.ts` para que un
hand-edit de una copia (en vez de una edición del original + regenerar)
rompa la suite, en vez de desincronizarse en silencio.

NUNCA edites a mano un archivo bajo `src/supabase/functions/server/importHato/`
o `supabase/functions/make-server-1ccce916/importHato/`: edita el original en
`src/utils/importHato/` y vuelve a correr este script.
"""
import os
import re
import sys

ROOT = os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
ORIGEN_DIR = os.path.join(ROOT, 'src/utils/importHato')

# Los 11 módulos que el endpoint necesita en tiempo de ejecución: los 8 de
# Extract+Normalize (contrato docs/hato/s3-contrato-pipeline.md) más
# `overridesChapeta.ts` y `diffChequeo.ts`, que el diff de B0/V10 importa
# directamente, más `commitChequeo.ts` (commit path B0/V10 -- el paso
# "Aprobar", `hato-chequeo-commit.ts`). Orden = orden de dependencia, solo
# por legibilidad del log.
MODULOS = [
    'tipos.ts',
    'celdas.ts',
    'grilla.ts',
    'parseToro.ts',
    'chequeos.ts',
    'terneras.ts',
    'dedupe.ts',
    'normalizar.ts',
    'overridesChapeta.ts',
    'diffChequeo.ts',
    'commitChequeo.ts',
]

DESTINOS = [
    'src/supabase/functions/server/importHato',
    'supabase/functions/make-server-1ccce916/importHato',
]

# Cualquier línea `import`/`export ... from '...'` en estos 10 archivos usa
# EXACTAMENTE uno de estos dos especificadores (verificado a mano al escribir
# este script -- ver el reporte de la sesión). Si alguien agrega un import
# `npm:`/`https:`/otro paquete a uno de estos archivos, el script debe
# fallar fuerte en vez de mirar-y-copiar mal.
RE_FROM = re.compile(r"from '([^']+)'")


def reescribir_import(spec: str, archivo: str) -> str:
    if spec == '@/utils/calculosHato':
        return '../calculos-hato.ts'
    if spec.startswith('./'):
        return spec + '.ts'
    raise ValueError(
        f"{archivo}: especificador de import no reconocido para reescritura Deno: {spec!r}. "
        "Este generador solo sabe traducir '@/utils/calculosHato' y imports relativos "
        "'./xxx' -- si agregaste un import nuevo, enséñale la regla aquí antes de regenerar."
    )


def reescribir_contenido(contenido: str, archivo: str) -> str:
    def repl(m: 're.Match[str]') -> str:
        nuevo = reescribir_import(m.group(1), archivo)
        return f"from '{nuevo}'"
    return RE_FROM.sub(repl, contenido)


def encabezado(nombre_modulo: str, destino_rel: str) -> str:
    origen_rel = f'src/utils/importHato/{nombre_modulo}'
    return f"""// ARCHIVO: {destino_rel}
// GENERADO por docs/hato/regenerar-copias-importhato.py -- NUNCA edites este
// archivo a mano. Editá `{origen_rel}` y volvé a correr el script.
//
// POR QUÉ EXISTE ESTE DUPLICADO: el endpoint B0/V10 (`POST
// .../hato/chequeo/preview`, `hato-chequeo-preview.ts`) corre en el árbol de
// despliegue de la edge function y no puede importar desde `src/utils/` --
// cruzaría la frontera del árbol de despliegue de Deno. Misma restricción
// que ya produjo `priorizacion-scouting.ts` y `calculos-hato.ts`.
//
// Contenido idéntico al original salvo los especificadores de import
// (reescritos para Deno: `@/utils/calculosHato` -> `../calculos-hato.ts`,
// `./xxx` -> `./xxx.ts`). `src/__tests__/importHatoParidadServidor.test.ts`
// corre este mismo script en modo `--check` y falla si alguien hand-editó
// una copia en vez de regenerarla.

"""


def generar_todo() -> dict:
    """Devuelve {ruta_relativa: contenido} para las 2*10 copias."""
    salida = {}
    for modulo in MODULOS:
        origen = os.path.join(ORIGEN_DIR, modulo)
        with open(origen, encoding='utf-8') as fh:
            original = fh.read()
        for destino_dir in DESTINOS:
            destino_rel = f'{destino_dir}/{modulo}'
            reescrito = reescribir_contenido(original, f'src/utils/importHato/{modulo}')
            salida[destino_rel] = encabezado(modulo, destino_rel) + reescrito
    return salida


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
        print('Copias Deno de importHato desincronizadas del generador:', file=sys.stderr)
        for d in diffs:
            print(f'  - {d}', file=sys.stderr)
        print('\nCorré `python3 docs/hato/regenerar-copias-importhato.py` (sin --check) y volvé a intentar.', file=sys.stderr)
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
