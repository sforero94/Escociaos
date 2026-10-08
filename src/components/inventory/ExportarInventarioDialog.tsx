import { useMemo, useState } from 'react';
import { Download, Loader2 } from 'lucide-react';
import { toast } from 'sonner';
import { Button } from '../ui/button';
import { Checkbox } from '../ui/checkbox';
import {
  Dialog,
  DialogBody,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '../ui/dialog';
import { Label } from '../ui/label';
import { Switch } from '../ui/switch';
import { mensajeErrorCargaDiferida } from '@/utils/errorCargaDiferida';
import { formatearFechaHora, obtenerFechaHoy } from '@/utils/fechas';
import {
  alternarCategoria,
  alternarGrupo,
  arbolClasificacion,
  categoriaMarcada,
  construirReporte,
  descargarReporteInventario,
  estadoGrupo,
  productosVisiblesParaExportar,
  type FormatoExportacionInventario,
  type ProductoExportable,
  type SeleccionExportacion,
} from '@/utils/exportarInventario';

interface ExportarInventarioDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  productos: ProductoExportable[];
  /** Misma regla que la lista: oculta `permitido_gerencia === false`. */
  ocultarNoPermitidos: boolean;
}

const SELECCION_INICIAL: SeleccionExportacion = {
  modo: 'todo',
  grupos: [],
  categorias: [],
  incluirCeros: false,
};

