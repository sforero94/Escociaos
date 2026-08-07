"use client";

import * as React from "react";

import { cn } from "./utils";

/**
 * El recurso tabla compartido (docs/sistema-visual.md §3-ter). Un consumidor nuevo lo usa; una
 * tabla que se toque a fondo migra a él. Resuelve los DOS usos reales de la app:
 *
 *  - **Lista** (mayoría de las 46 tablas de hoy): una fila por registro, un dato principal y sus
 *    atributos. `<TableBody striped>` activa el cebreado alterno.
 *  - **Matriz** (mapa de calor de plagas, presupuesto por período): el valor solo significa algo
 *    en el cruce de fila y columna. `<TableHead sticky>`/`<TableCell sticky>` congelan la columna
 *    que identifica la fila (Patrón A, excepción declarada de sistema-visual.md §3-bis) — el
 *    scroll horizontal es legítimo ahí, la columna identificadora no se va con él.
 *
 * El aspecto (contenedor redondeado, encabezado tenue, separadores sutiles) se DERIVÓ del
 * denominador común de las 46 tablas existentes, no se inventó — ver el reporte de la sesión que
 * construyó este archivo. `.tabla-financiera`/`.col-etiqueta` (P&G y Flujo de Caja,
 * `src/components/finanzas/CLAUDE.md`) resuelven el mismo problema de columna congelada con CSS a
 * mano por una razón ya documentada (ancho de columna fijo en rem, jerarquía de filas con 6
 * variantes de fondo) — no se tocan aquí ni se reemplazan por este primitivo.
 */

function Table({ className, ...props }: React.ComponentProps<"table">) {
  return (
    <div
      data-slot="table-container"
      className="rounded-xl border border-gray-200 bg-white overflow-hidden"
    >
      {/* El recorte de esquinas (`overflow-hidden`, arriba) y el scroll horizontal viven en dos
          nodos distintos a propósito: si compartieran uno solo, el fondo del `thead` se saldría
          del radio en el borde donde empieza el scroll — el mismo defecto que tenían varias de
          las 46 tablas que sí separaban los dos nodos por instinto, sin escribirlo. */}
      <div className="overflow-x-auto">
        <table
          data-slot="table"
          className={cn(
            // "Cuerpo" en la escala tipográfica (docs/sistema-visual.md §1): 16px en móvil (se
            // arranca un escalón arriba porque se captura a pleno sol), 14px en escritorio.
            "w-full caption-bottom text-base sm:text-sm",
            className,
          )}
          {...props}
        />
      </div>
    </div>
  );
}

function TableHeader({ className, ...props }: React.ComponentProps<"thead">) {
  return (
    <thead
      data-slot="table-header"
      className={cn("bg-gray-50", className)}
      {...props}
    />
  );
}

interface TableBodyProps extends React.ComponentProps<"tbody"> {
  /** Cebreado alterno vía `nth-child`, nunca `i % 2` recalculado a mano por cada consumidor
   * (era el patrón repetido en las tablas-lista más recientes del módulo Hato). Pensado para
   * "lista"; no probado en combinación con columnas `sticky` de "matriz" (ver limitación en el
   * reporte de migración). */
  striped?: boolean;
}

function TableBody({ className, striped, ...props }: TableBodyProps) {
  return (
    <tbody
      data-slot="table-body"
      className={cn(
        // El separador entre filas vive AQUÍ (vía selector de descendiente), no como default de
        // `TableRow` -- si `TableRow` trajera su propio `border-t`, la fila del `TableHeader`
        // (que también es un `TableRow`) heredaría un borde superior espurio pegado al borde del
        // contenedor. Con el borde puesto en el cuerpo, la fila del encabezado queda limpia y la
        // primera fila de datos dibuja la única línea entre encabezado y cuerpo.
        "[&_tr]:border-t [&_tr]:border-gray-100",
        // Fila par en gris tenue, e IMPAR se queda en el `hover:bg-gray-50` por defecto de
        // `TableRow` -- pero una fila que YA es gris no muestra nada distinto en hover salvo que
        // se le dé un tono más oscuro propio (`hover:bg-gray-100`). Mismo par exacto que ya usaba
        // `ClimaPeriodosTable.tsx` a mano fila por fila.
        striped && "[&_tr:nth-child(even)]:bg-gray-50 [&_tr:nth-child(even):hover]:bg-gray-100",
        className,
      )}
      {...props}
    />
  );
}

function TableFooter({ className, ...props }: React.ComponentProps<"tfoot">) {
  return (
    <tfoot
      data-slot="table-footer"
      className={cn("bg-gray-50 border-t border-gray-200 font-medium", className)}
      {...props}
    />
  );
}

function TableRow({ className, ...props }: React.ComponentProps<"tr">) {
  return (
    <tr
      data-slot="table-row"
      className={cn(
        "hover:bg-gray-50 data-[state=selected]:bg-gray-100 transition-colors",
        className,
      )}
      {...props}
    />
  );
}

interface TableCellVariantProps {
  /** Congela esta columna en scroll horizontal (uso "matriz" — mapa de calor, presupuesto).
   * Necesita fondo propio: sin él, el resto de la fila que sigue desplazándose por debajo se
   * transparenta a través de la celda congelada (mismo problema que resuelve `.col-etiqueta`
   * en globals.css para las tablas financieras). */
  sticky?: boolean;
}

function TableHead({
  className,
  sticky,
  ...props
}: React.ComponentProps<"th"> & TableCellVariantProps) {
  return (
    <th
      data-slot="table-head"
      className={cn(
        // "Metadato" en la escala tipográfica: 14px en móvil, 12px en escritorio.
        "h-11 px-3 text-left align-middle text-sm sm:text-xs font-semibold uppercase tracking-wide text-gray-500 whitespace-nowrap [&:has([role=checkbox])]:pr-0 [&>[role=checkbox]]:translate-y-[2px]",
        sticky && "sticky left-0 z-10 bg-gray-50",
        className,
      )}
      {...props}
    />
  );
}

function TableCell({
  className,
  sticky,
  ...props
}: React.ComponentProps<"td"> & TableCellVariantProps) {
  return (
    <td
      data-slot="table-cell"
      className={cn(
        // `py-3` a los 14/16px de "cuerpo" da ~44-48px de fila: cumple a la vez la densidad de
        // "lista larga" (~45px, docs/sistema-visual.md §2) y el piso táctil de 44px en móvil, sin
        // necesitar dos reglas distintas por breakpoint.
        "px-3 py-3 align-middle whitespace-nowrap [&:has([role=checkbox])]:pr-0 [&>[role=checkbox]]:translate-y-[2px]",
        sticky && "sticky left-0 z-10 bg-white",
        className,
      )}
      {...props}
    />
  );
}

function TableCaption({
  className,
  ...props
}: React.ComponentProps<"caption">) {
  return (
    <caption
      data-slot="table-caption"
      className={cn("text-muted-foreground mt-4 text-sm", className)}
      {...props}
    />
  );
}

export {
  Table,
  TableHeader,
  TableBody,
  TableFooter,
  TableHead,
  TableRow,
  TableCell,
  TableCaption,
};
