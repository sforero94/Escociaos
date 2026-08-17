#!/usr/bin/env bash
# Regenera las copias Deno de los módulos del motor de acciones recomendadas.
#
# `src/utils/acciones*.ts` es LA FUENTE. Las copias de
# `src/supabase/functions/server/` y `supabase/functions/make-server-1ccce916/`
# son artefactos: se regeneran, nunca se editan a mano.
#
# La única diferencia entre fuente y copia son las rutas de import: Deno exige
# extensión `.ts` explícita y el árbol del servidor usa kebab-case. Si algún día
# la copia necesita divergir en algo más que eso, es señal de que el módulo no
# debía estar espejado.
#
# Precedente: docs/hato/regenerar-copias-importhato.py
#
#   bash docs/acciones/regenerar-copias-acciones.sh
#
# Los tests `acciones*Paridad.test.ts` fallan si alguien edita una copia y no
# vuelve a correr esto.
set -euo pipefail

RAIZ="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
FUENTE="$RAIZ/src/utils"
SERVER="$RAIZ/src/supabase/functions/server"
ESPEJO="$RAIZ/supabase/functions/make-server-1ccce916"

MODULOS=(accionesTipos accionesValidador accionesOrden accionesRender accionesHechos)

kebab() {
  # accionesTipos -> acciones-tipos
  echo "$1" | sed -E 's/^acciones/acciones-/' | tr '[:upper:]' '[:lower:]'
}

for modulo in "${MODULOS[@]}"; do
  origen="$FUENTE/$modulo.ts"
  [ -f "$origen" ] || { echo "  · $modulo.ts todavía no existe, se omite"; continue; }

  destino="$SERVER/$(kebab "$modulo").ts"

  # Reescribe los imports relativos entre módulos del motor.
  sed_args=()
  for otro in "${MODULOS[@]}"; do
    sed_args+=(-e "s|from '\./$otro'|from './$(kebab "$otro").ts'|g")
    sed_args+=(-e "s|from \"\./$otro\"|from \"./$(kebab "$otro").ts\"|g")
  done

  sed "${sed_args[@]}" "$origen" > "$destino"
  cp "$destino" "$ESPEJO/$(kebab "$modulo").ts"
  echo "  ✓ $modulo.ts → $(kebab "$modulo").ts (server + espejo)"
done

echo "Listo. Corre 'npx vitest run src/__tests__/acciones' para confirmar paridad."
