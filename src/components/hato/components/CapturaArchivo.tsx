// ARCHIVO: components/hato/components/CapturaArchivo.tsx
// DESCRIPCIÓN: Componente compartido de captura foto/archivo (D-8, plan
// `docs/plan_hato_ronda_agosto_2026.md` S2, T2/§4 "componente de captura
// compartido"). Un solo botón que abre un dropdown con DOS opciones:
//
//   - "Tomar foto"    -> input oculto `accept="image/*" capture="environment"`,
//                        para que en celular abra la cámara TRASERA directo.
//   - "Subir archivo" -> input oculto normal, tipo restringido por
//                        `acceptArchivo` (cada flujo pasa el suyo -- nunca
//                        un default genérico).
//
// Los TRES flujos de carga del módulo son "foto primero, archivo como
// fallback" (D-8): chequeo veterinario (S4/Fase 3b, consumidor #1 --
// `SubirChequeoExcel.tsx`), liquidación quincenal del Pomar (S4 de la ronda
// agosto 2026) y planilla de pesaje (S5). Un solo componente evita que cada
// flujo reinvente el mismo par de botones sueltos -- Santiago lo pidió
// explícitamente: "solo uno para cargar chequeo que abra un dropdown".
//
// Este componente SOLO resuelve la selección de archivos (el disparador +
// los dos `<input type="file">` ocultos). Qué hacer con lo elegido (drag &
// drop adicional, previsualización, acumulación de páginas, límites de
// cantidad) sigue siendo responsabilidad de quien lo consume -- mismo
// reparto que ya tenía `SubirChequeoExcel.tsx` antes de esta sesión.

import { useRef } from 'react';
import { Camera, Upload, ChevronDown } from 'lucide-react';
import { Button } from '@/components/ui/button';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';

export interface CapturaArchivoProps {
  /** Archivos elegidos por "Tomar foto" -- SIEMPRE `image/*` con
   * `capture="environment"`, nunca configurable: es lo que hace que el
   * celular abra la cámara trasera en vez de la galería. */
  onFotos: (files: File[]) => void;
  /** Archivos elegidos por "Subir archivo". El tipo lo decide cada flujo
   * consumidor (`.xlsx` para chequeo, imagen/PDF para liquidación...). */
  onArchivo: (files: File[]) => void;
  /** MIME/extensiones que acepta "Subir archivo" (ej. `.xlsx,.xls`). */
  acceptArchivo: string;
  /** La cámara del celular entrega una foto a la vez -- por defecto se
   * permite elegir varias de una (galería) o repetir la acción página a
   * página; el flujo consumidor decide si acumula. */
  multipleFotos?: boolean;
  multipleArchivo?: boolean;
  disabled?: boolean;
  /** Texto del botón disparador. */
  label?: string;
  labelOpcionFoto?: string;
  labelOpcionArchivo?: string;
  className?: string;
}

export function CapturaArchivo({
  onFotos,
  onArchivo,
  acceptArchivo,
  multipleFotos = true,
  multipleArchivo = false,
  disabled = false,
  label = 'Cargar archivo',
  labelOpcionFoto = 'Tomar foto',
  labelOpcionArchivo = 'Subir archivo',
  className,
}: CapturaArchivoProps) {
  const fotoInputRef = useRef<HTMLInputElement>(null);
  const archivoInputRef = useRef<HTMLInputElement>(null);

  return (
    <>
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button type="button" variant="outline" disabled={disabled} className={className}>
            <Upload className="w-4 h-4 mr-2" />
            {label}
            {/* Sin margen propio -- el `gap-2` del `Button` ya separa los
                hijos; `ml-1.5` no existe en el build congelado de Tailwind
                (`src/index.css`) y no habría hecho nada. */}
            <ChevronDown className="w-4 h-4" />
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="start">
          <DropdownMenuItem onClick={() => fotoInputRef.current?.click()}>
            <Camera className="w-4 h-4" />
            {labelOpcionFoto}
          </DropdownMenuItem>
          <DropdownMenuItem onClick={() => archivoInputRef.current?.click()}>
            <Upload className="w-4 h-4" />
            {labelOpcionArchivo}
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>

      {/* `capture="environment"` es lo que abre la cámara TRASERA directo en
          celular en vez de dejar elegir cámara/galería -- D-8 es explícito
          en esto para los tres flujos. */}
      <input
        ref={fotoInputRef}
        type="file"
        accept="image/*"
        capture="environment"
        multiple={multipleFotos}
        className="hidden"
        onChange={(e) => {
          const files = Array.from(e.target.files ?? []);
          if (files.length > 0) onFotos(files);
          // Permite volver a elegir el/los MISMOS archivos tras descartarlos.
          e.target.value = '';
        }}
      />
      <input
        ref={archivoInputRef}
        type="file"
        accept={acceptArchivo}
        multiple={multipleArchivo}
        className="hidden"
        onChange={(e) => {
          const files = Array.from(e.target.files ?? []);
          if (files.length > 0) onArchivo(files);
          e.target.value = '';
        }}
      />
    </>
  );
}
