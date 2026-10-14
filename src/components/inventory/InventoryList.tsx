import { useEffect, useState, useRef, useLayoutEffect } from 'react';
import { Search, Plus, Package, Loader2, Edit, Eye, History, X, ChevronUp, ChevronDown, Upload, Download } from 'lucide-react';
import { Button } from '../ui/button';
import { Input } from '../ui/input';
import { getSupabase } from '../../utils/supabase/client';
import { ProductForm } from './ProductForm';
import { ProductMovements } from './ProductMovements';
import { InventorySubNav } from './InventorySubNav';
import { ExportarInventarioDialog } from './ExportarInventarioDialog';
import { useNavigate } from 'react-router-dom';
import { useSafeMode } from '../../contexts/SafeModeContext';
import { toast } from 'sonner';
import {useAuth} from '../../contexts/AuthContext';
import {postActivation,pendingCatalog,type CatalogRow} from '../../utils/productCatalogIntegrity';
import {getSupabaseConfig} from '../../utils/supabase/config';

interface InventoryListProps {
  onNavigate?: (view: string, productId?: string) => void;
  /**
   * Lista ya cargada. Si llega, la pantalla no consulta Supabase.
   * La ruta real no la pasa. Sirve para revisar el export sin red.
   */
  productosIniciales?: Product[];
}

interface Product {
  id: string;
  nombre: string;
  categoria: string;
  grupo: string | null;
  estado: string | null;
  cantidad_actual: number | null;
  unidad_medida: string;
  stock_minimo: number | null;
  precio_unitario: number | null;
  activo: boolean | null;
  permitido_gerencia: boolean | null;
}

