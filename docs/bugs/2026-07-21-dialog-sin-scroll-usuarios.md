# Bug: El diálogo "Editar Usuario" recorta su contenido y no permite scroll

**Date:** 2026-07-21
**Severity:** High — bloquea completamente la edición de usuarios (los botones Guardar/Cancelar son inalcanzables)
**Status:** Fixed

## Symptom

En Configuración → Usuarios, al abrir el modal "Nuevo Usuario" o "Editar Usuario":

- El panel del diálogo se dibuja con una altura fija y el contenido del formulario se corta a media fila ("Usuario activo" queda partido por la mitad).
- No aparece barra de scroll y la rueda del mouse / trackpad no desplaza el contenido.
- La fila de botones (Cancelar / Guardar Cambios) queda fuera del área visible, por lo que **el formulario no se puede enviar con el mouse**. La única salida es la X de cerrar.

No es un problema de datos ni de red: el formulario se renderiza correctamente, simplemente está clipeado.

## Reproduction path

1. Login como Gerencia → `/configuracion` → pestaña **Usuarios**.
2. Click en el botón editar de cualquier usuario (o "Nuevo Usuario").
3. `UsuariosConfig.tsx:367` monta `<Dialog>` → `<DialogContent size="md">` (línea 368).
4. `DialogContent` (`src/components/ui/dialog.tsx:74-89`) aplica `flex flex-col` + `overflow-hidden` + la clase de tier `dialog-md`.
5. `.dialog-md` (`src/styles/globals.css:285`) fija `max-height: min(32rem, calc(100dvh - 2rem))` → **512 px** en desktop.
6. El hijo directo es `<form className="space-y-4">` (línea 381), un flex item sin `flex-1`, sin `min-h-0` y sin `overflow-y-auto`.

**Altura requerida vs. disponible** (modo editar, desktop):

| Bloque | Alto aprox. |
|---|---|
| padding `p-6` (arriba + abajo) | 48 px |
| `DialogHeader` (título + descripción) | 48 px |
| `gap-4` header↔form | 16 px |
| Nombre Completo | 56 px |
| Email (+ nota "El email no se puede modificar") | 76 px |
| Rol | 60 px |
| **Módulos de acceso (4 checkboxes)** | **132 px** |
| Clave | 56 px |
| Usuario activo | 20 px |
| Botones (`pt-4` + fila) | 52 px |
| 6 × `space-y-4` | 96 px |
| **Total** | **≈ 660 px** |

660 px de contenido dentro de un contenedor de 512 px con `overflow-hidden` ⇒ ~148 px recortados, exactamente donde el screenshot corta.

## Hypotheses evaluated

| Hypothesis | Status | Evidence |
|---|---|---|
| El contenido del formulario no está envuelto en `DialogBody`, así que no hay región scrolleable y `overflow-hidden` del padre lo recorta | **Confirmed root cause** | `UsuariosConfig.tsx:381` usa `<form className="space-y-4">` como hijo directo; `grep 'overflow-y-auto'` dentro del bloque 368–533 → 0 coincidencias. `DialogContent` fuerza `overflow-hidden` (`dialog.tsx:77`). Contradice la regla explícita de CLAUDE.md ("scrollable content MUST go inside `<DialogBody>`") |
| El flex item podría encogerse y mostrar scroll propio | **Ruled out** | En `flex-direction: column` los ítems tienen `min-height: auto` por defecto: el `<form>` no puede encogerse por debajo de su altura de contenido. Sin `min-h-0` no cede, y sin `overflow-y-auto` no scrollea |
| Tier de tamaño mal elegido (`md` demasiado pequeño) | **Contributing, not root** | Subir a `lg` (640 px) daría margen hoy pero volvería a romperse con un campo más o en pantallas bajas; `dialog-viewport-cap` reduce la altura aún más en viewports pequeños. No corrige la falta de scroll |
| Regresión introducida por el bloque "Módulos de acceso" | **Confirmed trigger** | `git log` → `4690945 feat(nav): grouped sidebar + per-user module access control` agregó los 4 checkboxes (~132 px). El defecto estructural ya existía desde `385c30f` ("Enforce fixed-size dialog tiers"), pero antes el contenido cabía por poco |
| Overlay de Radix bloqueando el scroll (scroll-lock del body) | **Ruled out** | El scroll-lock de Radix afecta al `body`, no al panel. El panel simplemente no tiene región scrolleable propia |
| `DialogPrimitive.Close` absoluto tapando el contenido | **Ruled out** | Es `position: absolute`, fuera del flujo; no afecta el cálculo de altura |
| Bug exclusivo de este diálogo | **Ruled out — el defecto es sistémico** | 8 diálogos en 6 archivos tienen la misma estructura (hijo directo `space-y-4` sin `DialogBody` ni scroll propio). Ver Impact |

