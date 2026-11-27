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
//
// UI rework de Producción (2026-08-06, `Registrar` de
// `/hato-lechero/produccion`): tercera opción OPCIONAL "Ingresar a mano"
// (`onManual`) -- no abre ningún `<input type="file">`, solo dispara el
// callback. Decisión del dueño: el ingreso manual no se elimina, baja a ser
// la tercera opción de este MISMO desplegable en vez de escribirse aparte.
// `onManual` es opcional a propósito -- los otros dos consumidores
// (chequeo, liquidación) no lo pasan y siguen viendo el menú de dos
// opciones de siempre.
//
// ESCO-190 (2026-11-27): opción OPCIONAL "Subir foto" (`labelOpcionGaleria`).
// "Tomar foto" lleva `capture`, así que en el celular abre la cámara y NO
// deja elegir una foto ya tomada. En el chequeo "Subir archivo" solo acepta
// `.xlsx`, así que tampoco había forma de subir la foto de una página que ya
// estaba en la galería. Cuando se pasa `labelOpcionGaleria`, aparece un ítem
// con un input `accept="image/*"` SIN `capture` (la galería), y lo elegido
// entra por el mismo `onFotos`. Pesaje y liquidación no la necesitan: su
// "Subir archivo" ya acepta imágenes.

import { useRef } from 'react';
import { Camera, Upload, ChevronDown, Pencil, Image as ImageIcon } from 'lucide-react';
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
  /** Tercera opción OPCIONAL del desplegable: "Ingresar a mano". Cuando se
   * pasa, aparece como tercer ítem y NO abre ningún selector de archivo --
   * solo dispara este callback (quien consume decide qué hacer, p. ej.
   * abrir el mismo diálogo de revisión pero con la grilla en blanco). */
  onManual?: () => void;
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
  labelOpcionManual?: string;
  /** Opción OPCIONAL "Subir foto": elegir de la galería una foto ya tomada.
   * Cuando se pasa, aparece como segundo ítem; lo elegido entra por
   * `onFotos`, igual que "Tomar foto". Solo hace falta cuando
   * `acceptArchivo` no acepta imágenes (el chequeo, que es `.xlsx`). */
  labelOpcionGaleria?: string;
  className?: string;
}

export function CapturaArchivo({
  onFotos,
  onArchivo,
  onManual,
  acceptArchivo,
  multipleFotos = true,
  multipleArchivo = false,
  disabled = false,
  label = 'Cargar archivo',
  labelOpcionFoto = 'Tomar foto',
  labelOpcionArchivo = 'Subir archivo',
  labelOpcionManual = 'Ingresar a mano',
  labelOpcionGaleria,
  className,
}: CapturaArchivoProps) {
  const fotoInputRef = useRef<HTMLInputElement>(null);
  const archivoInputRef = useRef<HTMLInputElement>(null);
  const galeriaInputRef = useRef<HTMLInputElement>(null);

  return (
    <>
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button type="button" variant="outline" disabled={disabled} className={className}>
            <Upload className="w-4 h-4 mr-2" />
            {label}
            {/* Sin margen propio -- el `gap-2` del `Button` ya separa los hijos. */}
            <ChevronDown className="w-4 h-4" />
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="start">
          <DropdownMenuItem onClick={() => fotoInputRef.current?.click()}>
            <Camera className="w-4 h-4" />
            {labelOpcionFoto}
          </DropdownMenuItem>
          {labelOpcionGaleria && (
            <DropdownMenuItem onClick={() => galeriaInputRef.current?.click()}>
              <ImageIcon className="w-4 h-4" />
              {labelOpcionGaleria}
            </DropdownMenuItem>
          )}
          <DropdownMenuItem onClick={() => archivoInputRef.current?.click()}>
            <Upload className="w-4 h-4" />
            {labelOpcionArchivo}
          </DropdownMenuItem>
          {onManual && (
            <DropdownMenuItem onClick={onManual}>
              <Pencil className="w-4 h-4" />
              {labelOpcionManual}
            </DropdownMenuItem>
          )}
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
      {/* Galería: `image/*` SIN `capture`, para elegir una foto ya tomada. */}
      {labelOpcionGaleria && (
        <input
          ref={galeriaInputRef}
          type="file"
          accept="image/*"
          multiple={multipleFotos}
          className="hidden"
          onChange={(e) => {
            const files = Array.from(e.target.files ?? []);
            if (files.length > 0) onFotos(files);
            e.target.value = '';
          }}
        />
      )}
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