export function InventoryList(props:InventoryListProps) {
 const {user}=useAuth();
 return <InventoryListSession key={user?.id??'none'} {...props}/>;
}
function InventoryListSession({ onNavigate, productosIniciales }: InventoryListProps) {
  const {user,profile}=useAuth();const owner=user?.id??'';
  const permitted=!!owner&&profile?.id===owner&&profile.activo===true&&['Administrador','Gerencia'].includes(profile.rol??'');
  const authority=useRef(permitted);
  useLayoutEffect(()=>{authority.current=permitted;},[permitted]);
  const live=useRef(true);const loadGeneration=useRef(0);const operation=useRef(0);
  const [pendingIds,setPendingIds]=useState<string[]>([]);const [busy,setBusy]=useState<string|null>(null);
  useEffect(()=>{if(!permitted){operation.current++;setBusy(null);}},[permitted]);
  useLayoutEffect(()=>{live.current=true;return()=>{live.current=false;};},[]);
  const navigate = useNavigate();
  const { isSafeModeEnabled } = useSafeMode();
  const [products, setProducts] = useState<Product[]>(productosIniciales ?? []);
  const [filteredProducts, setFilteredProducts] = useState<Product[]>([]);
  const [searchQuery, setSearchQuery] = useState('');
  const [categoryFilter, setCategoryFilter] = useState('todas');
  const [isLoading, setIsLoading] = useState(productosIniciales === undefined);
  const [exportarAbierto, setExportarAbierto] = useState(false);
  
  // Estados para ordenamiento
  const [sortColumn, setSortColumn] = useState<keyof Product | null>(null);
  const [sortDirection, setSortDirection] = useState<'asc' | 'desc'>('asc');
  
  // Estados para filtros por columna
  const [columnFilters, setColumnFilters] = useState<{
    estado: string;
    unidad_medida: string;
  }>({
    estado: 'todos',
    unidad_medida: 'todas',
  });
  
  // Estados para el formulario de productos
  const [isProductFormOpen, setIsProductFormOpen] = useState(false);
  const [editingProductId, setEditingProductId] = useState<string | null>(null);

  // Estados para el modal de movimientos
  const [showMovementsModal, setShowMovementsModal] = useState(false);
  const [selectedProductForMovements, setSelectedProductForMovements] = useState<Product | null>(null);

  useEffect(() => {
    if (productosIniciales !== undefined) return;
    loadProducts();
  }, [productosIniciales]);

  useEffect(() => {
    filterProducts();
  // eslint-disable-next-line react-hooks/exhaustive-deps -- this effect recomputes filters only when their actual inputs change.
  }, [searchQuery, categoryFilter, products, sortColumn, sortDirection, columnFilters]);

  const loadProducts = async () => {
    const generation=++loadGeneration.current;
    try {
      const supabase = getSupabase();
      const { data, error } = await supabase
        .from('productos')
        .select('*')
        .order('nombre');

      if (error) {
        console.error('Failed to query productos:', error);
      } else if (data) {
        if(live.current&&generation===loadGeneration.current)setProducts(data);
      }
    } catch (error) {
      console.error('Failed to load inventory products:', error);
    } finally {
      if(live.current&&generation===loadGeneration.current)setIsLoading(false);
    }
  };

  const filterProducts = () => {
    let filtered = products;

    // Filtrar por modo seguro - ocultar productos no permitidos por gerencia
    if (isSafeModeEnabled) {
      filtered = filtered.filter((p) => p.permitido_gerencia !== false);
    }

    // Filtrar por búsqueda
    if (searchQuery) {
      filtered = filtered.filter((p) =>
        p.nombre.toLowerCase().includes(searchQuery.toLowerCase())
      );
    }

    // Filtrar por categoría
    if (categoryFilter !== 'todas') {
      filtered = filtered.filter((p) => p.categoria === categoryFilter);
    }

    // Filtrar por estado
    if (columnFilters.estado !== 'todos') {
      filtered = filtered.filter((p) => p.estado === columnFilters.estado);
    }

    // Filtrar por unidad de medida
    if (columnFilters.unidad_medida !== 'todas') {
      filtered = filtered.filter((p) => p.unidad_medida === columnFilters.unidad_medida);
    }

    // Ordenar
    if (sortColumn) {
      filtered = filtered.sort((a, b) => {
        const aValue = a[sortColumn];
        const bValue = b[sortColumn];
        if (typeof aValue === 'string' && typeof bValue === 'string') {
          return sortDirection === 'asc'
            ? aValue.localeCompare(bValue)
            : bValue.localeCompare(aValue);
        }
        return sortDirection === 'asc'
          ? (aValue as number) - (bValue as number)
          : (bValue as number) - (aValue as number);
      });
    }

    setFilteredProducts(filtered);
  };

  const getCategories = () => {
    const categories = new Set(products.map((p) => p.categoria).filter((c) => c.trim().length > 0));
    return Array.from(categories).sort();
  };

  const getStates = () => {
    const states = new Set(products.map((p) => p.estado).filter((s): s is string => !!s));
    return Array.from(states).sort();
  };

  const getUnits = () => {
    const units = new Set(products.map((p) => p.unidad_medida));
    return Array.from(units).sort();
  };

  const hasLowStock = (product: Product) => {
    return (product.cantidad_actual ?? 0) < (product.stock_minimo ?? 0);
  };

  const formatCurrency = (value: number) => {
    return new Intl.NumberFormat('es-CO', {
      style: 'currency',
      currency: 'COP',
      minimumFractionDigits: 0,
    }).format(value);
  };

  const handleEditProduct = (productId: string) => {
    setEditingProductId(productId);
    setIsProductFormOpen(true);
  };

  useEffect(()=>{
    if(!owner)return;
    const ids:string[]=[];
    for(const product of products){try{if(pendingCatalog(owner,product.id)?.payload.mode==='activation')ids.push(product.id);}catch{ids.push(product.id);}}
    setPendingIds(ids);
  },[owner,products,permitted]);
  const activation=async(product:Product,action:'post'|'retry'|'resolve')=>{
    if(!permitted||!owner){toast.error('Solo Administrador o Gerencia activo puede cambiar productos.');return;}
    const generation=++operation.current;setBusy(product.id);
    const current=()=>live.current&&authority.current&&operation.current===generation;
    try {
      const result=await postActivation(getSupabase(),`${getSupabaseConfig().url}/functions/v1/make-server-1ccce916/inventario/toggle-producto-activo`,owner,product.id,
       action==='post'?{...product} as CatalogRow:null,action==='post'?(product.activo===true?false:true):null,action==='resolve'?'resolve':'post',current);
      if(!current())return;
      setPendingIds(ids=>ids.filter(id=>id!==product.id));
      if(result){setProducts(rows=>rows.map(p=>p.id===product.id?result.product as unknown as Product:p));toast.success('Estado del producto verificado.');}
      else toast.info('El intento anterior no se registró. Puede revisar el producto y volver a intentar.');
    }catch(error:unknown){if(current()){
      let uncertain=false;try{uncertain=pendingCatalog(owner,product.id)?.payload.mode==='activation';}catch{uncertain=true;}
      setPendingIds(ids=>uncertain?(ids.includes(product.id)?ids:[...ids,product.id]):ids.filter(id=>id!==product.id));
      toast.error(error instanceof Error?error.message:'Conserve el intento pendiente.');
    }}
    finally{if(current())setBusy(null);}
  };
  const handleToggleActivo=(product:Product,e:React.MouseEvent)=>{e.stopPropagation();void activation(product,'post');};

  const handleSort = (column: keyof Product) => {
    if (sortColumn === column) {
      // Si ya está ordenando por esta columna, cambiar dirección
      setSortDirection(sortDirection === 'asc' ? 'desc' : 'asc');
    } else {
      // Nueva columna, ordenar ascendente
      setSortColumn(column);
      setSortDirection('asc');
    }
  };

  const SortIcon = ({ column }: { column: keyof Product }) => {
    if (sortColumn !== column) {
      return <ChevronUp className="w-4 h-4 opacity-30" />;
    }
    return sortDirection === 'asc' ? (
      <ChevronUp className="w-4 h-4" />
    ) : (
      <ChevronDown className="w-4 h-4" />
    );
  };

  if (isLoading) {
    return (
      <div className="space-y-6">
        <div className="flex items-center justify-center py-12">
          <Loader2 className="w-8 h-8 text-[#4A7C59] animate-spin" />
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Barra de navegación */}
      <InventorySubNav />
      
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h1 className="text-foreground mb-2">Inventario</h1>
          <p className="text-brand-brown/70">{products.length} productos registrados</p>
        </div>
        <div className="flex flex-wrap gap-3">
          <Button
            onClick={() => setExportarAbierto(true)}
            variant="outline"
            className="border-primary text-primary hover:bg-primary/10 rounded-xl transition-all duration-200"
          >
            <Download className="w-4 h-4 mr-2" />
            Exportar
          </Button>
          <Button
            onClick={() => navigate('/inventario/importar')}
            variant="outline"
            className="border-primary text-primary hover:bg-primary/10 rounded-xl transition-all duration-200"
          >
            <Upload className="w-4 h-4 mr-2" />
            Importar CSV
          </Button>
          <Button
            onClick={() => {
              setEditingProductId(null);
              setIsProductFormOpen(true);
            }}
            className="bg-primary hover:bg-primary-dark text-white rounded-xl transition-all duration-200"
          >
            <Plus className="w-4 h-4 mr-2" />
            Nuevo Producto
          </Button>
        </div>
      </div>

      {/* Search and Filters */}
      <div className="bg-white/80 backdrop-blur-sm rounded-2xl border border-primary/10 p-4 shadow-[0_4px_24px_rgba(115,153,28,0.08)]">
        <div className="flex flex-col md:flex-row gap-4">
          <div className="flex-1 relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-5 h-5 text-brand-brown/50" />
            <Input
              type="text"
              placeholder="Buscar productos..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="pl-10 bg-muted/30 border-primary/20 focus:border-primary rounded-xl"
            />
          </div>
          <select
            value={categoryFilter}
            onChange={(e) => setCategoryFilter(e.target.value)}
            className="px-4 py-2 border border-primary/20 rounded-xl bg-white text-foreground focus:outline-none focus:ring-2 focus:ring-primary focus:border-transparent"
          >
            <option value="todas">Todas las categorías</option>
            {getCategories().map((cat) => (
              <option key={cat} value={cat}>
                {cat}
              </option>
            ))}
          </select>
          <select
            value={columnFilters.estado}
            onChange={(e) => setColumnFilters({ ...columnFilters, estado: e.target.value })}
            className="px-4 py-2 border border-primary/20 rounded-xl bg-white text-foreground focus:outline-none focus:ring-2 focus:ring-primary focus:border-transparent"
          >
            <option value="todos">Todos los estados</option>
            {getStates().map((state) => (
              <option key={state} value={state}>
                {state}
              </option>
            ))}
          </select>
          <select
            value={columnFilters.unidad_medida}
            onChange={(e) => setColumnFilters({ ...columnFilters, unidad_medida: e.target.value })}
            className="px-4 py-2 border border-primary/20 rounded-xl bg-white text-foreground focus:outline-none focus:ring-2 focus:ring-primary focus:border-transparent"
          >
            <option value="todas">Todas las unidades</option>
            {getUnits().map((unit) => (
              <option key={unit} value={unit}>
                {unit}
              </option>
            ))}
          </select>
        </div>
      </div>

      {/* Products Table */}
      <div className="bg-white/80 backdrop-blur-sm rounded-2xl border border-primary/10 overflow-hidden shadow-[0_4px_24px_rgba(115,153,28,0.08)]">
        <div className="overflow-x-auto">
          <table className="w-full">
            <thead className="bg-gradient-to-r from-muted/50 to-muted/30 border-b border-primary/10">
              <tr>
                <th
                  onClick={() => handleSort('nombre')}
                  className="text-left px-6 py-2.5 text-sm text-brand-brown/70 tracking-wide uppercase cursor-pointer hover:bg-muted/50 transition-colors"
                >
                  <div className="flex items-center gap-2">
                    Producto
                    <SortIcon column="nombre" />
                  </div>
                </th>
                <th
                  onClick={() => handleSort('categoria')}
                  className="text-left px-6 py-2.5 text-sm text-brand-brown/70 tracking-wide uppercase cursor-pointer hover:bg-muted/50 transition-colors"
                >
                  <div className="flex items-center gap-2">
                    Categoría
                    <SortIcon column="categoria" />
                  </div>
                </th>
                <th
                  onClick={() => handleSort('estado')}
                  className="text-left px-6 py-2.5 text-sm text-brand-brown/70 tracking-wide uppercase cursor-pointer hover:bg-muted/50 transition-colors"
                >
                  <div className="flex items-center gap-2">
                    Estado
                    <SortIcon column="estado" />
                  </div>
                </th>
                <th
                  onClick={() => handleSort('cantidad_actual')}
                  className="text-right px-6 py-2.5 text-sm text-brand-brown/70 tracking-wide uppercase cursor-pointer hover:bg-muted/50 transition-colors"
                >
                  <div className="flex items-center justify-end gap-2">
                    Cantidad Actual
                    <SortIcon column="cantidad_actual" />
                  </div>
                </th>
                <th
                  className="text-right px-6 py-2.5 text-sm text-brand-brown/70 tracking-wide uppercase"
                >
                  Valor Total
                </th>
                <th
                  className="text-center px-6 py-2.5 text-sm text-brand-brown/70 tracking-wide uppercase"
                >
                  Activo
                </th>
                <th className="text-center px-6 py-2.5 text-sm text-brand-brown/70 tracking-wide uppercase">
                  Acciones
                </th>
              </tr>
            </thead>
            <tbody className="divide-y divide-primary/5">
              {filteredProducts.length === 0 ? (
                <tr>
                  <td colSpan={8} className="px-6 py-12 text-center">
                    <Package className="w-12 h-12 text-brand-brown/40 mx-auto mb-3" />
                    <p className="text-brand-brown/60">No se encontraron productos</p>
                  </td>
                </tr>
              ) : (
                filteredProducts.map((product) => (
                  <tr
                    key={product.id}
                    className="hover:bg-muted/20 cursor-pointer transition-all duration-200"
                    onClick={() => onNavigate && onNavigate('inventory-detail', product.id)}
                  >
                    <td className="px-6 py-1.5 text-sm">
                      {/* El `text-sm` va aquí y no solo en el <td>: el bloque de
                          tipografía base de globals.css fija `p { font-size:
                          var(--text-base) }`, y una regla directa gana sobre el
                          valor heredado del contenedor. Sin esta clase el nombre
                          renderiza a 16 px aunque su <td> diga `text-sm`.
                          Ver docs/sistema-visual.md §5. */}
                      <p className={`text-sm ${!product.permitido_gerencia ? 'text-red-600 font-bold' : 'text-foreground'}`}>
                        {product.nombre}
                      </p>
                    </td>
                    <td className="px-6 py-1.5">
                      <span className="inline-flex items-center px-2.5 py-0.5 rounded-lg bg-primary/10 text-primary text-xs">
                        {product.categoria}
                      </span>
                    </td>
                    <td className="px-6 py-1.5">
                      <span
                        className={`inline-flex items-center px-2.5 py-0.5 rounded-lg text-xs ${
                          product.estado === 'Disponible'
                            ? 'bg-success-alt/10 text-success-alt'
                            : 'bg-warning/10 text-warning'
                        }`}
                      >
                        {product.estado || 'Disponible'}
                      </span>
                    </td>
                    <td className="px-6 py-1.5 text-right text-sm text-foreground">
                      {product.cantidad_actual} {product.unidad_medida}
                    </td>
                    <td className="px-6 py-1.5 text-right text-sm text-foreground">
                      {formatCurrency((product.cantidad_actual ?? 0) * (product.precio_unitario || 0))}
                    </td>
                    <td className="px-6 py-1.5 text-center">
                      <button
                        onClick={(e) => handleToggleActivo(product, e)}
                        className={`relative inline-flex h-6 w-11 flex-shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors duration-200 ease-in-out focus:outline-none focus:ring-2 focus:ring-primary focus:ring-offset-2 ${
                          product.activo ? 'bg-primary' : 'bg-brand-brown/20'
                        }`}
                        disabled={!permitted||busy!==null||pendingIds.includes(product.id)}
                        title={product.activo===null?'Estado sin definir: Activar producto':product.activo?'Desactivar producto':'Activar producto'}
                      >
                        <span
                          className={`pointer-events-none inline-block h-5 w-5 transform rounded-full bg-white shadow ring-0 transition duration-200 ease-in-out ${
                            product.activo ? 'translate-x-5' : 'translate-x-0'
                          }`}
                        />
                      </button>
                      {product.activo===null&&<span>Estado sin definir</span>}
                      {pendingIds.includes(product.id)&&<div>
                        <button type="button" disabled={!permitted||busy!==null} onClick={e=>{e.stopPropagation();void activation(product,'retry');}}>Reintentar estado pendiente</button>
                        <button type="button" disabled={!permitted||busy!==null} onClick={e=>{e.stopPropagation();void activation(product,'resolve');}}>Verificar estado pendiente</button>
                      </div>}
                    </td>
                    <td className="px-6 py-1.5 text-center">
                      <div className="flex items-center justify-center gap-2">
                        <Button
                          onClick={(e) => {
                            e.stopPropagation();
                            navigate(`/inventario/producto/${product.id}`);
                          }}
                          size="sm"
                          variant="outline"
                          className="border-primary/20 text-primary hover:bg-primary/5 rounded-xl transition-all duration-200"
                          title="Ver detalles"
                        >
                          <Eye className="w-4 h-4" />
                        </Button>
                        <Button
                          onClick={(e) => {
                            e.stopPropagation();
                            handleEditProduct(product.id);
                          }}
                          size="sm"
                          className="bg-primary hover:bg-primary-dark text-white rounded-xl transition-all duration-200"
                          title="Editar"
                        >
                          <Edit className="w-4 h-4" />
                        </Button>
                        <Button
                          onClick={(e) => {
                            e.stopPropagation();
                            setSelectedProductForMovements(product);
                            setShowMovementsModal(true);
                          }}
                          size="sm"
                          variant="outline"
                          className="border-primary/20 text-primary hover:bg-primary/5 rounded-xl transition-all duration-200"
                          title="Ver movimientos"
                        >
                          <History className="w-4 h-4" />
                        </Button>
                      </div>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* Summary */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <div className="bg-white/80 backdrop-blur-sm rounded-2xl border border-primary/10 p-5 shadow-[0_4px_24px_rgba(115,153,28,0.08)] hover:shadow-[0_6px_28px_rgba(115,153,28,0.12)] transition-all duration-200">
          <p className="text-sm text-brand-brown/60 mb-1 uppercase tracking-wide">Total Productos</p>
          <p className="text-2xl text-foreground">{filteredProducts.length}</p>
        </div>
        <div className="bg-white/80 backdrop-blur-sm rounded-2xl border border-primary/10 p-5 shadow-[0_4px_24px_rgba(115,153,28,0.08)] hover:shadow-[0_6px_28px_rgba(115,153,28,0.12)] transition-all duration-200">
          <p className="text-sm text-brand-brown/60 mb-1 uppercase tracking-wide">Con Stock Bajo</p>
          <p className="text-2xl text-warning">
            {filteredProducts.filter(hasLowStock).length}
          </p>
        </div>
        <div className="bg-white/80 backdrop-blur-sm rounded-2xl border border-primary/10 p-5 shadow-[0_4px_24px_rgba(115,153,28,0.08)] hover:shadow-[0_6px_28px_rgba(115,153,28,0.12)] transition-all duration-200">
          <p className="text-sm text-brand-brown/60 mb-1 uppercase tracking-wide">Valor Total</p>
          <p className="text-2xl text-foreground">
            {formatCurrency(
              filteredProducts.reduce(
                (sum, p) => sum + (p.cantidad_actual ?? 0) * (p.precio_unitario || 0),
                0
              )
            )}
          </p>
        </div>
      </div>

      <ExportarInventarioDialog
        open={exportarAbierto}
        onOpenChange={setExportarAbierto}
        ocultarNoPermitidos={isSafeModeEnabled}
        productos={products.map((producto) => ({
          nombre: producto.nombre,
          categoria: producto.categoria,
          grupo: producto.grupo,
          cantidad_actual: producto.cantidad_actual,
          unidad_medida: producto.unidad_medida,
          permitido_gerencia: producto.permitido_gerencia,
        }))}
      />

      {/* Formulario de Productos */}
      {isProductFormOpen && (
        <ProductForm
          isOpen={isProductFormOpen}
          productId={editingProductId}
          onClose={() => {
            setIsProductFormOpen(false);
            setEditingProductId(null);
          }}
          onSuccess={loadProducts}
        />
      )}

      {/* Modal de Movimientos del Producto */}
      {showMovementsModal && selectedProductForMovements && (
        <div className="fixed inset-0 bg-foreground/50 backdrop-blur-sm flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-2xl max-w-4xl w-full max-h-[90vh] overflow-hidden shadow-[0_8px_32px_rgba(115,153,28,0.2)] animate-in fade-in zoom-in duration-200">
            {/* Header del Modal */}
            <div className="bg-gradient-to-r from-primary to-secondary px-6 py-4 flex items-center justify-between border-b border-primary/10">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 bg-white/20 backdrop-blur-sm rounded-xl flex items-center justify-center">
                  <History className="w-5 h-5 text-white" />
                </div>
                <div>
                  <h2 className="text-xl text-white">Historial de Movimientos</h2>
                  <p className="text-sm text-white/80">{selectedProductForMovements.nombre}</p>
                </div>
              </div>
              <Button
                onClick={() => setShowMovementsModal(false)}
                variant="ghost"
                size="sm"
                className="text-white hover:bg-white/20 rounded-xl transition-all duration-200"
              >
                <X className="w-5 h-5" />
              </Button>
            </div>

            {/* Contenido del Modal */}
            <div className="overflow-y-auto p-6 bg-background" style={{ maxHeight: 'calc(90vh - 80px)' }}>
              <ProductMovements
                productId={selectedProductForMovements.id}
                productName={selectedProductForMovements.nombre}
                unidadMedida={selectedProductForMovements.unidad_medida}
              />
            </div>
          </div>
        </div>
      )}
    </div>
  );
}