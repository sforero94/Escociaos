import { useEffect, useState } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { 
  ArrowLeft, 
  Package, 
  FileText, 
  Shield,
  Loader2,
  ExternalLink,
  AlertTriangle,
  Leaf,
  Droplet,
  Beaker,
  Calendar,
  DollarSign
} from 'lucide-react';
import { Button } from '../ui/button';
import { getSupabase } from '../../utils/supabase/client';
import { InventorySubNav } from './InventorySubNav';

interface Product {
  id: string;
  nombre: string;
  categoria: string;
  grupo: string;
  registro_ica: string;
  blanco_biologico: string;
  
  // Ingredientes activos
  ingrediente_activo_1: string;
  concentracion_ia_1: number;
  ingrediente_activo_2: string;
  concentracion_ia_2: number;
  ingrediente_activo_3: string;
  concentracion_ia_3: number;
  
  // Seguridad
  periodo_reingreso_horas: number;
  periodo_carencia_dias: number;
  tipo_aplicacion: string;
  estado_fisico: string;
  permitido_gerencia: boolean;
  
  // Composición nutricional
  nitrogeno: number;
  fosforo: number;
  potasio: number;
  calcio: number;
  magnesio: number;
  azufre: number;
  hierro: number;
  manganeso: number;
  zinc: number;
  cobre: number;
  boro: number;
  molibdeno: number;
  carbono_organico: number;
  silicio: number;
  sodio: number;
  
  // Riesgos
  epp_alto_nivel: boolean;
  riesgo_acuatico: boolean;
  riesgo_vida_silvestre: boolean;
  riesgo_polinizador: boolean;
  riesgo_transeunte: boolean;
  
  // Documentación
  link_ficha_tecnica: string;
  link_hoja_seguridad: string;
  
  // Comercial
  unidad_medida: string;
  presentacion_kg_l: number;
  precio_por_presentacion: number;
  precio_unitario: number;
  
  // Inventario
  cantidad_actual: number;
  estado: string;
  stock_minimo: number;
  activo: boolean;
  
  // Auditoría
  created_at: string;
  updated_at: string;
}