## Root cause

`UsuariosConfig` monta el `<form>` como hijo directo de `DialogContent`. `DialogContent` es un contenedor `flex flex-col` con `overflow-hidden` y altura máxima fija por tier (512 px para `md`). El formulario, al no estar envuelto en `DialogBody` (que aporta `flex-1 overflow-y-auto min-h-0`), conserva su altura natural (~660 px), desborda el contenedor y es recortado sin barra de scroll. El bloque "Módulos de acceso" añadido en `4690945` fue lo que empujó el formulario por encima del límite y volvió visible un defecto estructural preexistente.

## Impact

**Diálogos con el mismo defecto** (hijo directo `space-y-4`, sin `DialogBody` ni región scrolleable):

| Archivo | Líneas | Tier | Riesgo |
|---|---|---|---|
| `src/components/configuracion/UsuariosConfig.tsx` | 368–533 | `md` (512 px) | **Roto — reportado** |
| `src/components/configuracion/TelegramConfig.tsx` (crear/editar) | 433–552 | `sm` (384 px) | **Roto** — formulario largo en el tier más pequeño |
| `src/components/finanzas/components/ProveedoresConfig.tsx` | 356–439 | `sm` | **Roto probable** |
| `src/components/finanzas/components/CompradoresConfig.tsx` | 347–420 | `sm` | **Roto probable** |
| `src/components/monitoreo/RegistroColmenas.tsx` | 128–247 | `sm` | **Roto probable** |
| `src/components/finanzas/components/MediosPagoConfig.tsx` | 331–393 | `sm` | En el límite |
| `src/components/configuracion/TelegramConfig.tsx` (código acceso) | 557–593 | `sm` | En el límite |
| `src/components/monitoreo/ConfigApiarios.tsx` | 236–290 | `sm` | En el límite |

**No afectados:** `RegistroConductividad.tsx` (tiene su propia región `flex-1 overflow-y-auto min-h-0`) y `ui/command.tsx` (cmdk gestiona su propio scroll).

**Riesgo de regresión del fix:**
- Mover los botones a `DialogFooter` cambia el layout de `flex gap-3` a `flex-col-reverse … sm:flex-row sm:justify-end`. Para conservar los botones al 50/50 hay que pasar `className` explícito al footer.
- `DialogBody` aplica `-mx-6 px-6` para compensar el padding del padre. Si el `<form>` queda entre `DialogContent` y `DialogBody`, el form no debe introducir padding propio, o la compensación se desalinea.
- El `<form>` debe seguir envolviendo **ambos** (campos y botones) para que `type="submit"` siga disparando `onSubmit`.
- `DialogTitle` / `DialogDescription` de Radix se comunican por contexto, no por posición en el DOM, así que reordenar no rompe la accesibilidad.

## Fix plan

**1. Reestructurar el diálogo de `UsuariosConfig` según el contrato de CLAUDE.md**

```tsx
<DialogContent size="md">
  <DialogHeader>…</DialogHeader>

  <form onSubmit={handleSubmit} className="flex flex-col flex-1 min-h-0 gap-4">
    <DialogBody className="space-y-4">
      {/* FormDraftBanner + Nombre + Email + Rol + Módulos + Clave + Activo */}
    </DialogBody>

    <DialogFooter className="flex-row gap-3">
      <Button type="button" variant="outline" className="flex-1">Cancelar</Button>
      <Button type="submit" className="flex-1 …">Guardar Cambios</Button>
    </DialogFooter>
  </form>
</DialogContent>
```

