#!/usr/bin/env python3
"""Regenera las copias Deno-side de `src/utils/rondaInventario/` que necesita
el pipeline de voz de la ronda de inventario (Fase 1 de
docs/brief_tecnico_verificacion_inventario.md §5.6, endpoints de una fase
posterior: `ronda-voz-pipeline.ts`, `ronda-inventario-tick.ts`).

Clonado de `docs/hato/regenerar-copias-importhato.py` -- MISMA reescritura
determinista de especificadores de import, con una diferencia real: ninguno
de los cuatro módulos de `rondaInventario/` importa `@/utils/calculosHato`
ni ningún otro `@/utils/*` (a propósito -- ver la cabecera de `preview.ts` y
`reporteCierre.ts`: ambos reimplementan un formateador colombiano local en
vez de importar `@/utils/format`, precisamente para no necesitar un segundo
caso especial acá). Así que este generador sólo reescribe imports relativos
`./xxx` -> `./xxx.ts` (Deno exige extensión explícita; Vite no). Si algún
día un módulo de `rondaInventario/` agrega un import `@/utils/...`, este
script debe fallar fuerte -- ver `reescribir_import` -- en vez de copiar mal
en silencio; enseñarle la regla nueva es una decisión aparte, no algo que
deba pasar inadvertido.

Uso:
    python3 docs/inventario/regenerar-copias-ronda-inventario.py            # escribe
    python3 docs/inventario/regenerar-copias-ronda-inventario.py --check     # solo verifica

`--check` NO escribe nada: regenera en memoria y compara contra lo que ya
está en el árbol. Sale con código 1 y una lista de diffs si algo no coincide
-- lo usa `src/__tests__/rondaInventarioParidadServidor.test.ts` para que un
hand-edit de una copia (en vez de una edición del original + regenerar)
rompa la suite, en vez de desincronizarse en silencio.

NUNCA edites a mano un archivo bajo
`src/supabase/functions/server/rondaInventario/` o
`supabase/functions/make-server-1ccce916/rondaInventario/`: edita el
original en `src/utils/rondaInventario/` y vuelve a correr este script.
"""
import os
import re
import sys

ROOT = os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
ORIGEN_DIR = os.path.join(ROOT, 'src/utils/rondaInventario')

# Orden de dependencia, solo por legibilidad del log: causasRaiz.ts no
# importa nada propio; interpretarNota.ts y preview.ts importan de
# causasRaiz.ts (y preview.ts además de interpretarNota.ts, sólo tipos);
# reporteCierre.ts importa de causasRaiz.ts.
#
# Fase 3 (Telegram, Uriel) agrega dos módulos:
#   - resolverHallazgos.ts: orquesta resolverProducto/derivarFisico/derivarVia
#     (interpretarNota.ts) en una FilaPreview (preview.ts) -- el handler de
#     voz de Telegram lo necesita dos veces (nota inicial + cada corrección).
#   - alcanceTxt.ts: el .txt del alcance que se manda al abrir la ronda. No
#     depende de los otros tres -- reimplementa su propio formateador local,
#     mismo criterio que preview.ts/reporteCierre.ts (ver su cabecera).
#
# Fase 4 (Telegram, David y Santiago) agrega un módulo más:
#   - resolucion.ts: mensajes puros para /explicar, /proponer y /aprobar
#     (B-1/B-2/B-5/B-6/B-7) -- importa causaPorIndice/indiceDeCausa de
#     causasRaiz.ts (mismo criterio de un solo dueño del catálogo que ya
#     seguían interpretarNota.ts/preview.ts).
#
# Fase 5 (recordatorio, alerta del día 15, reporte de cierre) agrega:
#   - tick.ts: lógica pura de los CUATRO trabajos del tick diario
#     (ronda-inventario-tick.ts, de la misma fase) -- claves de idempotencia
#     de rondas_avisos, las tres condiciones de envío, la clasificación de
#     movimientos con la ronda abierta (P-3), el cálculo del valor de
#     inventario y el texto del mensaje del día 15. No importa nada propio
#     (mismo criterio que causasRaiz.ts: cero dependencias dentro del
#     directorio, para que el generador no tenga que resolver un import
#     transitivo nuevo).
MODULOS = [
    'causasRaiz.ts',
    'interpretarNota.ts',
    'preview.ts',
    'resolverHallazgos.ts',
    'alcanceTxt.ts',
    'reporteCierre.ts',
    'resolucion.ts',
    'tick.ts',
]

