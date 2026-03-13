export type Json =
  | string
  | number
  | boolean
  | null
  | { [key: string]: Json | undefined }
  | Json[]

export type Database = {
  // Allows to automatically instantiate createClient with right options
  // instead of createClient<Database, { PostgrestVersion: 'XX' }>(URL, KEY)
  __InternalSupabase: {
    PostgrestVersion: "13.0.5"
  }
  public: {
    Tables: {
      aplicaciones: {
        Row: {
          agronomo_responsable: string | null
          arboles_jornal: number | null
          blanco_biologico: string | null
          codigo_aplicacion: string | null
          costo_por_arbol: number | null
          costo_total: number | null
          costo_total_insumos: number | null
          costo_total_mano_obra: number | null
          created_at: string | null
          estado: Database["public"]["Enums"]["estado_aplicacion"] | null
          fecha_cierre: string | null
          fecha_fin_ejecucion: string | null
          fecha_fin_planeada: string | null
          fecha_inicio_ejecucion: string | null
          fecha_inicio_planeada: string | null
          fecha_recomendacion: string | null
          id: string
          jornales_utilizados: number | null
          nombre_aplicacion: string | null
          observaciones_cierre: string | null
          proposito: string | null
          tarea_id: string | null
          tipo_aplicacion: Database["public"]["Enums"]["tipo_aplicacion"]
          updated_at: string | null
          valor_jornal: number | null
        }
        Insert: {
          agronomo_responsable?: string | null
          arboles_jornal?: number | null
          blanco_biologico?: string | null
          codigo_aplicacion?: string | null
          costo_por_arbol?: number | null
          costo_total?: number | null
          costo_total_insumos?: number | null
          costo_total_mano_obra?: number | null
          created_at?: string | null
          estado?: Database["public"]["Enums"]["estado_aplicacion"] | null
          fecha_cierre?: string | null
          fecha_fin_ejecucion?: string | null
          fecha_fin_planeada?: string | null
          fecha_inicio_ejecucion?: string | null
          fecha_inicio_planeada?: string | null
          fecha_recomendacion?: string | null
          id?: string
          jornales_utilizados?: number | null
          nombre_aplicacion?: string | null
          observaciones_cierre?: string | null
          proposito?: string | null
          tarea_id?: string | null
          tipo_aplicacion: Database["public"]["Enums"]["tipo_aplicacion"]
          updated_at?: string | null
          valor_jornal?: number | null
        }
        Update: {
          agronomo_responsable?: string | null
          arboles_jornal?: number | null
          blanco_biologico?: string | null
          codigo_aplicacion?: string | null
          costo_por_arbol?: number | null
          costo_total?: number | null
          costo_total_insumos?: number | null
          costo_total_mano_obra?: number | null
          created_at?: string | null
          estado?: Database["public"]["Enums"]["estado_aplicacion"] | null
          fecha_cierre?: string | null
          fecha_fin_ejecucion?: string | null
          fecha_fin_planeada?: string | null
          fecha_inicio_ejecucion?: string | null
          fecha_inicio_planeada?: string | null
          fecha_recomendacion?: string | null
          id?: string
          jornales_utilizados?: number | null
          nombre_aplicacion?: string | null
          observaciones_cierre?: string | null
          proposito?: string | null
          tarea_id?: string | null
          tipo_aplicacion?: Database["public"]["Enums"]["tipo_aplicacion"]
          updated_at?: string | null
          valor_jornal?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "aplicaciones_tarea_id_fkey"
            columns: ["tarea_id"]
            isOneToOne: false
            referencedRelation: "tareas"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "aplicaciones_tarea_id_fkey"
            columns: ["tarea_id"]
            isOneToOne: false
            referencedRelation: "vista_tareas_resumen"
            referencedColumns: ["id"]
          },
        ]
      }
      aplicaciones_calculos: {
        Row: {
          aplicacion_id: string
          area_hectareas: number | null
          created_at: string | null
          id: string
          kilos_clonales: number | null
          kilos_grandes: number | null
          kilos_medianos: number | null
          kilos_pequenos: number | null
          kilos_totales: number | null
          litros_mezcla: number | null
          lote_id: string
          lote_nombre: string
          mezcla_id: string | null
          numero_bultos: number | null
          numero_canecas: number | null
          total_arboles: number
        }
        Insert: {
          aplicacion_id: string
          area_hectareas?: number | null
          created_at?: string | null
          id?: string
          kilos_clonales?: number | null
          kilos_grandes?: number | null
          kilos_medianos?: number | null
          kilos_pequenos?: number | null
          kilos_totales?: number | null
          litros_mezcla?: number | null
          lote_id: string
          lote_nombre: string
          mezcla_id?: string | null
          numero_bultos?: number | null
          numero_canecas?: number | null
          total_arboles: number
        }
        Update: {
          aplicacion_id?: string
          area_hectareas?: number | null
          created_at?: string | null
          id?: string
          kilos_clonales?: number | null
          kilos_grandes?: number | null
          kilos_medianos?: number | null
          kilos_pequenos?: number | null
          kilos_totales?: number | null
          litros_mezcla?: number | null
          lote_id?: string
          lote_nombre?: string
          mezcla_id?: string | null
          numero_bultos?: number | null
          numero_canecas?: number | null
          total_arboles?: number
        }
        Relationships: [
          {
            foreignKeyName: "aplicaciones_calculos_aplicacion_fkey"
            columns: ["aplicacion_id"]
            isOneToOne: false
            referencedRelation: "aplicaciones"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "aplicaciones_calculos_lote_fkey"
            columns: ["lote_id"]
            isOneToOne: false
            referencedRelation: "lotes"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "aplicaciones_calculos_mezcla_id_fkey"
            columns: ["mezcla_id"]
            isOneToOne: false
            referencedRelation: "aplicaciones_mezclas"
            referencedColumns: ["id"]
          },
        ]
      }
      aplicaciones_cierre: {
        Row: {
          aplicacion_id: string
          cerrado_por: string | null
          created_at: string | null
          dias_aplicacion: number | null
          fecha_cierre: string
          id: string
          observaciones_generales: string | null
          valor_jornal: number | null
        }
        Insert: {
          aplicacion_id: string
          cerrado_por?: string | null
          created_at?: string | null
          dias_aplicacion?: number | null
          fecha_cierre: string
          id?: string
          observaciones_generales?: string | null
          valor_jornal?: number | null
        }
        Update: {
          aplicacion_id?: string
          cerrado_por?: string | null
          created_at?: string | null
          dias_aplicacion?: number | null
          fecha_cierre?: string
          id?: string
          observaciones_generales?: string | null
          valor_jornal?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "aplicaciones_cierre_aplicacion_id_fkey"
            columns: ["aplicacion_id"]
            isOneToOne: true
            referencedRelation: "aplicaciones"
            referencedColumns: ["id"]
          },
        ]
      }
      aplicaciones_compras: {
        Row: {
          alerta: string | null
          aplicacion_id: string
          cantidad_faltante: number
          cantidad_necesaria: number
          costo_estimado: number | null
          created_at: string | null
          id: string
          inventario_actual: number
          precio_unitario: number | null
          presentacion_comercial: string | null
          producto_categoria: string
          producto_id: string
          producto_nombre: string
          unidad: Database["public"]["Enums"]["unidad_medida"]
          unidades_a_comprar: number
        }
        Insert: {
          alerta?: string | null
          aplicacion_id: string
          cantidad_faltante?: number
          cantidad_necesaria: number
          costo_estimado?: number | null
          created_at?: string | null
          id?: string
          inventario_actual: number
          precio_unitario?: number | null
          presentacion_comercial?: string | null
          producto_categoria: string
          producto_id: string
          producto_nombre: string
          unidad: Database["public"]["Enums"]["unidad_medida"]
          unidades_a_comprar?: number
        }
        Update: {
          alerta?: string | null
          aplicacion_id?: string
          cantidad_faltante?: number
          cantidad_necesaria?: number
          costo_estimado?: number | null
          created_at?: string | null
          id?: string
          inventario_actual?: number
          precio_unitario?: number | null
          presentacion_comercial?: string | null
          producto_categoria?: string
          producto_id?: string
          producto_nombre?: string
          unidad?: Database["public"]["Enums"]["unidad_medida"]
          unidades_a_comprar?: number
        }
        Relationships: [
          {
            foreignKeyName: "aplicaciones_compras_aplicacion_fkey"
            columns: ["aplicacion_id"]
            isOneToOne: false
            referencedRelation: "aplicaciones"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "aplicaciones_compras_producto_fkey"
            columns: ["producto_id"]
            isOneToOne: false
            referencedRelation: "productos"
            referencedColumns: ["id"]
          },
        ]
      }
      aplicaciones_lotes: {
        Row: {
          aplicacion_id: string
          arboles_clonales: number
          arboles_grandes: number
          arboles_medianos: number
          arboles_pequenos: number
          calibracion_litros_arbol: number | null
          created_at: string | null
          id: string
          lote_id: string
          sublotes_ids: string[] | null
          tamano_caneca: number | null
          total_arboles: number
        }
        Insert: {
          aplicacion_id: string
          arboles_clonales?: number
          arboles_grandes?: number
          arboles_medianos?: number
          arboles_pequenos?: number
          calibracion_litros_arbol?: number | null
          created_at?: string | null
          id?: string
          lote_id: string
          sublotes_ids?: string[] | null
          tamano_caneca?: number | null
          total_arboles?: number
        }
        Update: {
          aplicacion_id?: string
          arboles_clonales?: number
          arboles_grandes?: number
          arboles_medianos?: number
          arboles_pequenos?: number
          calibracion_litros_arbol?: number | null
          created_at?: string | null
          id?: string
          lote_id?: string
          sublotes_ids?: string[] | null
          tamano_caneca?: number | null
          total_arboles?: number
        }
        Relationships: [
          {
            foreignKeyName: "aplicaciones_lotes_aplicacion_fkey"
            columns: ["aplicacion_id"]
            isOneToOne: false
            referencedRelation: "aplicaciones"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "aplicaciones_lotes_lote_fkey"
            columns: ["lote_id"]
            isOneToOne: false
            referencedRelation: "lotes"
            referencedColumns: ["id"]
          },
        ]
      }
      aplicaciones_lotes_planificado: {
        Row: {
          aplicacion_id: string
          calibracion_l_arbol: number | null
          canecas_planificado: number | null
          id: string
          litros_mezcla_planificado: number | null
          lote_id: string
          mezcla_id: string
          tamano_caneca: number | null
        }
        Insert: {
          aplicacion_id: string
          calibracion_l_arbol?: number | null
          canecas_planificado?: number | null
          id?: string
          litros_mezcla_planificado?: number | null
          lote_id: string
          mezcla_id: string
          tamano_caneca?: number | null
        }
        Update: {
          aplicacion_id?: string
          calibracion_l_arbol?: number | null
          canecas_planificado?: number | null
          id?: string
          litros_mezcla_planificado?: number | null
          lote_id?: string
          mezcla_id?: string
          tamano_caneca?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "aplicaciones_lotes_planificado_aplicacion_id_fkey"
            columns: ["aplicacion_id"]
            isOneToOne: false
            referencedRelation: "aplicaciones"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "aplicaciones_lotes_planificado_lote_id_fkey"
            columns: ["lote_id"]
            isOneToOne: false
            referencedRelation: "lotes"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "aplicaciones_lotes_planificado_mezcla_id_fkey"
            columns: ["mezcla_id"]
            isOneToOne: false
            referencedRelation: "aplicaciones_mezclas"
            referencedColumns: ["id"]
          },
        ]
      }
      aplicaciones_mezclas: {
        Row: {
          aplicacion_id: string
          id: string
          nombre_mezcla: string | null
          numero_mezcla: number
        }
        Insert: {
          aplicacion_id: string
          id?: string
          nombre_mezcla?: string | null
          numero_mezcla: number
        }
        Update: {
          aplicacion_id?: string
          id?: string
          nombre_mezcla?: string | null
          numero_mezcla?: number
        }
        Relationships: [
          {
            foreignKeyName: "aplicaciones_mezclas_aplicacion_id_fkey"
            columns: ["aplicacion_id"]
            isOneToOne: false
            referencedRelation: "aplicaciones"
            referencedColumns: ["id"]
          },
        ]
      }
      aplicaciones_productos: {
        Row: {
          cantidad_total_necesaria: number
          created_at: string | null
          dosis_clonales: number | null
          dosis_grandes: number | null
          dosis_medianos: number | null
          dosis_pequenos: number | null
          dosis_por_caneca: number | null
          id: string
          mezcla_id: string
          producto_categoria: string
          producto_id: string
          producto_nombre: string
          producto_unidad: Database["public"]["Enums"]["unidad_medida"]
          unidad_dosis: string | null
        }
        Insert: {
          cantidad_total_necesaria?: number
          created_at?: string | null
          dosis_clonales?: number | null
          dosis_grandes?: number | null
          dosis_medianos?: number | null
          dosis_pequenos?: number | null
          dosis_por_caneca?: number | null
          id?: string
          mezcla_id: string
          producto_categoria: string
          producto_id: string
          producto_nombre: string
          producto_unidad: Database["public"]["Enums"]["unidad_medida"]
          unidad_dosis?: string | null
        }
        Update: {
          cantidad_total_necesaria?: number
          created_at?: string | null
          dosis_clonales?: number | null
          dosis_grandes?: number | null
          dosis_medianos?: number | null
          dosis_pequenos?: number | null
          dosis_por_caneca?: number | null
          id?: string
          mezcla_id?: string
          producto_categoria?: string
          producto_id?: string
          producto_nombre?: string
          producto_unidad?: Database["public"]["Enums"]["unidad_medida"]
          unidad_dosis?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "aplicaciones_productos_mezcla_fkey"
            columns: ["mezcla_id"]
            isOneToOne: false
            referencedRelation: "aplicaciones_mezclas"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "aplicaciones_productos_producto_fkey"
            columns: ["producto_id"]
            isOneToOne: false
            referencedRelation: "productos"
            referencedColumns: ["id"]
          },
        ]
      }
      chat_conversations: {
        Row: {
          created_at: string
          id: string
          title: string | null
          updated_at: string
          user_id: string
        }
        Insert: {
          created_at?: string
          id?: string
          title?: string | null
          updated_at?: string
          user_id: string
        }
        Update: {
          created_at?: string
          id?: string
          title?: string | null
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
      chat_messages: {
        Row: {
          content: string
          conversation_id: string
          created_at: string
          id: string
          metadata: Json | null
          role: string
        }
        Insert: {
          content: string
          conversation_id: string
          created_at?: string
          id?: string
          metadata?: Json | null
          role: string
        }
        Update: {
          content?: string
          conversation_id?: string
          created_at?: string
          id?: string
          metadata?: Json | null
          role?: string
        }
        Relationships: [
          {
            foreignKeyName: "chat_messages_conversation_id_fkey"
            columns: ["conversation_id"]
            isOneToOne: false
            referencedRelation: "chat_conversations"
            referencedColumns: ["id"]
          },
        ]
      }
      clientes: {
        Row: {
          activo: boolean | null
          direccion: string | null
          email: string | null
          id: string
          nit: string | null
          nombre: string
          telefono: string | null
        }
        Insert: {
          activo?: boolean | null
          direccion?: string | null
          email?: string | null
          id?: string
          nit?: string | null
          nombre: string
          telefono?: string | null
        }
        Update: {
          activo?: boolean | null
          direccion?: string | null
          email?: string | null
          id?: string
          nit?: string | null
          nombre?: string
          telefono?: string | null
        }
        Relationships: []
      }
      compras: {
        Row: {
          cantidad: number
          costo_total: number
          costo_unitario: number
          created_at: string | null
          fecha_compra: string
          fecha_vencimiento: string | null
          id: string
          link_factura: string | null
          numero_factura: string | null
          numero_lote_producto: string | null
          producto_id: string
          proveedor: string
          proveedor_id: string | null
          unidad: Database["public"]["Enums"]["unidad_medida"]
          updated_at: string | null
          updated_by: string | null
          url_factura: string | null
          usuario_registro: string | null
        }
        Insert: {
          cantidad: number
          costo_total: number
          costo_unitario: number
          created_at?: string | null
          fecha_compra: string
          fecha_vencimiento?: string | null
          id?: string
          link_factura?: string | null
          numero_factura?: string | null
          numero_lote_producto?: string | null
          producto_id: string
          proveedor: string
          proveedor_id?: string | null
          unidad: Database["public"]["Enums"]["unidad_medida"]
          updated_at?: string | null
          updated_by?: string | null
          url_factura?: string | null
          usuario_registro?: string | null
        }
        Update: {
          cantidad?: number
          costo_total?: number
          costo_unitario?: number
          created_at?: string | null
          fecha_compra?: string
          fecha_vencimiento?: string | null
          id?: string
          link_factura?: string | null
          numero_factura?: string | null
          numero_lote_producto?: string | null
          producto_id?: string
          proveedor?: string
          proveedor_id?: string | null
          unidad?: Database["public"]["Enums"]["unidad_medida"]
          updated_at?: string | null
          updated_by?: string | null
          url_factura?: string | null
          usuario_registro?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "compras_producto_id_fkey"
            columns: ["producto_id"]
            isOneToOne: false
            referencedRelation: "productos"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "compras_proveedor_id_fkey"
            columns: ["proveedor_id"]
            isOneToOne: false
            referencedRelation: "fin_proveedores"
            referencedColumns: ["id"]
          },
        ]
      }
      contratistas: {
        Row: {
          cedula: string | null
          created_at: string | null
          estado: string | null
          fecha_fin: string | null
          fecha_inicio: string | null
          id: string
          nombre: string
          observaciones: string | null
          tarifa_jornal: number
          telefono: string | null
          tipo_contrato: string
          updated_at: string | null
        }
        Insert: {
          cedula?: string | null
          created_at?: string | null
          estado?: string | null
          fecha_fin?: string | null
          fecha_inicio?: string | null
          id?: string
          nombre: string
          observaciones?: string | null
          tarifa_jornal: number
          telefono?: string | null
          tipo_contrato: string
          updated_at?: string | null
        }
        Update: {
          cedula?: string | null
          created_at?: string | null
          estado?: string | null
          fecha_fin?: string | null
          fecha_inicio?: string | null
          id?: string
          nombre?: string
          observaciones?: string | null
          tarifa_jornal?: number
          telefono?: string | null
          tipo_contrato?: string
          updated_at?: string | null
        }
        Relationships: []
      }
      cosechas: {
        Row: {
          created_at: string | null
          fecha_cosecha: string
          id: string
          kilos_cosechados: number
          lote_id: string
          numero_canastillas: number | null
          observaciones: string | null
          responsables: string | null
          sublote_id: string | null
        }
        Insert: {
          created_at?: string | null
          fecha_cosecha: string
          id?: string
          kilos_cosechados: number
          lote_id: string
          numero_canastillas?: number | null
          observaciones?: string | null
          responsables?: string | null
          sublote_id?: string | null
        }
        Update: {
          created_at?: string | null
          fecha_cosecha?: string
          id?: string
          kilos_cosechados?: number
          lote_id?: string
          numero_canastillas?: number | null
          observaciones?: string | null
          responsables?: string | null
          sublote_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "cosechas_lote_id_fkey"
            columns: ["lote_id"]
            isOneToOne: false
            referencedRelation: "lotes"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "cosechas_sublote_id_fkey"
            columns: ["sublote_id"]
            isOneToOne: false
            referencedRelation: "sublotes"
            referencedColumns: ["id"]
          },
        ]
      }
      despachos: {
        Row: {
          cliente_id: string
          created_at: string | null
          fecha_despacho: string
          id: string
          kilos_despachados: number
          numero_factura: string | null
          numero_guia: string | null
          observaciones: string | null
          precio_por_kilo: number
          responsable: string | null
          valor_total: number | null
        }
        Insert: {
          cliente_id: string
          created_at?: string | null
          fecha_despacho: string
          id?: string
          kilos_despachados: number
          numero_factura?: string | null
          numero_guia?: string | null
          observaciones?: string | null
          precio_por_kilo: number
          responsable?: string | null
          valor_total?: number | null
        }
        Update: {
          cliente_id?: string
          created_at?: string | null
          fecha_despacho?: string
          id?: string
          kilos_despachados?: number
          numero_factura?: string | null
          numero_guia?: string | null
          observaciones?: string | null
          precio_por_kilo?: number
          responsable?: string | null
          valor_total?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "despachos_cliente_id_fkey"
            columns: ["cliente_id"]
            isOneToOne: false
            referencedRelation: "clientes"
            referencedColumns: ["id"]
          },
        ]
      }
      despachos_trazabilidad: {
        Row: {
          cosecha_id: string
          despacho_id: string
          id: string
          kilos_de_esta_cosecha: number
        }
        Insert: {
          cosecha_id: string
          despacho_id: string
          id?: string
          kilos_de_esta_cosecha: number
        }
        Update: {
          cosecha_id?: string
          despacho_id?: string
          id?: string
          kilos_de_esta_cosecha?: number
        }
        Relationships: [
          {
            foreignKeyName: "despachos_trazabilidad_cosecha_id_fkey"
            columns: ["cosecha_id"]
            isOneToOne: false
            referencedRelation: "cosechas"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "despachos_trazabilidad_despacho_id_fkey"
            columns: ["despacho_id"]
            isOneToOne: false
            referencedRelation: "despachos"
            referencedColumns: ["id"]
          },
        ]
      }
      empleados: {
        Row: {
          auxilios_no_salariales: number | null
          banco: string | null
          cargo: string | null
          cedula: string | null
          created_at: string | null
          created_by: string | null
          email: string | null
          estado: Database["public"]["Enums"]["estado_empleado"] | null
          fecha_fin_contrato: string | null
          fecha_inicio_contrato: string | null
          horas_semanales: number | null
          id: string
          medio_pago: Database["public"]["Enums"]["medio_pago"] | null
          nombre: string
          numero_cuenta: string | null
          periodicidad_pago:
            | Database["public"]["Enums"]["periodicidad_pago"]
            | null
          prestaciones_sociales: number | null
          salario: number | null
          telefono: string | null
          tipo_contrato: Database["public"]["Enums"]["tipo_contrato"] | null
          updated_at: string | null
          updated_by: string | null
        }
        Insert: {
          auxilios_no_salariales?: number | null
          banco?: string | null
          cargo?: string | null
          cedula?: string | null
          created_at?: string | null
          created_by?: string | null
          email?: string | null
          estado?: Database["public"]["Enums"]["estado_empleado"] | null
          fecha_fin_contrato?: string | null
          fecha_inicio_contrato?: string | null
          horas_semanales?: number | null
          id?: string
          medio_pago?: Database["public"]["Enums"]["medio_pago"] | null
          nombre: string
          numero_cuenta?: string | null
          periodicidad_pago?:
            | Database["public"]["Enums"]["periodicidad_pago"]
            | null
          prestaciones_sociales?: number | null
          salario?: number | null
          telefono?: string | null
          tipo_contrato?: Database["public"]["Enums"]["tipo_contrato"] | null
          updated_at?: string | null
          updated_by?: string | null
        }
        Update: {
          auxilios_no_salariales?: number | null
          banco?: string | null
          cargo?: string | null
          cedula?: string | null
          created_at?: string | null
          created_by?: string | null
          email?: string | null
          estado?: Database["public"]["Enums"]["estado_empleado"] | null
          fecha_fin_contrato?: string | null
          fecha_inicio_contrato?: string | null
          horas_semanales?: number | null
          id?: string
          medio_pago?: Database["public"]["Enums"]["medio_pago"] | null
          nombre?: string
          numero_cuenta?: string | null
          periodicidad_pago?:
            | Database["public"]["Enums"]["periodicidad_pago"]
            | null
          prestaciones_sociales?: number | null
          salario?: number | null
          telefono?: string | null
          tipo_contrato?: Database["public"]["Enums"]["tipo_contrato"] | null
          updated_at?: string | null
          updated_by?: string | null
        }
        Relationships: []
      }
      fin_categorias_gastos: {
        Row: {
          activo: boolean | null
          created_at: string | null
          id: string
          nombre: string
          orden: number | null
          updated_at: string | null
        }
        Insert: {
          activo?: boolean | null
          created_at?: string | null
          id?: string
          nombre: string
          orden?: number | null
          updated_at?: string | null
        }
        Update: {
          activo?: boolean | null
          created_at?: string | null
          id?: string
          nombre?: string
          orden?: number | null
          updated_at?: string | null
        }
        Relationships: []
      }
      fin_categorias_ingresos: {
        Row: {
          activo: boolean | null
          created_at: string | null
          id: string
          negocio_id: string
          nombre: string
          updated_at: string | null
        }
        Insert: {
          activo?: boolean | null
          created_at?: string | null
          id?: string
          negocio_id: string
          nombre: string
          updated_at?: string | null
        }
        Update: {
          activo?: boolean | null
          created_at?: string | null
          id?: string
          negocio_id?: string
          nombre?: string
          updated_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "fin_categorias_ingresos_negocio_fkey"
            columns: ["negocio_id"]
            isOneToOne: false
            referencedRelation: "fin_negocios"
            referencedColumns: ["id"]
          },
        ]
      }
      fin_compradores: {
        Row: {
          activo: boolean | null
          created_at: string | null
          created_by: string | null
          email: string | null
          id: string
          nit: string | null
          nombre: string
          telefono: string | null
          updated_at: string | null
          updated_by: string | null
        }
        Insert: {
          activo?: boolean | null
          created_at?: string | null
          created_by?: string | null
          email?: string | null
          id?: string
          nit?: string | null
          nombre: string
          telefono?: string | null
          updated_at?: string | null
          updated_by?: string | null
        }
        Update: {
          activo?: boolean | null
          created_at?: string | null
          created_by?: string | null
          email?: string | null
          id?: string
          nit?: string | null
          nombre?: string
          telefono?: string | null
          updated_at?: string | null
          updated_by?: string | null
        }
        Relationships: []
      }
      fin_conceptos_gastos: {
        Row: {
          activo: boolean | null
          categoria_id: string
          created_at: string | null
          id: string
          nombre: string
          updated_at: string | null
        }
        Insert: {
          activo?: boolean | null
          categoria_id: string
          created_at?: string | null
          id?: string
          nombre: string
          updated_at?: string | null
        }
        Update: {
          activo?: boolean | null
          categoria_id?: string
          created_at?: string | null
          id?: string
          nombre?: string
          updated_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "fin_conceptos_gastos_categoria_fkey"
            columns: ["categoria_id"]
            isOneToOne: false
            referencedRelation: "fin_categorias_gastos"
            referencedColumns: ["id"]
          },
        ]
      }
      fin_gastos: {
        Row: {
          categoria_id: string
          compra_id: string | null
          concepto_id: string
          created_at: string | null
          created_by: string | null
          estado: string | null
          fecha: string
          id: string
          medio_pago_id: string
          negocio_id: string
          nombre: string
          observaciones: string | null
          proveedor_id: string | null
          region_id: string
          updated_at: string | null
          updated_by: string | null
          url_factura: string | null
          valor: number
        }
        Insert: {
          categoria_id: string
          compra_id?: string | null
          concepto_id: string
          created_at?: string | null
          created_by?: string | null
          estado?: string | null
          fecha: string
          id?: string
          medio_pago_id: string
          negocio_id: string
          nombre: string
          observaciones?: string | null
          proveedor_id?: string | null
          region_id: string
          updated_at?: string | null
          updated_by?: string | null
          url_factura?: string | null
          valor: number
        }
        Update: {
          categoria_id?: string
          compra_id?: string | null
          concepto_id?: string
          created_at?: string | null
          created_by?: string | null
          estado?: string | null
          fecha?: string
          id?: string
          medio_pago_id?: string
          negocio_id?: string
          nombre?: string
          observaciones?: string | null
          proveedor_id?: string | null
          region_id?: string
          updated_at?: string | null
          updated_by?: string | null
          url_factura?: string | null
          valor?: number
        }
        Relationships: [
          {
            foreignKeyName: "fin_gastos_categoria_fkey"
            columns: ["categoria_id"]
            isOneToOne: false
            referencedRelation: "fin_categorias_gastos"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "fin_gastos_compra_fkey"
            columns: ["compra_id"]
            isOneToOne: false
            referencedRelation: "compras"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "fin_gastos_concepto_fkey"
            columns: ["concepto_id"]
            isOneToOne: false
            referencedRelation: "fin_conceptos_gastos"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "fin_gastos_medio_pago_fkey"
            columns: ["medio_pago_id"]
            isOneToOne: false
            referencedRelation: "fin_medios_pago"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "fin_gastos_negocio_fkey"
            columns: ["negocio_id"]
            isOneToOne: false
            referencedRelation: "fin_negocios"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "fin_gastos_proveedor_fkey"
            columns: ["proveedor_id"]
            isOneToOne: false
            referencedRelation: "fin_proveedores"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "fin_gastos_region_fkey"
            columns: ["region_id"]
            isOneToOne: false
            referencedRelation: "fin_regiones"
            referencedColumns: ["id"]
          },
        ]
      }
      fin_ingresos: {
        Row: {
          alianza: string | null
          cantidad: number | null
          categoria_id: string
          cliente: string | null
          comprador_id: string | null
          cosecha: string | null
          created_at: string | null
          created_by: string | null
          fecha: string
          finca: string | null
          id: string
          medio_pago_id: string
          negocio_id: string
          nombre: string
          observaciones: string | null
          precio_unitario: number | null
          region_id: string
          updated_at: string | null
          updated_by: string | null
          url_factura: string | null
          valor: number
        }
        Insert: {
          alianza?: string | null
          cantidad?: number | null
          categoria_id: string
          cliente?: string | null
          comprador_id?: string | null
          cosecha?: string | null
          created_at?: string | null
          created_by?: string | null
          fecha: string
          finca?: string | null
          id?: string
          medio_pago_id: string
          negocio_id: string
          nombre: string
          observaciones?: string | null
          precio_unitario?: number | null
          region_id: string
          updated_at?: string | null
          updated_by?: string | null
          url_factura?: string | null
          valor: number
        }
        Update: {
          alianza?: string | null
          cantidad?: number | null
          categoria_id?: string
          cliente?: string | null
          comprador_id?: string | null
          cosecha?: string | null
          created_at?: string | null
          created_by?: string | null
          fecha?: string
          finca?: string | null
          id?: string
          medio_pago_id?: string
          negocio_id?: string
          nombre?: string
          observaciones?: string | null
          precio_unitario?: number | null
          region_id?: string
          updated_at?: string | null
          updated_by?: string | null
          url_factura?: string | null
          valor?: number
        }
        Relationships: [
          {
            foreignKeyName: "fin_ingresos_categoria_fkey"
            columns: ["categoria_id"]
            isOneToOne: false
            referencedRelation: "fin_categorias_ingresos"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "fin_ingresos_comprador_fkey"
            columns: ["comprador_id"]
            isOneToOne: false
            referencedRelation: "fin_compradores"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "fin_ingresos_medio_pago_fkey"
            columns: ["medio_pago_id"]
            isOneToOne: false
            referencedRelation: "fin_medios_pago"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "fin_ingresos_negocio_fkey"
            columns: ["negocio_id"]
            isOneToOne: false
            referencedRelation: "fin_negocios"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "fin_ingresos_region_fkey"
            columns: ["region_id"]
            isOneToOne: false
            referencedRelation: "fin_regiones"
            referencedColumns: ["id"]
          },
        ]
      }
      fin_medios_pago: {
        Row: {
          activo: boolean | null
          created_at: string | null
          descripcion: string | null
          id: string
          nombre: string
          updated_at: string | null
        }
        Insert: {
          activo?: boolean | null
          created_at?: string | null
          descripcion?: string | null
          id?: string
          nombre: string
          updated_at?: string | null
        }
        Update: {
          activo?: boolean | null
          created_at?: string | null
          descripcion?: string | null
          id?: string
          nombre?: string
          updated_at?: string | null
        }
        Relationships: []
      }
      fin_negocios: {
        Row: {
          activo: boolean | null
          created_at: string | null
          id: string
          nombre: string
          updated_at: string | null
        }
        Insert: {
          activo?: boolean | null
          created_at?: string | null
          id?: string
          nombre: string
          updated_at?: string | null
        }
        Update: {
          activo?: boolean | null
          created_at?: string | null
          id?: string
          nombre?: string
          updated_at?: string | null
        }
        Relationships: []
      }
      fin_proveedores: {
        Row: {
          activo: boolean | null
          created_at: string | null
          created_by: string | null
          email: string | null
          id: string
          nit: string | null
          nombre: string
          telefono: string | null
          updated_at: string | null
          updated_by: string | null
        }
        Insert: {
          activo?: boolean | null
          created_at?: string | null
          created_by?: string | null
          email?: string | null
          id?: string
          nit?: string | null
          nombre: string
          telefono?: string | null
          updated_at?: string | null
          updated_by?: string | null
        }
        Update: {
          activo?: boolean | null
          created_at?: string | null
          created_by?: string | null
          email?: string | null
          id?: string
          nit?: string | null
          nombre?: string
          telefono?: string | null
          updated_at?: string | null
          updated_by?: string | null
        }
        Relationships: []
      }
      fin_regiones: {
        Row: {
          activo: boolean | null
          created_at: string | null
          id: string
          nombre: string
          updated_at: string | null
        }
        Insert: {
          activo?: boolean | null
          created_at?: string | null
          id?: string
          nombre: string
          updated_at?: string | null
        }
        Update: {
          activo?: boolean | null
          created_at?: string | null
          id?: string
          nombre?: string
          updated_at?: string | null
        }
        Relationships: []
      }
      fin_transacciones_ganado: {
        Row: {
          cantidad_cabezas: number
          cliente_proveedor: string | null
          created_at: string | null
          created_by: string | null
          fecha: string
          finca: string | null
          id: string
          kilos_pagados: number | null
          observaciones: string | null
          precio_kilo: number | null
          tipo: string
          updated_at: string | null
          valor_total: number
        }
        Insert: {
          cantidad_cabezas: number
          cliente_proveedor?: string | null
          created_at?: string | null
          created_by?: string | null
          fecha: string
          finca?: string | null
          id?: string
          kilos_pagados?: number | null
          observaciones?: string | null
          precio_kilo?: number | null
          tipo: string
          updated_at?: string | null
          valor_total: number
        }
        Update: {
          cantidad_cabezas?: number
          cliente_proveedor?: string | null
          created_at?: string | null
          created_by?: string | null
          fecha?: string
          finca?: string | null
          id?: string
          kilos_pagados?: number | null
          observaciones?: string | null
          precio_kilo?: number | null
          tipo?: string
          updated_at?: string | null
          valor_total?: number
        }
        Relationships: []
      }
      focos: {
        Row: {
          aplicacion_id: string | null
          blanco_biologico: string | null
          costo_insumos: number | null
          costo_mano_obra: number | null
          costo_total: number | null
          created_at: string | null
          fecha_aplicacion: string
          id: string
          jornales: number | null
          lote_id: string
          numero_bombas_30l: number | null
          numero_focos: number | null
          observaciones: string | null
          sublote_id: string | null
        }
        Insert: {
          aplicacion_id?: string | null
          blanco_biologico?: string | null
          costo_insumos?: number | null
          costo_mano_obra?: number | null
          costo_total?: number | null
          created_at?: string | null
          fecha_aplicacion: string
          id?: string
          jornales?: number | null
          lote_id: string
          numero_bombas_30l?: number | null
          numero_focos?: number | null
          observaciones?: string | null
          sublote_id?: string | null
        }
        Update: {
          aplicacion_id?: string | null
          blanco_biologico?: string | null
          costo_insumos?: number | null
          costo_mano_obra?: number | null
          costo_total?: number | null
          created_at?: string | null
          fecha_aplicacion?: string
          id?: string
          jornales?: number | null
          lote_id?: string
          numero_bombas_30l?: number | null
          numero_focos?: number | null
          observaciones?: string | null
          sublote_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "focos_aplicacion_id_fkey"
            columns: ["aplicacion_id"]
            isOneToOne: false
            referencedRelation: "aplicaciones"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "focos_lote_id_fkey"
            columns: ["lote_id"]
            isOneToOne: false
            referencedRelation: "lotes"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "focos_sublote_id_fkey"
            columns: ["sublote_id"]
            isOneToOne: false
            referencedRelation: "sublotes"
            referencedColumns: ["id"]
          },
        ]
      }
      focos_productos: {
        Row: {
          costo_producto: number | null
          dosis_por_bomba: number | null
          foco_id: string
          id: string
          producto_id: string
        }
        Insert: {
          costo_producto?: number | null
          dosis_por_bomba?: number | null
          foco_id: string
          id?: string
          producto_id: string
        }
        Update: {
          costo_producto?: number | null
          dosis_por_bomba?: number | null
          foco_id?: string
          id?: string
          producto_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "focos_productos_foco_id_fkey"
            columns: ["foco_id"]
            isOneToOne: false
            referencedRelation: "focos"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "focos_productos_producto_id_fkey"
            columns: ["producto_id"]
            isOneToOne: false
            referencedRelation: "productos"
            referencedColumns: ["id"]
          },
        ]
      }
      kv_store_1ccce916: {
        Row: {
          key: string
          value: Json
        }
        Insert: {
          key: string
          value: Json
        }
        Update: {
          key?: string
          value?: Json
        }
        Relationships: []
      }
      logs_auditoria: {
        Row: {
          accion: string
          datos_antiguos: Json | null
          datos_nuevos: Json | null
          id: string
          registro_id: string | null
          tabla: string
          timestamp: string | null
          usuario_id: string | null
        }
        Insert: {
          accion: string
          datos_antiguos?: Json | null
          datos_nuevos?: Json | null
          id?: string
          registro_id?: string | null
          tabla: string
          timestamp?: string | null
          usuario_id?: string | null
        }
        Update: {
          accion?: string
          datos_antiguos?: Json | null
          datos_nuevos?: Json | null
          id?: string
          registro_id?: string | null
          tabla?: string
          timestamp?: string | null
          usuario_id?: string | null
        }
        Relationships: []
      }
      lotes: {
        Row: {
          activo: boolean | null
          arboles_clonales: number | null
          arboles_grandes: number | null
          arboles_medianos: number | null
          arboles_pequenos: number | null
          area_hectareas: number | null
          fecha_siembra: string | null
          id: string
          nombre: string
          numero_orden: number | null
          total_arboles: number | null
        }
        Insert: {
          activo?: boolean | null
          arboles_clonales?: number | null
          arboles_grandes?: number | null
          arboles_medianos?: number | null
          arboles_pequenos?: number | null
          area_hectareas?: number | null
          fecha_siembra?: string | null
          id?: string
          nombre: string
          numero_orden?: number | null
          total_arboles?: number | null
        }
        Update: {
          activo?: boolean | null
          arboles_clonales?: number | null
          arboles_grandes?: number | null
          arboles_medianos?: number | null
          arboles_pequenos?: number | null
          area_hectareas?: number | null
          fecha_siembra?: string | null
          id?: string
          nombre?: string
          numero_orden?: number | null
          total_arboles?: number | null
        }
        Relationships: []
      }
      monitoreos: {
        Row: {
          arboles_afectados: number
          arboles_monitoreados: number
          created_at: string | null
          fecha_monitoreo: string
          foto_url: string | null
          gravedad_numerica: number | null
          gravedad_texto: Database["public"]["Enums"]["gravedad_texto"] | null
          id: string
          incidencia: number | null
          individuos_encontrados: number
          lote_id: string
          monitor: string | null
          observaciones: string | null
          plaga_enfermedad_id: string
          severidad: number | null
          sublote_id: string | null
        }
        Insert: {
          arboles_afectados: number
          arboles_monitoreados: number
          created_at?: string | null
          fecha_monitoreo: string
          foto_url?: string | null
          gravedad_numerica?: number | null
          gravedad_texto?: Database["public"]["Enums"]["gravedad_texto"] | null
          id?: string
          incidencia?: number | null
          individuos_encontrados: number
          lote_id: string
          monitor?: string | null
          observaciones?: string | null
          plaga_enfermedad_id: string
          severidad?: number | null
          sublote_id?: string | null
        }
        Update: {
          arboles_afectados?: number
          arboles_monitoreados?: number
          created_at?: string | null
          fecha_monitoreo?: string
          foto_url?: string | null
          gravedad_numerica?: number | null
          gravedad_texto?: Database["public"]["Enums"]["gravedad_texto"] | null
          id?: string
          incidencia?: number | null
          individuos_encontrados?: number
          lote_id?: string
          monitor?: string | null
          observaciones?: string | null
          plaga_enfermedad_id?: string
          severidad?: number | null
          sublote_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "monitoreos_lote_id_fkey"
            columns: ["lote_id"]
            isOneToOne: false
            referencedRelation: "lotes"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "monitoreos_plaga_enfermedad_id_fkey"
            columns: ["plaga_enfermedad_id"]
            isOneToOne: false
            referencedRelation: "plagas_enfermedades_catalogo"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "monitoreos_sublote_id_fkey"
            columns: ["sublote_id"]
            isOneToOne: false
            referencedRelation: "sublotes"
            referencedColumns: ["id"]
          },
        ]
      }
      movimientos_diarios: {
        Row: {
          aplicacion_id: string
          condiciones_meteorologicas:
            | Database["public"]["Enums"]["condiciones_meteorologicas"]
            | null
          created_at: string
          created_by: string | null
          equipo_aplicacion: string | null
          fecha_movimiento: string
          hora_fin: string | null
          hora_inicio: string | null
          id: string
          lote_id: string
          lote_nombre: string
          notas: string | null
          numero_bultos: number | null
          numero_canecas: number | null
          personal: string | null
          responsable: string
        }
        Insert: {
          aplicacion_id: string
          condiciones_meteorologicas?:
            | Database["public"]["Enums"]["condiciones_meteorologicas"]
            | null
          created_at?: string
          created_by?: string | null
          equipo_aplicacion?: string | null
          fecha_movimiento: string
          hora_fin?: string | null
          hora_inicio?: string | null
          id?: string
          lote_id: string
          lote_nombre: string
          notas?: string | null
          numero_bultos?: number | null
          numero_canecas?: number | null
          personal?: string | null
          responsable: string
        }
        Update: {
          aplicacion_id?: string
          condiciones_meteorologicas?:
            | Database["public"]["Enums"]["condiciones_meteorologicas"]
            | null
          created_at?: string
          created_by?: string | null
          equipo_aplicacion?: string | null
          fecha_movimiento?: string
          hora_fin?: string | null
          hora_inicio?: string | null
          id?: string
          lote_id?: string
          lote_nombre?: string
          notas?: string | null
          numero_bultos?: number | null
          numero_canecas?: number | null
          personal?: string | null
          responsable?: string
        }
        Relationships: [
          {
            foreignKeyName: "movimientos_diarios_aplicacion_id_fkey"
            columns: ["aplicacion_id"]
            isOneToOne: false
            referencedRelation: "aplicaciones"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "movimientos_diarios_lote_id_fkey"
            columns: ["lote_id"]
            isOneToOne: false
            referencedRelation: "lotes"
            referencedColumns: ["id"]
          },
        ]
      }
      movimientos_diarios_empleados: {
        Row: {
          costo_jornal: number | null
          created_at: string | null
          empleado_id: string
          fraccion_jornal: number
          id: string
          lote_id: string
          movimiento_diario_id: string
          observaciones: string | null
          valor_jornal_empleado: number | null
        }
        Insert: {
          costo_jornal?: number | null
          created_at?: string | null
          empleado_id: string
          fraccion_jornal: number
          id?: string
          lote_id: string
          movimiento_diario_id: string
          observaciones?: string | null
          valor_jornal_empleado?: number | null
        }
        Update: {
          costo_jornal?: number | null
          created_at?: string | null
          empleado_id?: string
          fraccion_jornal?: number
          id?: string
          lote_id?: string
          movimiento_diario_id?: string
          observaciones?: string | null
          valor_jornal_empleado?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "movimientos_diarios_empleados_empleado_id_fkey"
            columns: ["empleado_id"]
            isOneToOne: false
            referencedRelation: "empleados"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "movimientos_diarios_empleados_lote_id_fkey"
            columns: ["lote_id"]
            isOneToOne: false
            referencedRelation: "lotes"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "movimientos_diarios_empleados_movimiento_diario_id_fkey"
            columns: ["movimiento_diario_id"]
            isOneToOne: false
            referencedRelation: "movimientos_diarios"
            referencedColumns: ["id"]
          },
        ]
      }
      movimientos_diarios_productos: {
        Row: {
          cantidad_utilizada: number
          created_at: string | null
          id: string
          movimiento_diario_id: string
          producto_categoria: string
          producto_id: string
          producto_nombre: string
          unidad: Database["public"]["Enums"]["unidad_medida"]
        }
        Insert: {
          cantidad_utilizada: number
          created_at?: string | null
          id?: string
          movimiento_diario_id: string
          producto_categoria: string
          producto_id: string
          producto_nombre: string
          unidad: Database["public"]["Enums"]["unidad_medida"]
        }
        Update: {
          cantidad_utilizada?: number
          created_at?: string | null
          id?: string
          movimiento_diario_id?: string
          producto_categoria?: string
          producto_id?: string
          producto_nombre?: string
          unidad?: Database["public"]["Enums"]["unidad_medida"]
        }
        Relationships: [
          {
            foreignKeyName: "fk_movimiento_diario"
            columns: ["movimiento_diario_id"]
            isOneToOne: false
            referencedRelation: "movimientos_diarios"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "fk_producto"
            columns: ["producto_id"]
            isOneToOne: false
            referencedRelation: "productos"
            referencedColumns: ["id"]
          },
        ]
      }
      movimientos_diarios_trabajadores: {
        Row: {
          contratista_id: string | null
          costo_jornal: number | null
          created_at: string | null
          empleado_id: string | null
          fraccion_jornal: number
          id: string
          lote_id: string
          movimiento_diario_id: string
          observaciones: string | null
          valor_jornal_trabajador: number | null
        }
        Insert: {
          contratista_id?: string | null
          costo_jornal?: number | null
          created_at?: string | null
          empleado_id?: string | null
          fraccion_jornal: number
          id?: string
          lote_id: string
          movimiento_diario_id: string
          observaciones?: string | null
          valor_jornal_trabajador?: number | null
        }
        Update: {
          contratista_id?: string | null
          costo_jornal?: number | null
          created_at?: string | null
          empleado_id?: string | null
          fraccion_jornal?: number
          id?: string
          lote_id?: string
          movimiento_diario_id?: string
          observaciones?: string | null
          valor_jornal_trabajador?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "movimientos_diarios_trabajadores_contratista_id_fkey"
            columns: ["contratista_id"]
            isOneToOne: false
            referencedRelation: "contratistas"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "movimientos_diarios_trabajadores_empleado_id_fkey"
            columns: ["empleado_id"]
            isOneToOne: false
            referencedRelation: "empleados"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "movimientos_diarios_trabajadores_lote_id_fkey"
            columns: ["lote_id"]
            isOneToOne: false
            referencedRelation: "lotes"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "movimientos_diarios_trabajadores_movimiento_diario_id_fkey"
            columns: ["movimiento_diario_id"]
            isOneToOne: false
            referencedRelation: "movimientos_diarios"
            referencedColumns: ["id"]
          },
        ]
      }
      movimientos_inventario: {
        Row: {
          aplicacion_id: string | null
          cantidad: number
          created_at: string | null
          factura: string | null
          fecha_movimiento: string
          id: string
          lote_aplicacion: string | null
          notas: string | null
          observaciones: string | null
          producto_id: string
          provisional: boolean | null
          responsable: string | null
          saldo_anterior: number | null
          saldo_nuevo: number | null
          tipo_movimiento: Database["public"]["Enums"]["tipo_movimiento"]
          unidad: Database["public"]["Enums"]["unidad_medida"]
          valor_movimiento: number | null
        }
        Insert: {
          aplicacion_id?: string | null
          cantidad: number
          created_at?: string | null
          factura?: string | null
          fecha_movimiento: string
          id?: string
          lote_aplicacion?: string | null
          notas?: string | null
          observaciones?: string | null
          producto_id: string
          provisional?: boolean | null
          responsable?: string | null
          saldo_anterior?: number | null
          saldo_nuevo?: number | null
          tipo_movimiento: Database["public"]["Enums"]["tipo_movimiento"]
          unidad: Database["public"]["Enums"]["unidad_medida"]
          valor_movimiento?: number | null
        }
        Update: {
          aplicacion_id?: string | null
          cantidad?: number
          created_at?: string | null
          factura?: string | null
          fecha_movimiento?: string
          id?: string
          lote_aplicacion?: string | null
          notas?: string | null
          observaciones?: string | null
          producto_id?: string
          provisional?: boolean | null
          responsable?: string | null
          saldo_anterior?: number | null
          saldo_nuevo?: number | null
          tipo_movimiento?: Database["public"]["Enums"]["tipo_movimiento"]
          unidad?: Database["public"]["Enums"]["unidad_medida"]
          valor_movimiento?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "fk_movimientos_aplicacion"
            columns: ["aplicacion_id"]
            isOneToOne: false
            referencedRelation: "aplicaciones"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "movimientos_inventario_producto_id_fkey"
            columns: ["producto_id"]
            isOneToOne: false
            referencedRelation: "productos"
            referencedColumns: ["id"]
          },
        ]
      }
      plagas_enfermedades_catalogo: {
        Row: {
          activo: boolean | null
          descripcion: string | null
          id: string
          link_info: string | null
          nombre: string
          tipo: string | null
        }
        Insert: {
          activo?: boolean | null
          descripcion?: string | null
          id?: string
          link_info?: string | null
          nombre: string
          tipo?: string | null
        }
        Update: {
          activo?: boolean | null
          descripcion?: string | null
          id?: string
          link_info?: string | null
          nombre?: string
          tipo?: string | null
        }
        Relationships: []
      }
      preselecciones: {
        Row: {
          cosecha_id: string | null
          created_at: string | null
          fecha_preseleccion: string
          id: string
          kilos_clasificados: number
          kilos_descarte: number
          kilos_sanos: number
          porcentaje_descarte: number | null
          porcentaje_sanos: number | null
          responsable: string | null
        }
        Insert: {
          cosecha_id?: string | null
          created_at?: string | null
          fecha_preseleccion: string
          id?: string
          kilos_clasificados: number
          kilos_descarte: number
          kilos_sanos: number
          porcentaje_descarte?: number | null
          porcentaje_sanos?: number | null
          responsable?: string | null
        }
        Update: {
          cosecha_id?: string | null
          created_at?: string | null
          fecha_preseleccion?: string
          id?: string
          kilos_clasificados?: number
          kilos_descarte?: number
          kilos_sanos?: number
          porcentaje_descarte?: number | null
          porcentaje_sanos?: number | null
          responsable?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "preselecciones_cosecha_id_fkey"
            columns: ["cosecha_id"]
            isOneToOne: false
            referencedRelation: "cosechas"
            referencedColumns: ["id"]
          },
        ]
      }
      produccion: {
        Row: {
          ano: number
          arboles_registrados: number
          cosecha_tipo: string
          created_at: string | null
          id: string
          kg_por_arbol: number | null
          kg_totales: number
          lote_id: string
          observaciones: string | null
          sublote_id: string | null
          updated_at: string | null
        }
        Insert: {
          ano: number
          arboles_registrados: number
          cosecha_tipo: string
          created_at?: string | null
          id?: string
          kg_por_arbol?: number | null
          kg_totales: number
          lote_id: string
          observaciones?: string | null
          sublote_id?: string | null
          updated_at?: string | null
        }
        Update: {
          ano?: number
          arboles_registrados?: number
          cosecha_tipo?: string
          created_at?: string | null
          id?: string
          kg_por_arbol?: number | null
          kg_totales?: number
          lote_id?: string
          observaciones?: string | null
          sublote_id?: string | null
          updated_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "produccion_lote_id_fkey"
            columns: ["lote_id"]
            isOneToOne: false
            referencedRelation: "lotes"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "produccion_sublote_id_fkey"
            columns: ["sublote_id"]
            isOneToOne: false
            referencedRelation: "sublotes"
            referencedColumns: ["id"]
          },
        ]
      }
      productos: {
        Row: {
          activo: boolean | null
          azufre: number | null
          blanco_biologico: string | null
          boro: number | null
          calcio: number | null
          cantidad_actual: number | null
          carbono_organico: number | null
          categoria: Database["public"]["Enums"]["categoria_producto"]
          cobre: number | null
          concentracion_ia_1: number | null
          concentracion_ia_2: number | null
          concentracion_ia_3: number | null
          created_at: string | null
          epp_alto_nivel: boolean | null
          estado: Database["public"]["Enums"]["estado_producto"] | null
          estado_fisico: Database["public"]["Enums"]["estado_fisico"] | null
          fosforo: number | null
          grupo: Database["public"]["Enums"]["grupo_producto"]
          hierro: number | null
          id: string
          ingrediente_activo_1: string | null
          ingrediente_activo_2: string | null
          ingrediente_activo_3: string | null
          link_ficha_tecnica: string | null
          link_hoja_seguridad: string | null
          magnesio: number | null
          manganeso: number | null
          molibdeno: number | null
          nitrogeno: number | null
          nombre: string
          periodo_carencia_dias: number | null
          periodo_reingreso_horas: number | null
          permitido_gerencia: boolean | null
          potasio: number | null
          precio_por_presentacion: number | null
          precio_unitario: number | null
          presentacion_kg_l: number | null
          registro_ica: string | null
          riesgo_acuatico: boolean | null
          riesgo_polinizador: boolean | null
          riesgo_transeunte: boolean | null
          riesgo_vida_silvestre: boolean | null
          silicio: number | null
          sodio: number | null
          stock_minimo: number | null
          tipo_aplicacion:
            | Database["public"]["Enums"]["tipo_aplicacion_producto"]
            | null
          unidad_medida: Database["public"]["Enums"]["unidad_medida"]
          updated_at: string | null
          updated_by: string | null
          zinc: number | null
        }
        Insert: {
          activo?: boolean | null
          azufre?: number | null
          blanco_biologico?: string | null
          boro?: number | null
          calcio?: number | null
          cantidad_actual?: number | null
          carbono_organico?: number | null
          categoria: Database["public"]["Enums"]["categoria_producto"]
          cobre?: number | null
          concentracion_ia_1?: number | null
          concentracion_ia_2?: number | null
          concentracion_ia_3?: number | null
          created_at?: string | null
          epp_alto_nivel?: boolean | null
          estado?: Database["public"]["Enums"]["estado_producto"] | null
          estado_fisico?: Database["public"]["Enums"]["estado_fisico"] | null
          fosforo?: number | null
          grupo: Database["public"]["Enums"]["grupo_producto"]
          hierro?: number | null
          id?: string
          ingrediente_activo_1?: string | null
          ingrediente_activo_2?: string | null
          ingrediente_activo_3?: string | null
          link_ficha_tecnica?: string | null
          link_hoja_seguridad?: string | null
          magnesio?: number | null
          manganeso?: number | null
          molibdeno?: number | null
          nitrogeno?: number | null
          nombre: string
          periodo_carencia_dias?: number | null
          periodo_reingreso_horas?: number | null
          permitido_gerencia?: boolean | null
          potasio?: number | null
          precio_por_presentacion?: number | null
          precio_unitario?: number | null
          presentacion_kg_l?: number | null
          registro_ica?: string | null
          riesgo_acuatico?: boolean | null
          riesgo_polinizador?: boolean | null
          riesgo_transeunte?: boolean | null
          riesgo_vida_silvestre?: boolean | null
          silicio?: number | null
          sodio?: number | null
          stock_minimo?: number | null
          tipo_aplicacion?:
            | Database["public"]["Enums"]["tipo_aplicacion_producto"]
            | null
          unidad_medida: Database["public"]["Enums"]["unidad_medida"]
          updated_at?: string | null
          updated_by?: string | null
          zinc?: number | null
        }
        Update: {
          activo?: boolean | null
          azufre?: number | null
          blanco_biologico?: string | null
          boro?: number | null
          calcio?: number | null
          cantidad_actual?: number | null
          carbono_organico?: number | null
          categoria?: Database["public"]["Enums"]["categoria_producto"]
          cobre?: number | null
          concentracion_ia_1?: number | null
          concentracion_ia_2?: number | null
          concentracion_ia_3?: number | null
          created_at?: string | null
          epp_alto_nivel?: boolean | null
          estado?: Database["public"]["Enums"]["estado_producto"] | null
          estado_fisico?: Database["public"]["Enums"]["estado_fisico"] | null
          fosforo?: number | null
          grupo?: Database["public"]["Enums"]["grupo_producto"]
          hierro?: number | null
          id?: string
          ingrediente_activo_1?: string | null
          ingrediente_activo_2?: string | null
          ingrediente_activo_3?: string | null
          link_ficha_tecnica?: string | null
          link_hoja_seguridad?: string | null
          magnesio?: number | null
          manganeso?: number | null
          molibdeno?: number | null
          nitrogeno?: number | null
          nombre?: string
          periodo_carencia_dias?: number | null
          periodo_reingreso_horas?: number | null
          permitido_gerencia?: boolean | null
          potasio?: number | null
          precio_por_presentacion?: number | null
          precio_unitario?: number | null
          presentacion_kg_l?: number | null
          registro_ica?: string | null
          riesgo_acuatico?: boolean | null
          riesgo_polinizador?: boolean | null
          riesgo_transeunte?: boolean | null
          riesgo_vida_silvestre?: boolean | null
          silicio?: number | null
          sodio?: number | null
          stock_minimo?: number | null
          tipo_aplicacion?:
            | Database["public"]["Enums"]["tipo_aplicacion_producto"]
            | null
          unidad_medida?: Database["public"]["Enums"]["unidad_medida"]
          updated_at?: string | null
          updated_by?: string | null
          zinc?: number | null
        }
        Relationships: []
      }
      registros_trabajo: {
        Row: {
          contratista_id: string | null
          costo_jornal: number | null
          created_at: string | null
          empleado_id: string | null
          fecha_trabajo: string
          fraccion_jornal: Database["public"]["Enums"]["fraccion_jornal"]
          id: string
          lote_id: string | null
          observaciones: string | null
          registrado_por: string | null
          tarea_id: string
          updated_at: string | null
          valor_jornal_empleado: number | null
        }
        Insert: {
          contratista_id?: string | null
          costo_jornal?: number | null
          created_at?: string | null
          empleado_id?: string | null
          fecha_trabajo: string
          fraccion_jornal: Database["public"]["Enums"]["fraccion_jornal"]
          id?: string
          lote_id?: string | null
          observaciones?: string | null
          registrado_por?: string | null
          tarea_id: string
          updated_at?: string | null
          valor_jornal_empleado?: number | null
        }
        Update: {
          contratista_id?: string | null
          costo_jornal?: number | null
          created_at?: string | null
          empleado_id?: string | null
          fecha_trabajo?: string
          fraccion_jornal?: Database["public"]["Enums"]["fraccion_jornal"]
          id?: string
          lote_id?: string | null
          observaciones?: string | null
          registrado_por?: string | null
          tarea_id?: string
          updated_at?: string | null
          valor_jornal_empleado?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "registros_trabajo_contratista_id_fkey"
            columns: ["contratista_id"]
            isOneToOne: false
            referencedRelation: "contratistas"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "registros_trabajo_empleado_fkey"
            columns: ["empleado_id"]
            isOneToOne: false
            referencedRelation: "empleados"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "registros_trabajo_lote_id_fkey"
            columns: ["lote_id"]
            isOneToOne: false
            referencedRelation: "lotes"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "registros_trabajo_tarea_fkey"
            columns: ["tarea_id"]
            isOneToOne: false
            referencedRelation: "tareas"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "registros_trabajo_tarea_fkey"
            columns: ["tarea_id"]
            isOneToOne: false
            referencedRelation: "vista_tareas_resumen"
            referencedColumns: ["id"]
          },
        ]
      }
      reportes_semanales: {
        Row: {
          ano: number
          created_at: string | null
          datos_entrada: Json | null
          fecha_fin: string
          fecha_inicio: string
          generado_automaticamente: boolean | null
          generado_por: string | null
          html_storage: string | null
          id: string
          numero_semana: number
          url_storage: string | null
        }
        Insert: {
          ano: number
          created_at?: string | null
          datos_entrada?: Json | null
          fecha_fin: string
          fecha_inicio: string
          generado_automaticamente?: boolean | null
          generado_por?: string | null
          html_storage?: string | null
          id?: string
          numero_semana: number
          url_storage?: string | null
        }
        Update: {
          ano?: number
          created_at?: string | null
          datos_entrada?: Json | null
          fecha_fin?: string
          fecha_inicio?: string
          generado_automaticamente?: boolean | null
          generado_por?: string | null
          html_storage?: string | null
          id?: string
          numero_semana?: number
          url_storage?: string | null
        }
        Relationships: []
      }
      sublotes: {
        Row: {
          arboles_clonales: number | null
          arboles_grandes: number | null
          arboles_medianos: number | null
          arboles_pequenos: number | null
          id: string
          lote_id: string
          nombre: string
          numero_sublote: number | null
          total_arboles: number | null
        }
        Insert: {
          arboles_clonales?: number | null
          arboles_grandes?: number | null
          arboles_medianos?: number | null
          arboles_pequenos?: number | null
          id?: string
          lote_id: string
          nombre: string
          numero_sublote?: number | null
          total_arboles?: number | null
        }
        Update: {
          arboles_clonales?: number | null
          arboles_grandes?: number | null
          arboles_medianos?: number | null
          arboles_pequenos?: number | null
          id?: string
          lote_id?: string
          nombre?: string
          numero_sublote?: number | null
          total_arboles?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "sublotes_lote_id_fkey"
            columns: ["lote_id"]
            isOneToOne: false
            referencedRelation: "lotes"
            referencedColumns: ["id"]
          },
        ]
      }
      tareas: {
        Row: {
          codigo_tarea: string | null
          created_at: string | null
          created_by: string | null
          descripcion: string | null
          estado: Database["public"]["Enums"]["estado_tarea"] | null
          fecha_estimada_fin: string | null
          fecha_estimada_inicio: string | null
          fecha_fin_real: string | null
          fecha_inicio_real: string | null
          id: string
          jornales_estimados: number | null
          lote_id: string | null
          lote_ids: string[] | null
          nombre: string
          observaciones: string | null
          prioridad: Database["public"]["Enums"]["prioridad_tarea"] | null
          responsable_id: string | null
          sublote_id: string | null
          tipo_tarea_id: string | null
          updated_at: string | null
          updated_by: string | null
        }
        Insert: {
          codigo_tarea?: string | null
          created_at?: string | null
          created_by?: string | null
          descripcion?: string | null
          estado?: Database["public"]["Enums"]["estado_tarea"] | null
          fecha_estimada_fin?: string | null
          fecha_estimada_inicio?: string | null
          fecha_fin_real?: string | null
          fecha_inicio_real?: string | null
          id?: string
          jornales_estimados?: number | null
          lote_id?: string | null
          lote_ids?: string[] | null
          nombre: string
          observaciones?: string | null
          prioridad?: Database["public"]["Enums"]["prioridad_tarea"] | null
          responsable_id?: string | null
          sublote_id?: string | null
          tipo_tarea_id?: string | null
          updated_at?: string | null
          updated_by?: string | null
        }
        Update: {
          codigo_tarea?: string | null
          created_at?: string | null
          created_by?: string | null
          descripcion?: string | null
          estado?: Database["public"]["Enums"]["estado_tarea"] | null
          fecha_estimada_fin?: string | null
          fecha_estimada_inicio?: string | null
          fecha_fin_real?: string | null
          fecha_inicio_real?: string | null
          id?: string
          jornales_estimados?: number | null
          lote_id?: string | null
          lote_ids?: string[] | null
          nombre?: string
          observaciones?: string | null
          prioridad?: Database["public"]["Enums"]["prioridad_tarea"] | null
          responsable_id?: string | null
          sublote_id?: string | null
          tipo_tarea_id?: string | null
          updated_at?: string | null
          updated_by?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "tareas_lote_fkey"
            columns: ["lote_id"]
            isOneToOne: false
            referencedRelation: "lotes"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "tareas_responsable_fkey"
            columns: ["responsable_id"]
            isOneToOne: false
            referencedRelation: "empleados"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "tareas_sublote_fkey"
            columns: ["sublote_id"]
            isOneToOne: false
            referencedRelation: "sublotes"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "tareas_tipo_tarea_fkey"
            columns: ["tipo_tarea_id"]
            isOneToOne: false
            referencedRelation: "tipos_tareas"
            referencedColumns: ["id"]
          },
        ]
      }
      tareas_lotes: {
        Row: {
          created_at: string | null
          id: string
          lote_id: string | null
          tarea_id: string | null
        }
        Insert: {
          created_at?: string | null
          id?: string
          lote_id?: string | null
          tarea_id?: string | null
        }
        Update: {
          created_at?: string | null
          id?: string
          lote_id?: string | null
          tarea_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "tareas_lotes_lote_id_fkey"
            columns: ["lote_id"]
            isOneToOne: false
            referencedRelation: "lotes"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "tareas_lotes_tarea_id_fkey"
            columns: ["tarea_id"]
            isOneToOne: false
            referencedRelation: "tareas"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "tareas_lotes_tarea_id_fkey"
            columns: ["tarea_id"]
            isOneToOne: false
            referencedRelation: "vista_tareas_resumen"
            referencedColumns: ["id"]
          },
        ]
      }
      telegram_conversations: {
        Row: {
          key: string
          session: Json
        }
        Insert: {
          key: string
          session: Json
        }
        Update: {
          key?: string
          session?: Json
        }
        Relationships: []
      }
      telegram_mensajes: {
        Row: {
          contenido: Json
          created_at: string | null
          direccion: string
          flujo: string | null
          id: string
          telegram_id: number
          telegram_usuario_id: string | null
          tipo_mensaje: string
        }
        Insert: {
          contenido: Json
          created_at?: string | null
          direccion: string
          flujo?: string | null
          id?: string
          telegram_id: number
          telegram_usuario_id?: string | null
          tipo_mensaje: string
        }
        Update: {
          contenido?: Json
          created_at?: string | null
          direccion?: string
          flujo?: string | null
          id?: string
          telegram_id?: number
          telegram_usuario_id?: string | null
          tipo_mensaje?: string
        }
        Relationships: [
          {
            foreignKeyName: "telegram_mensajes_telegram_usuario_id_fkey"
            columns: ["telegram_usuario_id"]
            isOneToOne: false
            referencedRelation: "telegram_usuarios"
            referencedColumns: ["id"]
          },
        ]
      }
      telegram_sessions: {
        Row: {
          key: string
          session: Json
        }
        Insert: {
          key: string
          session: Json
        }
        Update: {
          key?: string
          session?: Json
        }
        Relationships: []
      }
      telegram_usuarios: {
        Row: {
          activo: boolean | null
          codigo_expira_at: string | null
          codigo_vinculacion: string | null
          contratista_id: string | null
          created_at: string | null
          empleado_id: string | null
          id: string
          modulos_permitidos: string[] | null
          nombre_display: string
          rol_bot: string
          telegram_id: number | null
          telegram_username: string | null
          updated_at: string | null
          usuario_id: string | null
        }
        Insert: {
          activo?: boolean | null
          codigo_expira_at?: string | null
          codigo_vinculacion?: string | null
          contratista_id?: string | null
          created_at?: string | null
          empleado_id?: string | null
          id?: string
          modulos_permitidos?: string[] | null
          nombre_display: string
          rol_bot?: string
          telegram_id?: number | null
          telegram_username?: string | null
          updated_at?: string | null
          usuario_id?: string | null
        }
        Update: {
          activo?: boolean | null
          codigo_expira_at?: string | null
          codigo_vinculacion?: string | null
          contratista_id?: string | null
          created_at?: string | null
          empleado_id?: string | null
          id?: string
          modulos_permitidos?: string[] | null
          nombre_display?: string
          rol_bot?: string
          telegram_id?: number | null
          telegram_username?: string | null
          updated_at?: string | null
          usuario_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "telegram_usuarios_contratista_id_fkey"
            columns: ["contratista_id"]
            isOneToOne: false
            referencedRelation: "contratistas"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "telegram_usuarios_empleado_id_fkey"
            columns: ["empleado_id"]
            isOneToOne: false
            referencedRelation: "empleados"
            referencedColumns: ["id"]
          },
        ]
      }
      tipos_tareas: {
        Row: {
          activo: boolean | null
          categoria: Database["public"]["Enums"]["categoria_tarea"]
          created_at: string | null
          created_by: string | null
          descripcion: string | null
          id: string
          nombre: string
          updated_at: string | null
          updated_by: string | null
        }
        Insert: {
          activo?: boolean | null
          categoria: Database["public"]["Enums"]["categoria_tarea"]
          created_at?: string | null
          created_by?: string | null
          descripcion?: string | null
          id?: string
          nombre: string
          updated_at?: string | null
          updated_by?: string | null
        }
        Update: {
          activo?: boolean | null
          categoria?: Database["public"]["Enums"]["categoria_tarea"]
          created_at?: string | null
          created_by?: string | null
          descripcion?: string | null
          id?: string
          nombre?: string
          updated_at?: string | null
          updated_by?: string | null
        }
        Relationships: []
      }
      usuarios: {
        Row: {
          activo: boolean | null
          created_at: string | null
          email: string
          id: string
          last_login: string | null
          nombre_completo: string | null
          rol: Database["public"]["Enums"]["rol_usuario"]
        }
        Insert: {
          activo?: boolean | null
          created_at?: string | null
          email: string
          id: string
          last_login?: string | null
          nombre_completo?: string | null
          rol: Database["public"]["Enums"]["rol_usuario"]
        }
        Update: {
          activo?: boolean | null
          created_at?: string | null
          email?: string
          id?: string
          last_login?: string | null
          nombre_completo?: string | null
          rol?: Database["public"]["Enums"]["rol_usuario"]
        }
        Relationships: []
      }
      verificaciones_detalle: {
        Row: {
          ajuste_realizado: boolean | null
          aprobado: boolean | null
          cantidad_fisica: number | null
          cantidad_teorica: number | null
          contado: boolean | null
          created_at: string | null
          diferencia: number | null
          estado_diferencia: string | null
          id: string
          observaciones: string | null
          porcentaje_diferencia: number | null
          producto_id: string
          updated_at: string | null
          valor_diferencia: number | null
          verificacion_id: string
        }
        Insert: {
          ajuste_realizado?: boolean | null
          aprobado?: boolean | null
          cantidad_fisica?: number | null
          cantidad_teorica?: number | null
          contado?: boolean | null
          created_at?: string | null
          diferencia?: number | null
          estado_diferencia?: string | null
          id?: string
          observaciones?: string | null
          porcentaje_diferencia?: number | null
          producto_id: string
          updated_at?: string | null
          valor_diferencia?: number | null
          verificacion_id: string
        }
        Update: {
          ajuste_realizado?: boolean | null
          aprobado?: boolean | null
          cantidad_fisica?: number | null
          cantidad_teorica?: number | null
          contado?: boolean | null
          created_at?: string | null
          diferencia?: number | null
          estado_diferencia?: string | null
          id?: string
          observaciones?: string | null
          porcentaje_diferencia?: number | null
          producto_id?: string
          updated_at?: string | null
          valor_diferencia?: number | null
          verificacion_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "verificaciones_detalle_producto_id_fkey"
            columns: ["producto_id"]
            isOneToOne: false
            referencedRelation: "productos"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "verificaciones_detalle_verificacion_id_fkey"
            columns: ["verificacion_id"]
            isOneToOne: false
            referencedRelation: "verificaciones_inventario"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "verificaciones_detalle_verificacion_id_fkey"
            columns: ["verificacion_id"]
            isOneToOne: false
            referencedRelation: "vista_resumen_verificaciones"
            referencedColumns: ["id"]
          },
        ]
      }
      verificaciones_inventario: {
        Row: {
          created_at: string | null
          estado: Database["public"]["Enums"]["estado_verificacion"] | null
          fecha_completada: string | null
          fecha_fin: string | null
          fecha_inicio: string
          fecha_revision: string | null
          id: string
          motivo_rechazo: string | null
          observaciones_generales: string | null
          revisada_por: string | null
          updated_at: string | null
          usuario_verificador: string | null
        }
        Insert: {
          created_at?: string | null
          estado?: Database["public"]["Enums"]["estado_verificacion"] | null
          fecha_completada?: string | null
          fecha_fin?: string | null
          fecha_inicio: string
          fecha_revision?: string | null
          id?: string
          motivo_rechazo?: string | null
          observaciones_generales?: string | null
          revisada_por?: string | null
          updated_at?: string | null
          usuario_verificador?: string | null
        }
        Update: {
          created_at?: string | null
          estado?: Database["public"]["Enums"]["estado_verificacion"] | null
          fecha_completada?: string | null
          fecha_fin?: string | null
          fecha_inicio?: string
          fecha_revision?: string | null
          id?: string
          motivo_rechazo?: string | null
          observaciones_generales?: string | null
          revisada_por?: string | null
          updated_at?: string | null
          usuario_verificador?: string | null
        }
        Relationships: []
      }
    }
    Views: {
      v_gastos_completos: {
        Row: {
          categoria: string | null
          compra_id: string | null
          concepto: string | null
          creado_por: string | null
          created_at: string | null
          descripcion: string | null
          estado: string | null
          fecha: string | null
          id: string | null
          medio_pago: string | null
          negocio: string | null
          observaciones: string | null
          proveedor: string | null
          region: string | null
          valor: number | null
        }
        Relationships: [
          {
            foreignKeyName: "fin_gastos_compra_fkey"
            columns: ["compra_id"]
            isOneToOne: false
            referencedRelation: "compras"
            referencedColumns: ["id"]
          },
        ]
      }
      v_ingresos_completos: {
        Row: {
          categoria: string | null
          comprador: string | null
          creado_por: string | null
          created_at: string | null
          descripcion: string | null
          fecha: string | null
          id: string | null
          medio_pago: string | null
          negocio: string | null
          observaciones: string | null
          region: string | null
          valor: number | null
        }
        Relationships: []
      }
      v_resumen_financiero_mes: {
        Row: {
          flujo_neto: number | null
          mes: string | null
          negocio: string | null
          total_gastos: number | null
          total_ingresos: number | null
        }
        Relationships: []
      }
      vista_resumen_verificaciones: {
        Row: {
          created_at: string | null
          estado: Database["public"]["Enums"]["estado_verificacion"] | null
          fecha_fin: string | null
          fecha_inicio: string | null
          fecha_revision: string | null
          id: string | null
          motivo_rechazo: string | null
          observaciones_generales: string | null
          porcentaje_completado: number | null
          productos_aprobados: number | null
          productos_contados: number | null
          productos_diferencia: number | null
          productos_ok: number | null
          revisada_por: string | null
          total_productos: number | null
          updated_at: string | null
          usuario_verificador: string | null
          valor_total_diferencias: number | null
        }
        Relationships: []
      }
      vista_tareas_resumen: {
        Row: {
          codigo_tarea: string | null
          costo_total: number | null
          created_at: string | null
          created_by: string | null
          descripcion: string | null
          dias_trabajados: number | null
          estado: Database["public"]["Enums"]["estado_tarea"] | null
          fecha_estimada_fin: string | null
          fecha_estimada_inicio: string | null
          fecha_fin_real: string | null
          fecha_inicio_real: string | null
          id: string | null
          jornales_estimados: number | null
          jornales_reales: number | null
          lote_id: string | null
          lote_ids: string[] | null
          lote_nombre: string | null
          lote_nombres: string | null
          nombre: string | null
          num_empleados: number | null
          num_lotes: number | null
          observaciones: string | null
          prioridad: Database["public"]["Enums"]["prioridad_tarea"] | null
          responsable_id: string | null
          responsable_nombre: string | null
          sublote_id: string | null
          tipo_tarea_categoria:
            | Database["public"]["Enums"]["categoria_tarea"]
            | null
          tipo_tarea_id: string | null
          tipo_tarea_nombre: string | null
          updated_at: string | null
          updated_by: string | null
        }
        Relationships: [
          {
            foreignKeyName: "tareas_lote_fkey"
            columns: ["lote_id"]
            isOneToOne: false
            referencedRelation: "lotes"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "tareas_responsable_fkey"
            columns: ["responsable_id"]
            isOneToOne: false
            referencedRelation: "empleados"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "tareas_sublote_fkey"
            columns: ["sublote_id"]
            isOneToOne: false
            referencedRelation: "sublotes"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "tareas_tipo_tarea_fkey"
            columns: ["tipo_tarea_id"]
            isOneToOne: false
            referencedRelation: "tipos_tareas"
            referencedColumns: ["id"]
          },
        ]
      }
    }
    Functions: {
      actualizar_cantidad_producto: {
        Args: { p_diferencia: number; p_producto_id: string }
        Returns: undefined
      }
      aplicar_ajustes_verificacion: {
        Args: { p_usuario: string; p_verificacion_id: number }
        Returns: {
          movimientos_creados: number
          productos_actualizados: number
        }[]
      }
      es_usuario_gerencia: { Args: never; Returns: boolean }
      get_user_role: {
        Args: never
        Returns: Database["public"]["Enums"]["rol_usuario"]
      }
      obtener_jornales_por_lote: {
        Args: { fecha_fin: string; fecha_inicio: string; p_lote_id: string }
        Returns: {
          dias_trabajados: number
          num_empleados: number
          tarea_id: string
          tarea_nombre: string
          tipo_tarea: string
          total_jornales: number
        }[]
      }
      obtener_jornales_semana: {
        Args: { fecha_fin: string; fecha_inicio: string }
        Returns: {
          dias_trabajados: number
          lote_nombre: string
          num_empleados: number
          tarea_id: string
          tarea_nombre: string
          tipo_tarea: string
          total_jornales: number
        }[]
      }
      registrar_compra: {
        Args: {
          p_fecha: string
          p_items: Json
          p_numero_factura: string
          p_proveedor: string
          p_total: number
          p_user_id?: string
        }
        Returns: Json
      }
      registrar_salida_inventario: {
        Args: {
          p_cantidad: number
          p_notas?: string
          p_producto_id: number
          p_referencia_id?: number
          p_tipo_referencia?: string
          p_user_id?: string
        }
        Returns: Json
      }
    }
    Enums: {
      categoria_producto:
        | "Fertilizante"
        | "Fungicida"
        | "Insecticida"
        | "Acaricida"
        | "Herbicida"
        | "Biocontrolador"
        | "Coadyuvante"
        | "Herramienta"
        | "Equipo"
        | "Otros"
        | "Insecticida - Acaricida"
        | "Biológicos"
        | "Regulador"
        | "Fitorregulador"
        | "Desinfectante"
        | "Enmienda"
        | "Enmienda - regulador"
        | "Maquinaria"
      categoria_tarea:
        | "Mantenimiento del cultivo"
        | "Cosecha"
        | "Proyectos Especiales"
        | "Aplicaciones Fitosanitarias"
        | "Fertilización y Enmiendas"
        | "Monitoreo"
        | "Infraestructura"
        | "Siembra"
        | "Administrativas"
        | "Apoyo Finca"
        | "Otras"
      condiciones_meteorologicas:
        | "soleadas"
        | "nubladas"
        | "lluvia suave"
        | "lluvia fuerte"
      estado_aplicacion: "Calculada" | "En ejecución" | "Cerrada"
      estado_empleado: "Activo" | "Inactivo"
      estado_fisico: "Líquido" | "Sólido"
      estado_producto:
        | "OK"
        | "Sin existencias"
        | "Vencido"
        | "Perdido"
        | "Próximo a vencer (3 meses)"
      estado_tarea:
        | "Banco"
        | "Programada"
        | "En Proceso"
        | "Completada"
        | "Cancelada"
      estado_verificacion:
        | "En proceso"
        | "Completada"
        | "Pendiente Aprobación"
        | "Aprobada"
        | "Rechazada"
      fraccion_jornal: "0.25" | "0.5" | "0.75" | "1.0"
      gravedad_texto: "Baja" | "Media" | "Alta"
      grupo_producto: "Agroinsumos" | "Herramientas" | "Maquinaria y equipo"
      medio_pago: "Efectivo" | "Transferencia bancaria" | "Cheque"
      periodicidad_pago:
        | "Mensual"
        | "Quincenal"
        | "Semanal"
        | "Diario"
        | "Por jornal"
      prioridad_tarea: "Alta" | "Media" | "Baja"
      rol_usuario: "Administrador" | "Verificador" | "Gerencia"
      tipo_aplicacion: "Fumigación" | "Fertilización" | "Drench" | "N/A"
      tipo_aplicacion_producto: "Foliar" | "Edáfico" | "Drench"
      tipo_contrato:
        | "Indefinido"
        | "Fijo"
        | "Por obra o labor"
        | "Prestación de servicios"
        | "Aprendizaje"
        | "Otro"
      tipo_movimiento:
        | "Entrada"
        | "Salida por Aplicación"
        | "Salida Otros"
        | "Ajuste"
      unidad_medida: "Kilos" | "Litros" | "Unidades"
    }
    CompositeTypes: {
      [_ in never]: never
    }
  }
}