export function ProductDetail() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const [product, setProduct] = useState<Product | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (id) {
      loadProduct();
    }
  }, [id]);

  const loadProduct = async () => {
    try {
      setLoading(true);
      const supabase = getSupabase();
      const { data, error } = await supabase
        .from('productos')
        .select('*')
        .eq('id', id)
        .single();

      if (error) throw error;
      setProduct(data);
    } catch (error) {
    } finally {
      setLoading(false);
    }
  };

  const InfoRow = ({ label, value, unit = '' }: { label: string; value: any; unit?: string }) => {
    if (value === null || value === undefined || value === '') return null;
    
    return (
      <div className="flex flex-col sm:flex-row sm:items-center gap-2 py-3 border-b border-[#73991C]/10 last:border-0">
        <span className="text-sm text-[#4D240F]/70 sm:w-1/3">{label}:</span>
        <span className="text-sm text-[#172E08] sm:w-2/3">
          {typeof value === 'boolean' ? (value ? 'Sí' : 'No') : `${value}${unit}`}
        </span>
      </div>
    );
  };

  const Section = ({ title, icon: Icon, children }: { title: string; icon: any; children: React.ReactNode }) => (
    <div className="bg-white/80 backdrop-blur-sm rounded-2xl border border-[#73991C]/10 p-6 shadow-[0_4px_24px_rgba(115,153,28,0.08)]">
      <div className="flex items-center gap-3 mb-4 pb-4 border-b border-[#73991C]/10">
        <div className="w-10 h-10 bg-gradient-to-br from-[#73991C] to-[#BFD97D] rounded-xl flex items-center justify-center shadow-lg shadow-[#73991C]/20">
          <Icon className="w-5 h-5 text-white" />
        </div>
        <h2 className="text-lg text-[#172E08]">{title}</h2>
      </div>
      <div className="space-y-1">
        {children}
      </div>
    </div>
  );

  if (loading) {
    return (
      <div className="space-y-6">
        <InventorySubNav />
        <div className="flex items-center justify-center py-12">
          <Loader2 className="w-8 h-8 text-[#73991C] animate-spin" />
        </div>
      </div>
    );
  }

  if (!product) {
    return (
      <div className="space-y-6">
        <InventorySubNav />
        <div className="text-center py-12">
          <Package className="w-16 h-16 text-[#4D240F]/40 mx-auto mb-4" />
          <p className="text-[#4D240F]/70">Producto no encontrado</p>
          <Button
            onClick={() => navigate('/inventario')}
            className="mt-4 bg-[#73991C] hover:bg-[#5f7d17] text-white rounded-xl"
          >
            Volver a la lista
          </Button>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <InventorySubNav />

      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <div className="flex items-center gap-2 mb-2">
            <Button
              onClick={() => navigate('/inventario')}
              variant="outline"
              size="sm"
              className="border-[#73991C]/30 text-[#73991C] hover:bg-[#73991C]/5 rounded-xl"
            >
              <ArrowLeft className="w-4 h-4 mr-2" />
              Volver
            </Button>
          </div>
          <h1 className="text-[#172E08] mb-2">{product.nombre}</h1>
          <div className="flex flex-wrap gap-2">
            <span className="inline-flex items-center px-3 py-1 rounded-full text-xs bg-[#73991C]/10 text-[#73991C]">
              {product.categoria}
            </span>
            <span className="inline-flex items-center px-3 py-1 rounded-full text-xs bg-[#BFD97D]/30 text-[#4D240F]">
              {product.grupo}
            </span>
            <span className={`inline-flex items-center px-3 py-1 rounded-full text-xs ${
              product.estado === 'OK' 
                ? 'bg-green-100 text-green-700'
                : product.estado === 'Por debajo del mínimo'
                ? 'bg-orange-100 text-orange-700'
                : 'bg-red-100 text-red-700'
            }`}>
              {product.estado}
            </span>
          </div>
        </div>
      </div>

      {/* Información General */}
      <Section title="Información General" icon={Package}>
        <InfoRow label="Nombre" value={product.nombre} />
        <InfoRow label="Categoría" value={product.categoria} />
        <InfoRow label="Grupo" value={product.grupo} />
        <InfoRow label="Registro ICA" value={product.registro_ica} />
        <InfoRow label="Blanco Biológico" value={product.blanco_biologico} />
        <InfoRow label="Tipo de Aplicación" value={product.tipo_aplicacion} />
        <InfoRow label="Estado Físico" value={product.estado_fisico} />
        <InfoRow label="Requiere Autorización de Gerencia" value={product.permitido_gerencia} />
      </Section>

      {/* Ingredientes Activos */}
      {(product.ingrediente_activo_1 || product.ingrediente_activo_2 || product.ingrediente_activo_3) && (
        <Section title="Ingredientes Activos" icon={Beaker}>
          {product.ingrediente_activo_1 && (
            <InfoRow 
              label="Ingrediente Activo 1" 
              value={`${product.ingrediente_activo_1}${product.concentracion_ia_1 ? ` - ${product.concentracion_ia_1}%` : ''}`} 
            />
          )}
          {product.ingrediente_activo_2 && (
            <InfoRow 
              label="Ingrediente Activo 2" 
              value={`${product.ingrediente_activo_2}${product.concentracion_ia_2 ? ` - ${product.concentracion_ia_2}%` : ''}`} 
            />
          )}
          {product.ingrediente_activo_3 && (
            <InfoRow 
              label="Ingrediente Activo 3" 
              value={`${product.ingrediente_activo_3}${product.concentracion_ia_3 ? ` - ${product.concentracion_ia_3}%` : ''}`} 
            />
          )}
        </Section>
      )}

      {/* Seguridad */}
      <Section title="Seguridad y Periodos" icon={Shield}>
        <InfoRow label="Periodo de Reingreso" value={product.periodo_reingreso_horas} unit=" horas" />
        <InfoRow label="Periodo de Carencia" value={product.periodo_carencia_dias} unit=" días" />
      </Section>

      {/* Composición Nutricional */}
      {(product.nitrogeno || product.fosforo || product.potasio || product.calcio || product.magnesio) && (
        <Section title="Composición Nutricional" icon={Leaf}>
          <InfoRow label="Nitrógeno (N)" value={product.nitrogeno} unit="%" />
          <InfoRow label="Fósforo (P)" value={product.fosforo} unit="%" />
          <InfoRow label="Potasio (K)" value={product.potasio} unit="%" />
          <InfoRow label="Calcio (Ca)" value={product.calcio} unit="%" />
          <InfoRow label="Magnesio (Mg)" value={product.magnesio} unit="%" />
          <InfoRow label="Azufre (S)" value={product.azufre} unit="%" />
          <InfoRow label="Hierro (Fe)" value={product.hierro} unit="%" />
          <InfoRow label="Manganeso (Mn)" value={product.manganeso} unit="%" />
          <InfoRow label="Zinc (Zn)" value={product.zinc} unit="%" />
          <InfoRow label="Cobre (Cu)" value={product.cobre} unit="%" />
          <InfoRow label="Boro (B)" value={product.boro} unit="%" />
          <InfoRow label="Molibdeno (Mo)" value={product.molibdeno} unit="%" />
          <InfoRow label="Carbono Orgánico" value={product.carbono_organico} unit="%" />
          <InfoRow label="Silicio (Si)" value={product.silicio} unit="%" />
          <InfoRow label="Sodio (Na)" value={product.sodio} unit="%" />
        </Section>
      )}

      {/* Riesgos */}
      <Section title="Evaluación de Riesgos" icon={AlertTriangle}>
        <InfoRow label="Requiere EPP de Alto Nivel" value={product.epp_alto_nivel} />
        <InfoRow label="Riesgo Acuático" value={product.riesgo_acuatico} />
        <InfoRow label="Riesgo para Vida Silvestre" value={product.riesgo_vida_silvestre} />
        <InfoRow label="Riesgo para Polinizadores" value={product.riesgo_polinizador} />
        <InfoRow label="Riesgo para Transeúntes" value={product.riesgo_transeunte} />
      </Section>

      {/* Documentación */}
      {(product.link_ficha_tecnica || product.link_hoja_seguridad) && (
        <Section title="Documentación" icon={FileText}>
          {product.link_ficha_tecnica && (
            <div className="flex flex-col sm:flex-row sm:items-center gap-2 py-3 border-b border-[#73991C]/10">
              <span className="text-sm text-[#4D240F]/70 sm:w-1/3">Ficha Técnica:</span>
              <a 
                href={product.link_ficha_tecnica} 
                target="_blank" 
                rel="noopener noreferrer"
                className="inline-flex items-center gap-2 text-sm text-[#73991C] hover:text-[#5f7d17] hover:underline sm:w-2/3"
              >
                Ficha técnica
                <ExternalLink className="w-4 h-4" />
              </a>
            </div>
          )}
          {product.link_hoja_seguridad && (
            <div className="flex flex-col sm:flex-row sm:items-center gap-2 py-3">
              <span className="text-sm text-[#4D240F]/70 sm:w-1/3">Hoja de Seguridad:</span>
              <a 
                href={product.link_hoja_seguridad} 
                target="_blank" 
                rel="noopener noreferrer"
                className="inline-flex items-center gap-2 text-sm text-[#73991C] hover:text-[#5f7d17] hover:underline sm:w-2/3"
              >
                Hoja de seguridad
                <ExternalLink className="w-4 h-4" />
              </a>
            </div>
          )}
        </Section>
      )}

      {/* Información Comercial */}
      <Section title="Información Comercial" icon={DollarSign}>
        <InfoRow label="Unidad de Medida" value={product.unidad_medida} />
        <InfoRow 
          label="Presentación Comercial" 
          value={product.presentacion_kg_l} 
          unit={` ${product.unidad_medida}`} 
        />
        <InfoRow 
          label="Precio por Presentación" 
          value={product.precio_por_presentacion ? `$${product.precio_por_presentacion.toLocaleString('es-CO')}` : null} 
        />
        <InfoRow 
          label="Precio Unitario" 
          value={product.precio_unitario ? `$${product.precio_unitario.toLocaleString('es-CO')}` : null} 
        />
      </Section>

      {/* Inventario */}
      <Section title="Inventario" icon={Droplet}>
        <InfoRow 
          label="Cantidad Actual" 
          value={product.cantidad_actual?.toLocaleString('es-CO')} 
          unit={` ${product.unidad_medida}`} 
        />
        <InfoRow label="Estado" value={product.estado} />
        <InfoRow 
          label="Stock Mínimo" 
          value={product.stock_minimo?.toLocaleString('es-CO')} 
          unit={` ${product.unidad_medida}`} 
        />
        <InfoRow label="Producto Activo" value={product.activo} />
      </Section>

      {/* Auditoría */}
      <Section title="Auditoría" icon={Calendar}>
        <InfoRow 
          label="Fecha de Creación" 
          value={new Date(product.created_at).toLocaleString('es-CO', {
            year: 'numeric',
            month: 'long',
            day: 'numeric',
            hour: '2-digit',
            minute: '2-digit'
          })} 
        />
        <InfoRow 
          label="Última Actualización" 
          value={new Date(product.updated_at).toLocaleString('es-CO', {
            year: 'numeric',
            month: 'long',
            day: 'numeric',
            hour: '2-digit',
            minute: '2-digit'
          })} 
        />
      </Section>
    </div>
  );
}