DESTINOS = [
    'src/supabase/functions/server/rondaInventario',
    'supabase/functions/make-server-1ccce916/rondaInventario',
]

# Cualquier línea `import`/`export ... from '...'` en estos 4 archivos usa
# EXCLUSIVAMENTE especificadores relativos `./xxx` (verificado a mano al
# escribir este script). Si alguien agrega un import `npm:`/`https:`/
# `@/utils/...` a uno de estos archivos, el script debe fallar fuerte en vez
# de mirar-y-copiar mal.
RE_FROM = re.compile(r"from '([^']+)'")


def reescribir_import(spec: str, archivo: str) -> str:
    if spec.startswith('./'):
        return spec + '.ts'
    raise ValueError(
        f"{archivo}: especificador de import no reconocido para reescritura Deno: {spec!r}. "
        "Este generador solo sabe traducir imports relativos './xxx' -- si agregaste un "
        "import nuevo (p. ej. '@/utils/format'), enséñale la regla aquí antes de regenerar, "
        "y confirmá que existe una copia Deno-side de ese módulo en los dos árboles de "
        "destino (no hay ninguna hoy para @/utils/format, precedente acciones-hechos.ts: "
        "reimplementar el formateador localmente evita este problema)."
    )


def reescribir_contenido(contenido: str, archivo: str) -> str:
    def repl(m: 're.Match[str]') -> str:
        nuevo = reescribir_import(m.group(1), archivo)
        return f"from '{nuevo}'"
    return RE_FROM.sub(repl, contenido)


def encabezado(nombre_modulo: str, destino_rel: str) -> str:
    origen_rel = f'src/utils/rondaInventario/{nombre_modulo}'
    return f"""// ARCHIVO: {destino_rel}
// GENERADO por docs/inventario/regenerar-copias-ronda-inventario.py -- NUNCA
// edites este archivo a mano. Editá `{origen_rel}` y volvé a correr el script.
//
// POR QUÉ EXISTE ESTE DUPLICADO: el pipeline de voz de la ronda de
// inventario (`ronda-voz-pipeline.ts`, `ronda-inventario-tick.ts` -- de una
// fase posterior) corre en el árbol de despliegue de la edge function y no
// puede importar desde `src/utils/` -- cruzaría la frontera del árbol de
// despliegue de Deno. Misma restricción que ya produjo `calculos-hato.ts`,
// `priorizacion-scouting.ts` y `importHato/*`.
//
// Contenido idéntico al original salvo los especificadores de import
// (reescritos para Deno: `./xxx` -> `./xxx.ts`).
// `src/__tests__/rondaInventarioParidadServidor.test.ts` corre este mismo
// script en modo `--check` y falla si alguien hand-editó una copia en vez de
// regenerarla.

"""


def generar_todo() -> dict:
    """Devuelve {ruta_relativa: contenido} para las 2*4 copias."""
    salida = {}
    for modulo in MODULOS:
        origen = os.path.join(ORIGEN_DIR, modulo)
        with open(origen, encoding='utf-8') as fh:
            original = fh.read()
        for destino_dir in DESTINOS:
            destino_rel = f'{destino_dir}/{modulo}'
            reescrito = reescribir_contenido(original, f'src/utils/rondaInventario/{modulo}')
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
        print('Copias Deno de rondaInventario desincronizadas del generador:', file=sys.stderr)
        for d in diffs:
            print(f'  - {d}', file=sys.stderr)
        print('\nCorré `python3 docs/inventario/regenerar-copias-ronda-inventario.py` (sin --check) y volvé a intentar.', file=sys.stderr)
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