export function ExportarInventarioDialog({
  open,
  onOpenChange,
  productos,
  ocultarNoPermitidos,
}: ExportarInventarioDialogProps) {
  const [seleccion, setSeleccion] = useState<SeleccionExportacion>(SELECCION_INICIAL);
  const [formato, setFormato] = useState<FormatoExportacionInventario>('pdf');
  const [exportando, setExportando] = useState(false);

  const visibles = useMemo(
    () => productosVisiblesParaExportar(productos, ocultarNoPermitidos),
    [productos, ocultarNoPermitidos],
  );

  const baseArbol = useMemo(() => {
    if (seleccion.incluirCeros) return visibles;
    return visibles.filter((producto) => (producto.cantidad_actual ?? 0) > 0);
  }, [visibles, seleccion.incluirCeros]);

  const arbol = useMemo(() => arbolClasificacion(baseArbol), [baseArbol]);

  const reporte = useMemo(
    () => construirReporte(visibles, seleccion),
    [visibles, seleccion],
  );

  const nadaElegido =
    seleccion.modo === 'seleccion' &&
    seleccion.grupos.length === 0 &&
    seleccion.categorias.length === 0;
  const puedeExportar = !exportando && !nadaElegido && reporte.filas.length > 0;

  const cerrar = (siguiente: boolean) => {
    if (!siguiente) {
      setSeleccion(SELECCION_INICIAL);
      setFormato('pdf');
    }
    onOpenChange(siguiente);
  };

  const exportar = async () => {
    if (!puedeExportar) return;
    setExportando(true);
    try {
      const resultado = await descargarReporteInventario({
        productos: visibles,
        seleccion,
        formato,
        corte: formatearFechaHora(new Date()),
        fechaArchivo: obtenerFechaHoy(),
      });
      if (resultado === 'cancelado') return;
      toast.success('Reporte listo para compartir');
      cerrar(false);
    } catch (error) {
      toast.error(mensajeErrorCargaDiferida(error, 'No se pudo exportar el inventario'));
    } finally {
      setExportando(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={cerrar}>
      <DialogContent size="md">
        <DialogHeader>
          <DialogTitle>Exportar inventario</DialogTitle>
          <DialogDescription>
            Existencias de bodega, con la cantidad que muestra el módulo ahora.
          </DialogDescription>
        </DialogHeader>

        <DialogBody className="space-y-5">
          <fieldset className="space-y-2">
            <legend className="text-sm font-medium text-foreground">Qué incluir</legend>
            <label className="flex items-center gap-3 min-h-11 cursor-pointer">
              <input
                type="radio"
                name="alcance-inventario"
                checked={seleccion.modo === 'todo'}
                onChange={() => setSeleccion((actual) => ({ ...actual, modo: 'todo' }))}
                className="size-4 accent-[#73991C]"
              />
              <span className="text-sm text-foreground">Todo el inventario</span>
            </label>
            <label className="flex items-center gap-3 min-h-11 cursor-pointer">
              <input
                type="radio"
                name="alcance-inventario"
                checked={seleccion.modo === 'seleccion'}
                onChange={() => setSeleccion((actual) => ({ ...actual, modo: 'seleccion' }))}
                className="size-4 accent-[#73991C]"
              />
              <span className="text-sm text-foreground">Grupos o categorías</span>
            </label>

            {seleccion.modo === 'seleccion' && (
              <div className="rounded-xl border border-primary/15 bg-muted/20 p-2">
                {arbol.length === 0 ? (
                  <p className="text-sm text-brand-brown/70 px-2 py-3">
                    No hay productos con existencia para exportar.
                  </p>
                ) : (
                  <ul className="space-y-1">
                    {arbol.map((nodo) => {
                      const estado = estadoGrupo(seleccion, nodo);
                      return (
                        <li key={nodo.grupo}>
                          <label className="flex items-center gap-3 min-h-11 px-1 cursor-pointer">
                            <Checkbox
                              checked={estado}
                              onCheckedChange={() =>
                                setSeleccion((actual) => alternarGrupo(actual, nodo))
                              }
                              aria-label={`Grupo ${nodo.grupo}`}
                            />
                            <span className="text-sm font-medium text-foreground">{nodo.grupo}</span>
                            <span className="ml-auto text-xs text-brand-brown/60">{nodo.productos}</span>
                          </label>
                          <ul>
                            {nodo.categorias.map((categoria) => (
                              <li key={`${nodo.grupo}-${categoria.categoria}`}>
                                <label className="flex items-center gap-3 min-h-11 pl-8 pr-1 cursor-pointer">
                                  <Checkbox
                                    checked={categoriaMarcada(
                                      seleccion,
                                      nodo.grupo,
                                      categoria.categoria,
                                    )}
                                    onCheckedChange={() =>
                                      setSeleccion((actual) =>
                                        alternarCategoria(actual, nodo, categoria.categoria),
                                      )
                                    }
                                    aria-label={`Categoría ${categoria.categoria}`}
                                  />
                                  <span className="text-sm text-foreground">{categoria.categoria}</span>
                                  <span className="ml-auto text-xs text-brand-brown/60">
                                    {categoria.productos}
                                  </span>
                                </label>
                              </li>
                            ))}
                          </ul>
                        </li>
                      );
                    })}
                  </ul>
                )}
              </div>
            )}
          </fieldset>

          <fieldset className="space-y-2">
            <legend className="text-sm font-medium text-foreground">Formato</legend>
            <label className="flex items-center gap-3 min-h-11 cursor-pointer">
              <input
                type="radio"
                name="formato-inventario"
                checked={formato === 'pdf'}
                onChange={() => setFormato('pdf')}
                className="size-4 accent-[#73991C]"
              />
              <span className="text-sm text-foreground">PDF</span>
            </label>
            <label className="flex items-center gap-3 min-h-11 cursor-pointer">
              <input
                type="radio"
                name="formato-inventario"
                checked={formato === 'xlsx'}
                onChange={() => setFormato('xlsx')}
                className="size-4 accent-[#73991C]"
              />
              <span className="text-sm text-foreground">Excel (.xlsx)</span>
            </label>
          </fieldset>

          <div className="flex items-center justify-between gap-3 min-h-11">
            <Label htmlFor="incluir-ceros" className="font-normal text-foreground">
              Incluir productos en cero
            </Label>
            <Switch
              id="incluir-ceros"
              checked={seleccion.incluirCeros}
              onCheckedChange={(marcado) =>
                setSeleccion((actual) => ({ ...actual, incluirCeros: marcado === true }))
              }
            />
          </div>

          <p className="text-sm text-brand-brown/70">
            {nadaElegido
              ? 'Elige al menos un grupo o una categoría.'
              : `Se exportan ${reporte.filas.length} productos.`}
          </p>
        </DialogBody>

        <DialogFooter className="gap-3">
          <Button
            type="button"
            variant="outline"
            className="rounded-xl"
            onClick={() => cerrar(false)}
            disabled={exportando}
          >
            Cancelar
          </Button>
          <Button
            type="button"
            className="bg-primary hover:bg-primary-dark text-white rounded-xl"
            onClick={() => void exportar()}
            disabled={!puedeExportar}
          >
            {exportando ? (
              <Loader2 className="w-4 h-4 animate-spin" />
            ) : (
              <Download className="w-4 h-4" />
            )}
            {formato === 'pdf' ? 'Exportar PDF' : 'Exportar Excel'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