- El `<form>` toma `flex-1 min-h-0` para ceder altura; `DialogBody` scrollea; `DialogFooter` queda anclado y siempre visible.
- Se quita el `pt-4` del contenedor de botones (el `gap-4` del form ya lo cubre).

**2. Aplicar la misma reestructuración a los 7 diálogos restantes de la tabla de Impact.**

**3. Guard de regresión** — test en `src/__tests__/dialogBodyUsage.test.ts` que lee los fuentes `.tsx` y falla si un `<DialogContent>` contiene contenido sin `DialogBody` ni una región `overflow-y-auto` propia (allowlist explícita para `ui/command.tsx` y `RegistroConductividad.tsx`). Evita que el defecto vuelva a colarse — es exactamente el patrón que ya se documentó en CLAUDE.md pero que nada verificaba.

## Hallazgo durante la implementación: `min-h-0` era una clase muerta

`src/index.css` es un build de Tailwind congelado y **`.min-h-0` no existe en él** — cualquier
`className="min-h-0"` del código era un no-op silencioso (igual que `flex-row` sin prefijo; solo
existen `sm:flex-row` / `md:flex-row`).

Esto importa porque envolver los campos en `DialogBody` **no basta por sí solo** cuando hay un
`<form>` intermedio: sin `min-height: 0` el form conserva su altura de contenido y el panel lo
recorta igual. Medido en un harness con el CSS real del repo, panel fijado a 512 px:

| Estructura | `scrollHeight` del body | Borde inferior del botón Guardar | ¿Visible? |
|---|---|---|---|
| Antes (form hijo directo) | — (form de 574 px, no scrollea) | 671 px | **No** — 159 px fuera del panel |
| DialogBody **sin** `.min-h-0` | — | 653 px | **No** — el fix no surte efecto |
| DialogBody **con** `.min-h-0` | 500 px vs 280 px visibles → scrollea | 433 px | **Sí** |
| DialogBody hijo directo (sin form) | 500 px vs 280 px visibles → scrollea | 433 px | **Sí** |

Por eso se agregó `.min-h-0 { min-height: 0 }` como regla real en `globals.css`. Las otras 5
apariciones de la clase en el código están sobre contenedores que ya son scroll containers
(`overflow-y-auto`), donde el mínimo automático ya resuelve a 0 — para ellas la regla es un no-op,
así que no hay riesgo de regresión.

## Tests

- [x] Guard estático: ningún `<DialogContent>` sin `DialogBody` ni scroll propio (salvo allowlist) — `src/__tests__/dialogScrollContract.test.ts`, 3/3 en verde. **Detectó un 9º diálogo** (`IngresoForm.tsx` #2) que el escaneo manual a nivel de archivo había pasado por alto
- [x] Guard estático: todo `<form>` que envuelve `DialogBody` declara `flex-1 min-h-0`
- [x] `npm run typecheck` — sin errores nuevos (queda 1 preexistente en `PurchaseHistory.tsx:354`, verificado también en `main`)
- [x] `npm run lint` — sin errores nuevos (los 6 `no-useless-catch` son preexistentes, en `useProduccionData.ts`)
- [x] `npm test` — 486/487. El único fallo (`reporteSemanal.test.ts:785`) es preexistente, confirmado ejecutando la suite con los cambios stasheados
- [x] Verificación del mecanismo CSS en navegador con `index.css` + `globals.css` reales (tabla de arriba)
- [ ] Manual en la app: Configuración → Usuarios → Editar — no ejecutable en este entorno (falta `.env.local`, la app lanza al arrancar sin las vars de Supabase)
- [ ] Manual en la app (regresión): Configuración → Telegram, Finanzas → Proveedores / Compradores / Medios de Pago / Ingresos, Monitoreo → Colmenas / Apiarios
- [ ] Manual: viewport móvil — en `flex-col-reverse` el botón de submit queda arriba; confirmar que es el orden deseado