type DatabaseWithoutInternals = Omit<Database, "__InternalSupabase">

type DefaultSchema = DatabaseWithoutInternals[Extract<keyof Database, "public">]

export type Tables<
  DefaultSchemaTableNameOrOptions extends
    | keyof (DefaultSchema["Tables"] & DefaultSchema["Views"])
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
        DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])
    : never = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
      DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])[TableName] extends {
      Row: infer R
    }
    ? R
    : never
  : DefaultSchemaTableNameOrOptions extends keyof (DefaultSchema["Tables"] &
        DefaultSchema["Views"])
    ? (DefaultSchema["Tables"] &
        DefaultSchema["Views"])[DefaultSchemaTableNameOrOptions] extends {
        Row: infer R
      }
      ? R
      : never
    : never

export type TablesInsert<
  DefaultSchemaTableNameOrOptions extends
    | keyof DefaultSchema["Tables"]
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Insert: infer I
    }
    ? I
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"]
    ? DefaultSchema["Tables"][DefaultSchemaTableNameOrOptions] extends {
        Insert: infer I
      }
      ? I
      : never
    : never

export type TablesUpdate<
  DefaultSchemaTableNameOrOptions extends
    | keyof DefaultSchema["Tables"]
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Update: infer U
    }
    ? U
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"]
    ? DefaultSchema["Tables"][DefaultSchemaTableNameOrOptions] extends {
        Update: infer U
      }
      ? U
      : never
    : never

export type Enums<
  DefaultSchemaEnumNameOrOptions extends
    | keyof DefaultSchema["Enums"]
    | { schema: keyof DatabaseWithoutInternals },
  EnumName extends DefaultSchemaEnumNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"]
    : never = never,
> = DefaultSchemaEnumNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"][EnumName]
  : DefaultSchemaEnumNameOrOptions extends keyof DefaultSchema["Enums"]
    ? DefaultSchema["Enums"][DefaultSchemaEnumNameOrOptions]
    : never

export type CompositeTypes<
  PublicCompositeTypeNameOrOptions extends
    | keyof DefaultSchema["CompositeTypes"]
    | { schema: keyof DatabaseWithoutInternals },
  CompositeTypeName extends PublicCompositeTypeNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"]
    : never = never,
> = PublicCompositeTypeNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"][CompositeTypeName]
  : PublicCompositeTypeNameOrOptions extends keyof DefaultSchema["CompositeTypes"]
    ? DefaultSchema["CompositeTypes"][PublicCompositeTypeNameOrOptions]
    : never

export const Constants = {
  public: {
    Enums: {
      categoria_producto: [
        "Fertilizante",
        "Fungicida",
        "Insecticida",
        "Acaricida",
        "Herbicida",
        "Biocontrolador",
        "Coadyuvante",
        "Herramienta",
        "Equipo",
        "Otros",
        "Insecticida - Acaricida",
        "Biológicos",
        "Regulador",
        "Fitorregulador",
        "Desinfectante",
        "Enmienda",
        "Enmienda - regulador",
        "Maquinaria",
      ],
      categoria_tarea: [
        "Mantenimiento del cultivo",
        "Cosecha",
        "Proyectos Especiales",
        "Aplicaciones Fitosanitarias",
        "Fertilización y Enmiendas",
        "Monitoreo",
        "Infraestructura",
        "Siembra",
        "Administrativas",
        "Apoyo Finca",
        "Otras",
      ],
      condiciones_meteorologicas: [
        "soleadas",
        "nubladas",
        "lluvia suave",
        "lluvia fuerte",
      ],
      estado_aplicacion: ["Calculada", "En ejecución", "Cerrada"],
      estado_empleado: ["Activo", "Inactivo"],
      estado_fisico: ["Líquido", "Sólido"],
      estado_producto: [
        "OK",
        "Sin existencias",
        "Vencido",
        "Perdido",
        "Próximo a vencer (3 meses)",
      ],
      estado_tarea: [
        "Banco",
        "Programada",
        "En Proceso",
        "Completada",
        "Cancelada",
      ],
      estado_verificacion: [
        "En proceso",
        "Completada",
        "Pendiente Aprobación",
        "Aprobada",
        "Rechazada",
      ],
      fraccion_jornal: ["0.25", "0.5", "0.75", "1.0"],
      gravedad_texto: ["Baja", "Media", "Alta"],
      grupo_producto: ["Agroinsumos", "Herramientas", "Maquinaria y equipo"],
      medio_pago: ["Efectivo", "Transferencia bancaria", "Cheque"],
      periodicidad_pago: [
        "Mensual",
        "Quincenal",
        "Semanal",
        "Diario",
        "Por jornal",
      ],
      prioridad_tarea: ["Alta", "Media", "Baja"],
      rol_usuario: ["Administrador", "Verificador", "Gerencia"],
      tipo_aplicacion: ["Fumigación", "Fertilización", "Drench", "N/A"],
      tipo_aplicacion_producto: ["Foliar", "Edáfico", "Drench"],
      tipo_contrato: [
        "Indefinido",
        "Fijo",
        "Por obra o labor",
        "Prestación de servicios",
        "Aprendizaje",
        "Otro",
      ],
      tipo_movimiento: [
        "Entrada",
        "Salida por Aplicación",
        "Salida Otros",
        "Ajuste",
      ],
      unidad_medida: ["Kilos", "Litros", "Unidades"],
    },
  },
} as const
