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
    PostgrestVersion: "14.5"
  }
  public: {
    Tables: {
      acciones_corridas: {
        Row: {
          contexto_comite: string | null
          costo_usd: number | null
          disparo: string
          duracion_ms: number | null
          error: string | null
          estado: string
          fecha_referencia: string
          generado_at: string
          id: string
          modelo: string | null
          paquete: Json
          rechazos: Json
          salida_cruda: Json | null
          tokens_completion: number | null
          tokens_prompt: number | null
        }
        Insert: {
          contexto_comite?: string | null
          costo_usd?: number | null
          disparo: string
          duracion_ms?: number | null
          error?: string | null
          estado: string
          fecha_referencia: string
          generado_at?: string
          id?: string
          modelo?: string | null
          paquete: Json
          rechazos?: Json
          salida_cruda?: Json | null
          tokens_completion?: number | null
          tokens_prompt?: number | null
        }
        Update: {
          contexto_comite?: string | null
          costo_usd?: number | null
          disparo?: string
          duracion_ms?: number | null
          error?: string | null
          estado?: string
          fecha_referencia?: string
          generado_at?: string
          id?: string
          modelo?: string | null
          paquete?: Json
          rechazos?: Json
          salida_cruda?: Json | null
          tokens_completion?: number | null
          tokens_prompt?: number | null
        }
        Relationships: []
      }
      acciones_recomendadas: {
        Row: {
          caducada_at: string | null
          clave: string
          corrida_id: string
          created_at: string
          destino_etiqueta: string
          destino_id: string
          destino_ruta: string
          hecho_ids: string[]
          hechos_snapshot: Json
          id: string
          negocio: string
          orden: number
          origen: string
          plantilla: string
          ranuras: Json
          updated_at: string
          visibilidad: string
        }
        Insert: {
          caducada_at?: string | null
          clave: string
          corrida_id: string
          created_at?: string
          destino_etiqueta: string
          destino_id: string
          destino_ruta: string
          hecho_ids: string[]
          hechos_snapshot: Json
          id?: string
          negocio: string
          orden: number
          origen: string
          plantilla: string
          ranuras?: Json
          updated_at?: string
          visibilidad?: string
        }
        Update: {
          caducada_at?: string | null
          clave?: string
          corrida_id?: string
          created_at?: string
          destino_etiqueta?: string
          destino_id?: string
          destino_ruta?: string
          hecho_ids?: string[]
          hechos_snapshot?: Json
          id?: string
          negocio?: string
          orden?: number
          origen?: string
          plantilla?: string
          ranuras?: Json
          updated_at?: string
          visibilidad?: string
        }
        Relationships: [
          {
            foreignKeyName: "acciones_recomendadas_corrida_id_fkey"
            columns: ["corrida_id"]
            isOneToOne: false
            referencedRelation: "acciones_corridas"
            referencedColumns: ["id"]
          },
        ]
      }
      acciones_silencios: {
        Row: {
          clave: string
          descartada_at: string
          descartada_por: string | null
          frase_al_descartar: string | null
          motivo: string | null
          negocio: string
          vigente_hasta: string
        }
        Insert: {
          clave: string
          descartada_at?: string
          descartada_por?: string | null
          frase_al_descartar?: string | null
          motivo?: string | null
          negocio: string
          vigente_hasta: string
        }
        Update: {
          clave?: string
          descartada_at?: string
          descartada_por?: string | null
          frase_al_descartar?: string | null
          motivo?: string | null
          negocio?: string
          vigente_hasta?: string
        }
        Relationships: []
      }
      alertas_catalogo: {
        Row: {
          activo: boolean
          clave: string
          created_at: string
          descripcion: string | null
          modulo: string
          nombre: string
          orden: number
          updated_at: string
        }
        Insert: {
          activo?: boolean
          clave: string
          created_at?: string
          descripcion?: string | null
          modulo: string
          nombre: string
          orden?: number
          updated_at?: string
        }
        Update: {
          activo?: boolean
          clave?: string
          created_at?: string
          descripcion?: string | null
          modulo?: string
          nombre?: string
          orden?: number
          updated_at?: string
        }
        Relationships: []
      }
      apiarios: {
        Row: {
          activo: boolean | null
          created_at: string | null
          id: string
          nombre: string
          total_colmenas: number
          ubicacion: string | null
        }
        Insert: {
          activo?: boolean | null
          created_at?: string | null
          id?: string
          nombre: string
          total_colmenas?: number
          ubicacion?: string | null
        }
        Update: {
          activo?: boolean | null
          created_at?: string | null
          id?: string
          nombre?: string
          total_colmenas?: number
          ubicacion?: string | null
        }
        Relationships: []
      }
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
      clima_candado_backfill: {
        Row: {
          dueno: string | null
          id: number
          tomado_en: string | null
          vence_en: string | null
        }
        Insert: {
          dueno?: string | null
          id: number
          tomado_en?: string | null
          vence_en?: string | null
        }
        Update: {
          dueno?: string | null
          id?: number
          tomado_en?: string | null
          vence_en?: string | null
        }
        Relationships: []
      }
      clima_lecturas: {
        Row: {
          created_at: string | null
          humedad_pct: number | null
          id: number
          lluvia_diaria_actualizada_en: string | null
          lluvia_diaria_mm: number | null
          lluvia_evento_mm: number | null
          lluvia_tasa_mm_hr: number | null
          radiacion_wm2: number | null
          rafaga_kmh: number | null
          station_id: string
          temp_c: number | null
          timestamp: string
          uv_index: number | null
          viento_dir: number | null
          viento_kmh: number | null
        }
        Insert: {
          created_at?: string | null
          humedad_pct?: number | null
          id?: never
          lluvia_diaria_actualizada_en?: string | null
          lluvia_diaria_mm?: number | null
          lluvia_evento_mm?: number | null
          lluvia_tasa_mm_hr?: number | null
          radiacion_wm2?: number | null
          rafaga_kmh?: number | null
          station_id: string
          temp_c?: number | null
          timestamp: string
          uv_index?: number | null
          viento_dir?: number | null
          viento_kmh?: number | null
        }
        Update: {
          created_at?: string | null
          humedad_pct?: number | null
          id?: never
          lluvia_diaria_actualizada_en?: string | null
          lluvia_diaria_mm?: number | null
          lluvia_evento_mm?: number | null
          lluvia_tasa_mm_hr?: number | null
          radiacion_wm2?: number | null
          rafaga_kmh?: number | null
          station_id?: string
          temp_c?: number | null
          timestamp?: string
          uv_index?: number | null
          viento_dir?: number | null
          viento_kmh?: number | null
        }
        Relationships: []
      }
      clima_resumen_diario: {
        Row: {
          cobertura_hueco_max_min: number | null
          created_at: string | null
          fecha: string
          horas_sol_duracion: number | null
          humedad_pct_avg: number | null
          humedad_pct_max: number | null
          humedad_pct_min: number | null
          lecturas_count: number
          lluvia_confianza: string
          lluvia_mm_evento: number | null
          lluvia_total_mm: number | null
          radiacion_wm2_avg: number | null
          radiacion_wm2_max: number | null
          rafaga_kmh_max: number | null
          station_id: string
          temp_c_avg: number | null
          temp_c_max: number | null
          temp_c_min: number | null
          ultima_lectura_en: string | null
          uv_index_max: number | null
          viento_dir_predominante: number | null
          viento_kmh_avg: number | null
        }
        Insert: {
          cobertura_hueco_max_min?: number | null
          created_at?: string | null
          fecha: string
          horas_sol_duracion?: number | null
          humedad_pct_avg?: number | null
          humedad_pct_max?: number | null
          humedad_pct_min?: number | null
          lecturas_count?: number
          lluvia_confianza?: string
          lluvia_mm_evento?: number | null
          lluvia_total_mm?: number | null
          radiacion_wm2_avg?: number | null
          radiacion_wm2_max?: number | null
          rafaga_kmh_max?: number | null
          station_id: string
          temp_c_avg?: number | null
          temp_c_max?: number | null
          temp_c_min?: number | null
          ultima_lectura_en?: string | null
          uv_index_max?: number | null
          viento_dir_predominante?: number | null
          viento_kmh_avg?: number | null
        }
        Update: {
          cobertura_hueco_max_min?: number | null
          created_at?: string | null
          fecha?: string
          horas_sol_duracion?: number | null
          humedad_pct_avg?: number | null
          humedad_pct_max?: number | null
          humedad_pct_min?: number | null
          lecturas_count?: number
          lluvia_confianza?: string
          lluvia_mm_evento?: number | null
          lluvia_total_mm?: number | null
          radiacion_wm2_avg?: number | null
          radiacion_wm2_max?: number | null
          rafaga_kmh_max?: number | null
          station_id?: string
          temp_c_avg?: number | null
          temp_c_max?: number | null
          temp_c_min?: number | null
          ultima_lectura_en?: string | null
          uv_index_max?: number | null
          viento_dir_predominante?: number | null
          viento_kmh_avg?: number | null
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
      esco_memorias: {
        Row: {
          archived_at: string | null
          content: string
          created_at: string
          id: string
          last_used_at: string | null
          source_channel: string
          source_message_id: string | null
          user_id: string
        }
        Insert: {
          archived_at?: string | null
          content: string
          created_at?: string
          id?: string
          last_used_at?: string | null
          source_channel: string
          source_message_id?: string | null
          user_id: string
        }
        Update: {
          archived_at?: string | null
          content?: string
          created_at?: string
          id?: string
          last_used_at?: string | null
          source_channel?: string
          source_message_id?: string | null
          user_id?: string
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
          tipo_costo: string
          updated_at: string | null
        }
        Insert: {
          activo?: boolean | null
          created_at?: string | null
          id?: string
          nombre: string
          orden?: number | null
          tipo_costo?: string
          updated_at?: string | null
        }
        Update: {
          activo?: boolean | null
          created_at?: string | null
          id?: string
          nombre?: string
          orden?: number | null
          tipo_costo?: string
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
          tipo_costo: string | null
          updated_at: string | null
        }
        Insert: {
          activo?: boolean | null
          categoria_id: string
          created_at?: string | null
          id?: string
          nombre: string
          tipo_costo?: string | null
          updated_at?: string | null
        }
        Update: {
          activo?: boolean | null
          categoria_id?: string
          created_at?: string | null
          id?: string
          nombre?: string
          tipo_costo?: string | null
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
          cabezas: number | null
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
          cabezas?: number | null
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
          cabezas?: number | null
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
      fin_parametros: {
        Row: {
          anio: number | null
          clave: string
          created_at: string | null
          id: string
          negocio_id: string | null
          notas: string | null
          updated_at: string | null
          updated_by: string | null
          valor: number
        }
        Insert: {
          anio?: number | null
          clave: string
          created_at?: string | null
          id?: string
          negocio_id?: string | null
          notas?: string | null
          updated_at?: string | null
          updated_by?: string | null
          valor: number
        }
        Update: {
          anio?: number | null
          clave?: string
          created_at?: string | null
          id?: string
          negocio_id?: string | null
          notas?: string | null
          updated_at?: string | null
          updated_by?: string | null
          valor?: number
        }
        Relationships: [
          {
            foreignKeyName: "fin_parametros_negocio_id_fkey"
            columns: ["negocio_id"]
            isOneToOne: false
            referencedRelation: "fin_negocios"
            referencedColumns: ["id"]
          },
        ]
      }
      fin_presupuestos: {
        Row: {
          anio: number
          categoria_id: string
          concepto_id: string
          created_at: string | null
          created_by: string | null
          id: string
          is_principal: boolean
          monto_anual: number
          negocio_id: string
          updated_at: string | null
          updated_by: string | null
        }
        Insert: {
          anio: number
          categoria_id: string
          concepto_id: string
          created_at?: string | null
          created_by?: string | null
          id?: string
          is_principal?: boolean
          monto_anual?: number
          negocio_id: string
          updated_at?: string | null
          updated_by?: string | null
        }
        Update: {
          anio?: number
          categoria_id?: string
          concepto_id?: string
          created_at?: string | null
          created_by?: string | null
          id?: string
          is_principal?: boolean
          monto_anual?: number
          negocio_id?: string
          updated_at?: string | null
          updated_by?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "fin_presupuestos_categoria_id_fkey"
            columns: ["categoria_id"]
            isOneToOne: false
            referencedRelation: "fin_categorias_gastos"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "fin_presupuestos_concepto_id_fkey"
            columns: ["concepto_id"]
            isOneToOne: false
            referencedRelation: "fin_conceptos_gastos"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "fin_presupuestos_negocio_id_fkey"
            columns: ["negocio_id"]
            isOneToOne: false
            referencedRelation: "fin_negocios"
            referencedColumns: ["id"]
          },
        ]
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
          destare_kg_cabeza: number | null
          es_hato: boolean
          fecha: string
          finca: string | null
          hato_animal_id: string | null
          id: string
          kilos_pagados: number | null
          observaciones: string | null
          peso_total_kg: number | null
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
          destare_kg_cabeza?: number | null
          es_hato?: boolean
          fecha: string
          finca?: string | null
          hato_animal_id?: string | null
          id?: string
          kilos_pagados?: number | null
          observaciones?: string | null
          peso_total_kg?: number | null
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
          destare_kg_cabeza?: number | null
          es_hato?: boolean
          fecha?: string
          finca?: string | null
          hato_animal_id?: string | null
          id?: string
          kilos_pagados?: number | null
          observaciones?: string | null
          peso_total_kg?: number | null
          precio_kilo?: number | null
          tipo?: string
          updated_at?: string | null
          valor_total?: number
        }
        Relationships: [
          {
            foreignKeyName: "fin_transacciones_ganado_hato_animal_id_fkey"
            columns: ["hato_animal_id"]
            isOneToOne: false
            referencedRelation: "hato_animales"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "fin_transacciones_ganado_hato_animal_id_fkey"
            columns: ["hato_animal_id"]
            isOneToOne: false
            referencedRelation: "v_hato_estado_actual"
            referencedColumns: ["animal_id"]
          },
        ]
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
      gan_fincas: {
        Row: {
          activa: boolean
          created_at: string | null
          hectareas: number
          id: string
          nombre: string
          ubicacion_id: string | null
        }
        Insert: {
          activa?: boolean
          created_at?: string | null
          hectareas?: number
          id?: string
          nombre: string
          ubicacion_id?: string | null
        }
        Update: {
          activa?: boolean
          created_at?: string | null
          hectareas?: number
          id?: string
          nombre?: string
          ubicacion_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "gan_fincas_ubicacion_id_fkey"
            columns: ["ubicacion_id"]
            isOneToOne: false
            referencedRelation: "gan_ubicaciones"
            referencedColumns: ["id"]
          },
        ]
      }
      gan_inventario: {
        Row: {
          id: string
          novillos: number
          peso_promedio_kg: number | null
          potrero_id: string
          toros: number
          updated_at: string | null
        }
        Insert: {
          id?: string
          novillos?: number
          peso_promedio_kg?: number | null
          potrero_id: string
          toros?: number
          updated_at?: string | null
        }
        Update: {
          id?: string
          novillos?: number
          peso_promedio_kg?: number | null
          potrero_id?: string
          toros?: number
          updated_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "gan_inventario_potrero_id_fkey"
            columns: ["potrero_id"]
            isOneToOne: true
            referencedRelation: "gan_potreros"
            referencedColumns: ["id"]
          },
        ]
      }
      gan_lotes: {
        Row: {
          activo: boolean
          created_at: string | null
          finca_id: string
          id: string
          nombre: string
        }
        Insert: {
          activo?: boolean
          created_at?: string | null
          finca_id: string
          id?: string
          nombre: string
        }
        Update: {
          activo?: boolean
          created_at?: string | null
          finca_id?: string
          id?: string
          nombre?: string
        }
        Relationships: [
          {
            foreignKeyName: "gan_lotes_finca_id_fkey"
            columns: ["finca_id"]
            isOneToOne: false
            referencedRelation: "gan_fincas"
            referencedColumns: ["id"]
          },
        ]
      }
      gan_movimientos: {
        Row: {
          created_at: string | null
          created_by: string | null
          estado: string
          fecha: string
          grupo_id: string | null
          id: string
          notas: string | null
          novillos_delta: number
          peso_promedio_kg: number | null
          potrero_destino_id: string | null
          potrero_origen_id: string | null
          tipo: string
          toros_delta: number
          transaccion_ganado_id: string | null
        }
        Insert: {
          created_at?: string | null
          created_by?: string | null
          estado?: string
          fecha: string
          grupo_id?: string | null
          id?: string
          notas?: string | null
          novillos_delta?: number
          peso_promedio_kg?: number | null
          potrero_destino_id?: string | null
          potrero_origen_id?: string | null
          tipo: string
          toros_delta?: number
          transaccion_ganado_id?: string | null
        }
        Update: {
          created_at?: string | null
          created_by?: string | null
          estado?: string
          fecha?: string
          grupo_id?: string | null
          id?: string
          notas?: string | null
          novillos_delta?: number
          peso_promedio_kg?: number | null
          potrero_destino_id?: string | null
          potrero_origen_id?: string | null
          tipo?: string
          toros_delta?: number
          transaccion_ganado_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "gan_movimientos_potrero_destino_id_fkey"
            columns: ["potrero_destino_id"]
            isOneToOne: false
            referencedRelation: "gan_potreros"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "gan_movimientos_potrero_origen_id_fkey"
            columns: ["potrero_origen_id"]
            isOneToOne: false
            referencedRelation: "gan_potreros"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "gan_movimientos_transaccion_ganado_id_fkey"
            columns: ["transaccion_ganado_id"]
            isOneToOne: false
            referencedRelation: "fin_transacciones_ganado"
            referencedColumns: ["id"]
          },
        ]
      }
      gan_pesos_historico: {
        Row: {
          created_at: string | null
          fecha: string
          id: string
          notas: string | null
          peso_promedio_kg: number
          potrero_id: string
        }
        Insert: {
          created_at?: string | null
          fecha: string
          id?: string
          notas?: string | null
          peso_promedio_kg: number
          potrero_id: string
        }
        Update: {
          created_at?: string | null
          fecha?: string
          id?: string
          notas?: string | null
          peso_promedio_kg?: number
          potrero_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "gan_pesos_historico_potrero_id_fkey"
            columns: ["potrero_id"]
            isOneToOne: false
            referencedRelation: "gan_potreros"
            referencedColumns: ["id"]
          },
        ]
      }
      gan_potreros: {
        Row: {
          activo: boolean
          created_at: string | null
          etapa: string | null
          finca_id: string
          id: string
          lote_id: string | null
          nombre: string
        }
        Insert: {
          activo?: boolean
          created_at?: string | null
          etapa?: string | null
          finca_id: string
          id?: string
          lote_id?: string | null
          nombre: string
        }
        Update: {
          activo?: boolean
          created_at?: string | null
          etapa?: string | null
          finca_id?: string
          id?: string
          lote_id?: string | null
          nombre?: string
        }
        Relationships: [
          {
            foreignKeyName: "gan_potreros_finca_id_fkey"
            columns: ["finca_id"]
            isOneToOne: false
            referencedRelation: "gan_fincas"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "gan_potreros_lote_misma_finca"
            columns: ["lote_id", "finca_id"]
            isOneToOne: false
            referencedRelation: "gan_lotes"
            referencedColumns: ["id", "finca_id"]
          },
        ]
      }
      gan_ubicaciones: {
        Row: {
          created_at: string | null
          id: string
          nombre: string
        }
        Insert: {
          created_at?: string | null
          id?: string
          nombre: string
        }
        Update: {
          created_at?: string | null
          id?: string
          nombre?: string
        }
        Relationships: []
      }
      globalgap_correcciones: {
        Row: {
          aplicacion_id: string | null
          corregido_en: string
          corregido_por: string | null
          datos_anteriores: Json
          datos_nuevos: Json | null
          fila_id: string
          id: string
          motivo: string | null
          operacion: string
          tabla: string
        }
        Insert: {
          aplicacion_id?: string | null
          corregido_en?: string
          corregido_por?: string | null
          datos_anteriores: Json
          datos_nuevos?: Json | null
          fila_id: string
          id?: string
          motivo?: string | null
          operacion: string
          tabla: string
        }
        Update: {
          aplicacion_id?: string | null
          corregido_en?: string
          corregido_por?: string | null
          datos_anteriores?: Json
          datos_nuevos?: Json | null
          fila_id?: string
          id?: string
          motivo?: string | null
          operacion?: string
          tabla?: string
        }
        Relationships: []
      }
      hato_alertas: {
        Row: {
          animal_id: string | null
          created_at: string | null
          created_by: string | null
          datos: Json | null
          destinatario_telegram_id: string | null
          escalada_at: string | null
          estado: string
          fecha_programada: string
          id: string
          intentos: number
          paso_id: string | null
          regla_clave: string
          respondida_por: string | null
          respuesta: string | null
          tipo: string
          updated_at: string | null
        }
        Insert: {
          animal_id?: string | null
          created_at?: string | null
          created_by?: string | null
          datos?: Json | null
          destinatario_telegram_id?: string | null
          escalada_at?: string | null
          estado?: string
          fecha_programada: string
          id?: string
          intentos?: number
          paso_id?: string | null
          regla_clave: string
          respondida_por?: string | null
          respuesta?: string | null
          tipo: string
          updated_at?: string | null
        }
        Update: {
          animal_id?: string | null
          created_at?: string | null
          created_by?: string | null
          datos?: Json | null
          destinatario_telegram_id?: string | null
          escalada_at?: string | null
          estado?: string
          fecha_programada?: string
          id?: string
          intentos?: number
          paso_id?: string | null
          regla_clave?: string
          respondida_por?: string | null
          respuesta?: string | null
          tipo?: string
          updated_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "hato_alertas_animal_id_fkey"
            columns: ["animal_id"]
            isOneToOne: false
            referencedRelation: "hato_animales"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "hato_alertas_animal_id_fkey"
            columns: ["animal_id"]
            isOneToOne: false
            referencedRelation: "v_hato_estado_actual"
            referencedColumns: ["animal_id"]
          },
          {
            foreignKeyName: "hato_alertas_paso_id_fkey"
            columns: ["paso_id"]
            isOneToOne: false
            referencedRelation: "hato_tratamiento_pasos"
            referencedColumns: ["id"]
          },
        ]
      }
      hato_alertas_config: {
        Row: {
          activo: boolean
          created_at: string | null
          destinatario_telegram_id: string | null
          horas_escalamiento: number
          id: string
          tipo: string
          updated_at: string | null
        }
        Insert: {
          activo?: boolean
          created_at?: string | null
          destinatario_telegram_id?: string | null
          horas_escalamiento?: number
          id?: string
          tipo: string
          updated_at?: string | null
        }
        Update: {
          activo?: boolean
          created_at?: string | null
          destinatario_telegram_id?: string | null
          horas_escalamiento?: number
          id?: string
          tipo?: string
          updated_at?: string | null
        }
        Relationships: []
      }
      hato_alertas_envios: {
        Row: {
          alerta_id: string
          enviado_at: string
          message_id: number | null
          telegram_id: string
        }
        Insert: {
          alerta_id: string
          enviado_at?: string
          message_id?: number | null
          telegram_id: string
        }
        Update: {
          alerta_id?: string
          enviado_at?: string
          message_id?: number | null
          telegram_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "hato_alertas_envios_alerta_id_fkey"
            columns: ["alerta_id"]
            isOneToOne: false
            referencedRelation: "hato_alertas"
            referencedColumns: ["id"]
          },
        ]
      }
      hato_alertas_tick_runs: {
        Row: {
          animales_evaluados: number | null
          animales_sin_raza: number | null
          cobertura: Json | null
          duracion_ms: number | null
          ejecutado_at: string
          enviadas: number | null
          error: string | null
          escaladas: number | null
          estado: string
          expiradas: number | null
          expiradas_atascadas: number | null
          fecha_referencia: string
          generadas: number | null
          id: string
          mensajes_enviados: number | null
          mensajes_escalamiento: number | null
          pasos_tratamiento_evaluados: number | null
          saltadas_sin_destinatario: number | null
        }
        Insert: {
          animales_evaluados?: number | null
          animales_sin_raza?: number | null
          cobertura?: Json | null
          duracion_ms?: number | null
          ejecutado_at?: string
          enviadas?: number | null
          error?: string | null
          escaladas?: number | null
          estado: string
          expiradas?: number | null
          expiradas_atascadas?: number | null
          fecha_referencia: string
          generadas?: number | null
          id?: string
          mensajes_enviados?: number | null
          mensajes_escalamiento?: number | null
          pasos_tratamiento_evaluados?: number | null
          saltadas_sin_destinatario?: number | null
        }
        Update: {
          animales_evaluados?: number | null
          animales_sin_raza?: number | null
          cobertura?: Json | null
          duracion_ms?: number | null
          ejecutado_at?: string
          enviadas?: number | null
          error?: string | null
          escaladas?: number | null
          estado?: string
          expiradas?: number | null
          expiradas_atascadas?: number | null
          fecha_referencia?: string
          generadas?: number | null
          id?: string
          mensajes_enviados?: number | null
          mensajes_escalamiento?: number | null
          pasos_tratamiento_evaluados?: number | null
          saltadas_sin_destinatario?: number | null
        }
        Relationships: []
      }
      hato_animales: {
        Row: {
          confianza: string
          created_at: string | null
          created_by: string | null
          estado: string
          etapa: string
          etapa_forzada: boolean
          fecha_estado: string | null
          fecha_nacimiento: string | null
          fecha_nacimiento_confianza: string
          finca_id: string | null
          id: string
          import_meta: Json | null
          madre_id: string | null
          nombre: string | null
          notas: string | null
          numero: number | null
          origen: string | null
          padre_id: string | null
          padre_toro_id: string | null
          raza: string | null
          sexo: string | null
        }
        Insert: {
          confianza?: string
          created_at?: string | null
          created_by?: string | null
          estado?: string
          etapa: string
          etapa_forzada?: boolean
          fecha_estado?: string | null
          fecha_nacimiento?: string | null
          fecha_nacimiento_confianza?: string
          finca_id?: string | null
          id?: string
          import_meta?: Json | null
          madre_id?: string | null
          nombre?: string | null
          notas?: string | null
          numero?: number | null
          origen?: string | null
          padre_id?: string | null
          padre_toro_id?: string | null
          raza?: string | null
          sexo?: string | null
        }
        Update: {
          confianza?: string
          created_at?: string | null
          created_by?: string | null
          estado?: string
          etapa?: string
          etapa_forzada?: boolean
          fecha_estado?: string | null
          fecha_nacimiento?: string | null
          fecha_nacimiento_confianza?: string
          finca_id?: string | null
          id?: string
          import_meta?: Json | null
          madre_id?: string | null
          nombre?: string | null
          notas?: string | null
          numero?: number | null
          origen?: string | null
          padre_id?: string | null
          padre_toro_id?: string | null
          raza?: string | null
          sexo?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "hato_animales_finca_id_fkey"
            columns: ["finca_id"]
            isOneToOne: false
            referencedRelation: "gan_fincas"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "hato_animales_madre_id_fkey"
            columns: ["madre_id"]
            isOneToOne: false
            referencedRelation: "hato_animales"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "hato_animales_madre_id_fkey"
            columns: ["madre_id"]
            isOneToOne: false
            referencedRelation: "v_hato_estado_actual"
            referencedColumns: ["animal_id"]
          },
          {
            foreignKeyName: "hato_animales_padre_id_fkey"
            columns: ["padre_id"]
            isOneToOne: false
            referencedRelation: "hato_animales"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "hato_animales_padre_id_fkey"
            columns: ["padre_id"]
            isOneToOne: false
            referencedRelation: "v_hato_estado_actual"
            referencedColumns: ["animal_id"]
          },
          {
            foreignKeyName: "hato_animales_padre_toro_id_fkey"
            columns: ["padre_toro_id"]
            isOneToOne: false
            referencedRelation: "hato_toros"
            referencedColumns: ["id"]
          },
        ]
      }
      hato_capturas_foto: {
        Row: {
          actualizado_en: string
          anio: number | null
          celdas_confirmadas: number | null
          celdas_leidas_ocr: number | null
          creado_en: string
          created_by: string | null
          desenlace: string
          detalle: string | null
          fecha: string | null
          filas_escritas: number | null
          fotos_recibidas: number
          id: string
          mes: number | null
          modelo: string | null
          origen: string
          storage_bucket: string
          storage_ok: boolean
          storage_prefijo: string
          storage_rutas: string[]
          tipo: string
        }
        Insert: {
          actualizado_en?: string
          anio?: number | null
          celdas_confirmadas?: number | null
          celdas_leidas_ocr?: number | null
          creado_en?: string
          created_by?: string | null
          desenlace?: string
          detalle?: string | null
          fecha?: string | null
          filas_escritas?: number | null
          fotos_recibidas?: number
          id?: string
          mes?: number | null
          modelo?: string | null
          origen?: string
          storage_bucket: string
          storage_ok?: boolean
          storage_prefijo: string
          storage_rutas?: string[]
          tipo: string
        }
        Update: {
          actualizado_en?: string
          anio?: number | null
          celdas_confirmadas?: number | null
          celdas_leidas_ocr?: number | null
          creado_en?: string
          created_by?: string | null
          desenlace?: string
          detalle?: string | null
          fecha?: string | null
          filas_escritas?: number | null
          fotos_recibidas?: number
          id?: string
          mes?: number | null
          modelo?: string | null
          origen?: string
          storage_bucket?: string
          storage_ok?: boolean
          storage_prefijo?: string
          storage_rutas?: string[]
          tipo?: string
        }
        Relationships: []
      }
      hato_chequeo_vacas: {
        Row: {
          animal_id: string
          chequeo_id: string
          created_at: string | null
          estado: string | null
          estado_raw: string | null
          fecha_probable_parto: string | null
          fecha_secar: string | null
          fecha_servicio: string | null
          fecha_servicio_raw: string | null
          id: string
          meses_prenez: number | null
          normalizacion_issues: Json | null
          np_raw: string | null
          num_partos: number | null
          pl: number | null
          pl_raw: string | null
          pp_raw: string | null
          secar_raw: string | null
          sx_raw: string | null
          tipo_servicio: string | null
          toro: string | null
          toro_raw: string | null
          tp_raw: string | null
          ttto_raw: string | null
          ultima_cria_raw: string | null
        }
        Insert: {
          animal_id: string
          chequeo_id: string
          created_at?: string | null
          estado?: string | null
          estado_raw?: string | null
          fecha_probable_parto?: string | null
          fecha_secar?: string | null
          fecha_servicio?: string | null
          fecha_servicio_raw?: string | null
          id?: string
          meses_prenez?: number | null
          normalizacion_issues?: Json | null
          np_raw?: string | null
          num_partos?: number | null
          pl?: number | null
          pl_raw?: string | null
          pp_raw?: string | null
          secar_raw?: string | null
          sx_raw?: string | null
          tipo_servicio?: string | null
          toro?: string | null
          toro_raw?: string | null
          tp_raw?: string | null
          ttto_raw?: string | null
          ultima_cria_raw?: string | null
        }
        Update: {
          animal_id?: string
          chequeo_id?: string
          created_at?: string | null
          estado?: string | null
          estado_raw?: string | null
          fecha_probable_parto?: string | null
          fecha_secar?: string | null
          fecha_servicio?: string | null
          fecha_servicio_raw?: string | null
          id?: string
          meses_prenez?: number | null
          normalizacion_issues?: Json | null
          np_raw?: string | null
          num_partos?: number | null
          pl?: number | null
          pl_raw?: string | null
          pp_raw?: string | null
          secar_raw?: string | null
          sx_raw?: string | null
          tipo_servicio?: string | null
          toro?: string | null
          toro_raw?: string | null
          tp_raw?: string | null
          ttto_raw?: string | null
          ultima_cria_raw?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "hato_chequeo_vacas_animal_id_fkey"
            columns: ["animal_id"]
            isOneToOne: false
            referencedRelation: "hato_animales"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "hato_chequeo_vacas_animal_id_fkey"
            columns: ["animal_id"]
            isOneToOne: false
            referencedRelation: "v_hato_estado_actual"
            referencedColumns: ["animal_id"]
          },
          {
            foreignKeyName: "hato_chequeo_vacas_chequeo_id_fkey"
            columns: ["chequeo_id"]
            isOneToOne: false
            referencedRelation: "hato_chequeos"
            referencedColumns: ["id"]
          },
        ]
      }
      hato_chequeos: {
        Row: {
          created_at: string | null
          created_by: string | null
          estado: string
          fecha: string
          fuente: string
          id: string
          sheet_ref: string | null
          veterinario: string | null
        }
        Insert: {
          created_at?: string | null
          created_by?: string | null
          estado?: string
          fecha: string
          fuente?: string
          id?: string
          sheet_ref?: string | null
          veterinario?: string | null
        }
        Update: {
          created_at?: string | null
          created_by?: string | null
          estado?: string
          fecha?: string
          fuente?: string
          id?: string
          sheet_ref?: string | null
          veterinario?: string | null
        }
        Relationships: []
      }
      hato_config: {
        Row: {
          clave: string
          created_at: string | null
          descripcion: string | null
          id: string
          updated_at: string | null
          updated_by: string | null
          valor: Json
        }
        Insert: {
          clave: string
          created_at?: string | null
          descripcion?: string | null
          id?: string
          updated_at?: string | null
          updated_by?: string | null
          valor: Json
        }
        Update: {
          clave?: string
          created_at?: string | null
          descripcion?: string | null
          id?: string
          updated_at?: string | null
          updated_by?: string | null
          valor?: Json
        }
        Relationships: []
      }
      hato_correcciones: {
        Row: {
          animal_id: string | null
          corregido_en: string
          corregido_por: string | null
          datos_anteriores: Json
          datos_nuevos: Json | null
          fila_id: string
          id: string
          motivo: string | null
          operacion: string
          tabla: string
        }
        Insert: {
          animal_id?: string | null
          corregido_en?: string
          corregido_por?: string | null
          datos_anteriores: Json
          datos_nuevos?: Json | null
          fila_id: string
          id?: string
          motivo?: string | null
          operacion: string
          tabla: string
        }
        Update: {
          animal_id?: string | null
          corregido_en?: string
          corregido_por?: string | null
          datos_anteriores?: Json
          datos_nuevos?: Json | null
          fila_id?: string
          id?: string
          motivo?: string | null
          operacion?: string
          tabla?: string
        }
        Relationships: []
      }
      hato_eventos: {
        Row: {
          alerta_id: string | null
          animal_id: string
          chequeo_vaca_id: string | null
          created_at: string | null
          created_by: string | null
          cria_destino: string | null
          cria_id: string | null
          datos: Json | null
          fecha: string
          fecha_confianza: string
          fin_ingreso_id: string | null
          fuente: string | null
          id: string
          sx_raw: string | null
          tipo: string
          tipo_servicio: string | null
          toro_id: string | null
          transaccion_ganado_id: string | null
        }
        Insert: {
          alerta_id?: string | null
          animal_id: string
          chequeo_vaca_id?: string | null
          created_at?: string | null
          created_by?: string | null
          cria_destino?: string | null
          cria_id?: string | null
          datos?: Json | null
          fecha: string
          fecha_confianza?: string
          fin_ingreso_id?: string | null
          fuente?: string | null
          id?: string
          sx_raw?: string | null
          tipo: string
          tipo_servicio?: string | null
          toro_id?: string | null
          transaccion_ganado_id?: string | null
        }
        Update: {
          alerta_id?: string | null
          animal_id?: string
          chequeo_vaca_id?: string | null
          created_at?: string | null
          created_by?: string | null
          cria_destino?: string | null
          cria_id?: string | null
          datos?: Json | null
          fecha?: string
          fecha_confianza?: string
          fin_ingreso_id?: string | null
          fuente?: string | null
          id?: string
          sx_raw?: string | null
          tipo?: string
          tipo_servicio?: string | null
          toro_id?: string | null
          transaccion_ganado_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "hato_eventos_alerta_id_fkey"
            columns: ["alerta_id"]
            isOneToOne: false
            referencedRelation: "hato_alertas"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "hato_eventos_animal_id_fkey"
            columns: ["animal_id"]
            isOneToOne: false
            referencedRelation: "hato_animales"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "hato_eventos_animal_id_fkey"
            columns: ["animal_id"]
            isOneToOne: false
            referencedRelation: "v_hato_estado_actual"
            referencedColumns: ["animal_id"]
          },
          {
            foreignKeyName: "hato_eventos_chequeo_vaca_id_fkey"
            columns: ["chequeo_vaca_id"]
            isOneToOne: false
            referencedRelation: "hato_chequeo_vacas"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "hato_eventos_chequeo_vaca_id_fkey"
            columns: ["chequeo_vaca_id"]
            isOneToOne: false
            referencedRelation: "v_hato_estado_actual"
            referencedColumns: ["ultimo_chequeo_vaca_id"]
          },
          {
            foreignKeyName: "hato_eventos_cria_id_fkey"
            columns: ["cria_id"]
            isOneToOne: false
            referencedRelation: "hato_animales"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "hato_eventos_cria_id_fkey"
            columns: ["cria_id"]
            isOneToOne: false
            referencedRelation: "v_hato_estado_actual"
            referencedColumns: ["animal_id"]
          },
          {
            foreignKeyName: "hato_eventos_fin_ingreso_id_fkey"
            columns: ["fin_ingreso_id"]
            isOneToOne: false
            referencedRelation: "fin_ingresos"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "hato_eventos_fin_ingreso_id_fkey"
            columns: ["fin_ingreso_id"]
            isOneToOne: false
            referencedRelation: "v_ingresos_completos"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "hato_eventos_toro_id_fkey"
            columns: ["toro_id"]
            isOneToOne: false
            referencedRelation: "hato_toros"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "hato_eventos_transaccion_ganado_id_fkey"
            columns: ["transaccion_ganado_id"]
            isOneToOne: false
            referencedRelation: "fin_transacciones_ganado"
            referencedColumns: ["id"]
          },
        ]
      }
      hato_pajillas: {
        Row: {
          activa: boolean
          cantidad_inicial: number
          created_at: string | null
          created_by: string | null
          id: string
          toro_id: string
        }
        Insert: {
          activa?: boolean
          cantidad_inicial: number
          created_at?: string | null
          created_by?: string | null
          id?: string
          toro_id: string
        }
        Update: {
          activa?: boolean
          cantidad_inicial?: number
          created_at?: string | null
          created_by?: string | null
          id?: string
          toro_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "hato_pajillas_toro_id_fkey"
            columns: ["toro_id"]
            isOneToOne: false
            referencedRelation: "hato_toros"
            referencedColumns: ["id"]
          },
        ]
      }
      hato_pajillas_uso: {
        Row: {
          animal_id: string | null
          created_at: string | null
          created_by: string | null
          fecha_uso: string
          id: string
          pajilla_id: string
        }
        Insert: {
          animal_id?: string | null
          created_at?: string | null
          created_by?: string | null
          fecha_uso: string
          id?: string
          pajilla_id: string
        }
        Update: {
          animal_id?: string | null
          created_at?: string | null
          created_by?: string | null
          fecha_uso?: string
          id?: string
          pajilla_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "hato_pajillas_uso_animal_id_fkey"
            columns: ["animal_id"]
            isOneToOne: false
            referencedRelation: "hato_animales"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "hato_pajillas_uso_animal_id_fkey"
            columns: ["animal_id"]
            isOneToOne: false
            referencedRelation: "v_hato_estado_actual"
            referencedColumns: ["animal_id"]
          },
          {
            foreignKeyName: "hato_pajillas_uso_pajilla_id_fkey"
            columns: ["pajilla_id"]
            isOneToOne: false
            referencedRelation: "hato_pajillas"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "hato_pajillas_uso_pajilla_id_fkey"
            columns: ["pajilla_id"]
            isOneToOne: false
            referencedRelation: "v_hato_pajillas_stock"
            referencedColumns: ["pajilla_id"]
          },
        ]
      }
      hato_pesajes_leche: {
        Row: {
          animal_id: string
          created_at: string | null
          created_by: string | null
          fecha: string
          fuente: string | null
          id: string
          litros_am: number | null
          litros_pm: number | null
          litros_total: number
        }
        Insert: {
          animal_id: string
          created_at?: string | null
          created_by?: string | null
          fecha: string
          fuente?: string | null
          id?: string
          litros_am?: number | null
          litros_pm?: number | null
          litros_total: number
        }
        Update: {
          animal_id?: string
          created_at?: string | null
          created_by?: string | null
          fecha?: string
          fuente?: string | null
          id?: string
          litros_am?: number | null
          litros_pm?: number | null
          litros_total?: number
        }
        Relationships: [
          {
            foreignKeyName: "hato_pesajes_leche_animal_id_fkey"
            columns: ["animal_id"]
            isOneToOne: false
            referencedRelation: "hato_animales"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "hato_pesajes_leche_animal_id_fkey"
            columns: ["animal_id"]
            isOneToOne: false
            referencedRelation: "v_hato_estado_actual"
            referencedColumns: ["animal_id"]
          },
        ]
      }
      hato_produccion_quincenal: {
        Row: {
          anio: number
          created_at: string | null
          created_by: string | null
          fecha_fin: string | null
          fecha_inicio: string | null
          fin_ingreso_id: string
          fuente: string | null
          id: string
          litros_pomar_confirmado: number | null
          litros_total: number | null
          mes: number
          notas: string | null
          num_vacas_ordeno: number | null
          num_vacas_ordeno_origen: string | null
          origen_dato: string
          precio_bruto_litro: number | null
          quincena: number
          updated_at: string | null
          updated_by: string | null
        }
        Insert: {
          anio: number
          created_at?: string | null
          created_by?: string | null
          fecha_fin?: string | null
          fecha_inicio?: string | null
          fin_ingreso_id: string
          fuente?: string | null
          id?: string
          litros_pomar_confirmado?: number | null
          litros_total?: number | null
          mes: number
          notas?: string | null
          num_vacas_ordeno?: number | null
          num_vacas_ordeno_origen?: string | null
          origen_dato?: string
          precio_bruto_litro?: number | null
          quincena: number
          updated_at?: string | null
          updated_by?: string | null
        }
        Update: {
          anio?: number
          created_at?: string | null
          created_by?: string | null
          fecha_fin?: string | null
          fecha_inicio?: string | null
          fin_ingreso_id?: string
          fuente?: string | null
          id?: string
          litros_pomar_confirmado?: number | null
          litros_total?: number | null
          mes?: number
          notas?: string | null
          num_vacas_ordeno?: number | null
          num_vacas_ordeno_origen?: string | null
          origen_dato?: string
          precio_bruto_litro?: number | null
          quincena?: number
          updated_at?: string | null
          updated_by?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "hato_produccion_quincenal_fin_ingreso_id_fkey"
            columns: ["fin_ingreso_id"]
            isOneToOne: false
            referencedRelation: "fin_ingresos"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "hato_produccion_quincenal_fin_ingreso_id_fkey"
            columns: ["fin_ingreso_id"]
            isOneToOne: false
            referencedRelation: "v_ingresos_completos"
            referencedColumns: ["id"]
          },
        ]
      }
      hato_protocolos: {
        Row: {
          activo: boolean
          created_at: string | null
          created_by: string | null
          descripcion: string | null
          id: string
          nombre: string
          pasos_default: Json | null
        }
        Insert: {
          activo?: boolean
          created_at?: string | null
          created_by?: string | null
          descripcion?: string | null
          id?: string
          nombre: string
          pasos_default?: Json | null
        }
        Update: {
          activo?: boolean
          created_at?: string | null
          created_by?: string | null
          descripcion?: string | null
          id?: string
          nombre?: string
          pasos_default?: Json | null
        }
        Relationships: []
      }
      hato_toros: {
        Row: {
          activo: boolean
          created_at: string | null
          created_by: string | null
          id: string
          nombre: string
          raza: string | null
          tipo: string | null
        }
        Insert: {
          activo?: boolean
          created_at?: string | null
          created_by?: string | null
          id?: string
          nombre: string
          raza?: string | null
          tipo?: string | null
        }
        Update: {
          activo?: boolean
          created_at?: string | null
          created_by?: string | null
          id?: string
          nombre?: string
          raza?: string | null
          tipo?: string | null
        }
        Relationships: []
      }
      hato_tratamiento_pasos: {
        Row: {
          created_at: string | null
          descripcion: string | null
          fecha_ejecutada: string | null
          fecha_programada: string
          id: string
          offset_dias: number
          paso_num: number
          requiere_confirmacion: boolean
          tratamiento_id: string
        }
        Insert: {
          created_at?: string | null
          descripcion?: string | null
          fecha_ejecutada?: string | null
          fecha_programada: string
          id?: string
          offset_dias?: number
          paso_num: number
          requiere_confirmacion?: boolean
          tratamiento_id: string
        }
        Update: {
          created_at?: string | null
          descripcion?: string | null
          fecha_ejecutada?: string | null
          fecha_programada?: string
          id?: string
          offset_dias?: number
          paso_num?: number
          requiere_confirmacion?: boolean
          tratamiento_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "hato_tratamiento_pasos_tratamiento_id_fkey"
            columns: ["tratamiento_id"]
            isOneToOne: false
            referencedRelation: "hato_tratamientos"
            referencedColumns: ["id"]
          },
        ]
      }
      hato_tratamientos: {
        Row: {
          animal_id: string
          chequeo_id: string | null
          created_at: string | null
          created_by: string | null
          estado: string
          fecha_inicio: string
          fuente: string | null
          id: string
          nombre: string | null
          nota: string | null
          protocolo_id: string | null
        }
        Insert: {
          animal_id: string
          chequeo_id?: string | null
          created_at?: string | null
          created_by?: string | null
          estado?: string
          fecha_inicio: string
          fuente?: string | null
          id?: string
          nombre?: string | null
          nota?: string | null
          protocolo_id?: string | null
        }
        Update: {
          animal_id?: string
          chequeo_id?: string | null
          created_at?: string | null
          created_by?: string | null
          estado?: string
          fecha_inicio?: string
          fuente?: string | null
          id?: string
          nombre?: string | null
          nota?: string | null
          protocolo_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "hato_tratamientos_animal_id_fkey"
            columns: ["animal_id"]
            isOneToOne: false
            referencedRelation: "hato_animales"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "hato_tratamientos_animal_id_fkey"
            columns: ["animal_id"]
            isOneToOne: false
            referencedRelation: "v_hato_estado_actual"
            referencedColumns: ["animal_id"]
          },
          {
            foreignKeyName: "hato_tratamientos_chequeo_id_fkey"
            columns: ["chequeo_id"]
            isOneToOne: false
            referencedRelation: "hato_chequeos"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "hato_tratamientos_protocolo_id_fkey"
            columns: ["protocolo_id"]
            isOneToOne: false
            referencedRelation: "hato_protocolos"
            referencedColumns: ["id"]
          },
        ]
      }
      informes_visita: {
        Row: {
          agronoma: string | null
          archivo_nombre: string
          archivo_path: string
          created_at: string
          created_by: string | null
          especie: string | null
          fecha_visita: string
          fenologia: string | null
          finca: string | null
          id: string
          materia_seca: string | null
          proyeccion_cosecha: string | null
          sin_texto: boolean
          texto_busqueda: unknown
          texto_extraido: string | null
          updated_at: string
        }
        Insert: {
          agronoma?: string | null
          archivo_nombre: string
          archivo_path: string
          created_at?: string
          created_by?: string | null
          especie?: string | null
          fecha_visita: string
          fenologia?: string | null
          finca?: string | null
          id?: string
          materia_seca?: string | null
          proyeccion_cosecha?: string | null
          sin_texto?: boolean
          texto_busqueda?: unknown
          texto_extraido?: string | null
          updated_at?: string
        }
        Update: {
          agronoma?: string | null
          archivo_nombre?: string
          archivo_path?: string
          created_at?: string
          created_by?: string | null
          especie?: string | null
          fecha_visita?: string
          fenologia?: string | null
          finca?: string | null
          id?: string
          materia_seca?: string | null
          proyeccion_cosecha?: string | null
          sin_texto?: boolean
          texto_busqueda?: unknown
          texto_extraido?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "informes_visita_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "usuarios"
            referencedColumns: ["id"]
          },
        ]
      }
      informes_visita_fotos: {
        Row: {
          created_at: string
          id: string
          informe_id: string
          nombre_original: string | null
          orden: number
          pie_de_foto: string | null
          storage_path: string
        }
        Insert: {
          created_at?: string
          id?: string
          informe_id: string
          nombre_original?: string | null
          orden?: number
          pie_de_foto?: string | null
          storage_path: string
        }
        Update: {
          created_at?: string
          id?: string
          informe_id?: string
          nombre_original?: string | null
          orden?: number
          pie_de_foto?: string | null
          storage_path?: string
        }
        Relationships: [
          {
            foreignKeyName: "informes_visita_fotos_informe_id_fkey"
            columns: ["informe_id"]
            isOneToOne: false
            referencedRelation: "informes_visita"
            referencedColumns: ["id"]
          },
        ]
      }
      informes_visita_snippets: {
        Row: {
          cita_word: string | null
          created_at: string
          created_by: string | null
          foto_id: string | null
          id: string
          informe_id: string
          insumo: string | null
          origen: string
          plaga: string | null
          temas: string[]
          texto: string
          texto_busqueda: unknown
          tipo: string | null
          updated_at: string
        }
        Insert: {
          cita_word?: string | null
          created_at?: string
          created_by?: string | null
          foto_id?: string | null
          id?: string
          informe_id: string
          insumo?: string | null
          origen: string
          plaga?: string | null
          temas?: string[]
          texto: string
          texto_busqueda?: unknown
          tipo?: string | null
          updated_at?: string
        }
        Update: {
          cita_word?: string | null
          created_at?: string
          created_by?: string | null
          foto_id?: string | null
          id?: string
          informe_id?: string
          insumo?: string | null
          origen?: string
          plaga?: string | null
          temas?: string[]
          texto?: string
          texto_busqueda?: unknown
          tipo?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "informes_visita_snippets_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "usuarios"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "informes_visita_snippets_foto_id_fkey"
            columns: ["foto_id"]
            isOneToOne: false
            referencedRelation: "informes_visita_fotos"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "informes_visita_snippets_informe_id_fkey"
            columns: ["informe_id"]
            isOneToOne: false
            referencedRelation: "informes_visita"
            referencedColumns: ["id"]
          },
        ]
      }
      inventario_causas_raiz: {
        Row: {
          activo: boolean
          clave: string
          etiqueta: string
          exige_nota: boolean
          mueve_inventario: boolean
          orden: number
          via: string
        }
        Insert: {
          activo?: boolean
          clave: string
          etiqueta: string
          exige_nota?: boolean
          mueve_inventario: boolean
          orden: number
          via: string
        }
        Update: {
          activo?: boolean
          clave?: string
          etiqueta?: string
          exige_nota?: boolean
          mueve_inventario?: boolean
          orden?: number
          via?: string
        }
        Relationships: []
      }
      inventario_parametros: {
        Row: {
          clave: string
          updated_at: string
          valor: Json
        }
        Insert: {
          clave: string
          updated_at?: string
          valor: Json
        }
        Update: {
          clave?: string
          updated_at?: string
          valor?: Json
        }
        Relationships: []
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
      mon_colmenas: {
        Row: {
          apiario_id: string
          colmenas_con_reina: number
          colmenas_debiles: number
          colmenas_fuertes: number
          colmenas_muertas: number
          created_at: string | null
          fecha_monitoreo: string
          id: string
          monitor: string | null
          observaciones: string | null
          ronda_id: string | null
          user_id: string | null
        }
        Insert: {
          apiario_id: string
          colmenas_con_reina?: number
          colmenas_debiles?: number
          colmenas_fuertes?: number
          colmenas_muertas?: number
          created_at?: string | null
          fecha_monitoreo?: string
          id?: string
          monitor?: string | null
          observaciones?: string | null
          ronda_id?: string | null
          user_id?: string | null
        }
        Update: {
          apiario_id?: string
          colmenas_con_reina?: number
          colmenas_debiles?: number
          colmenas_fuertes?: number
          colmenas_muertas?: number
          created_at?: string | null
          fecha_monitoreo?: string
          id?: string
          monitor?: string | null
          observaciones?: string | null
          ronda_id?: string | null
          user_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "mon_colmenas_apiario_id_fkey"
            columns: ["apiario_id"]
            isOneToOne: false
            referencedRelation: "apiarios"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "mon_colmenas_ronda_id_fkey"
            columns: ["ronda_id"]
            isOneToOne: false
            referencedRelation: "rondas_monitoreo"
            referencedColumns: ["id"]
          },
        ]
      }
      mon_conductividad: {
        Row: {
          created_at: string | null
          fecha_monitoreo: string
          id: string
          lecturas: Json | null
          lote_id: string
          monitor: string | null
          num_arboles: number | null
          observaciones: string | null
          ph: number | null
          ronda_id: string | null
          user_id: string | null
          valor_ce: number
        }
        Insert: {
          created_at?: string | null
          fecha_monitoreo?: string
          id?: string
          lecturas?: Json | null
          lote_id: string
          monitor?: string | null
          num_arboles?: number | null
          observaciones?: string | null
          ph?: number | null
          ronda_id?: string | null
          user_id?: string | null
          valor_ce: number
        }
        Update: {
          created_at?: string | null
          fecha_monitoreo?: string
          id?: string
          lecturas?: Json | null
          lote_id?: string
          monitor?: string | null
          num_arboles?: number | null
          observaciones?: string | null
          ph?: number | null
          ronda_id?: string | null
          user_id?: string | null
          valor_ce?: number
        }
        Relationships: [
          {
            foreignKeyName: "mon_conductividad_lote_id_fkey"
            columns: ["lote_id"]
            isOneToOne: false
            referencedRelation: "lotes"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "mon_conductividad_ronda_id_fkey"
            columns: ["ronda_id"]
            isOneToOne: false
            referencedRelation: "rondas_monitoreo"
            referencedColumns: ["id"]
          },
        ]
      }
      monitoreos: {
        Row: {
          arboles_afectados: number
          arboles_monitoreados: number
          created_at: string | null
          fecha_monitoreo: string
          floracion_brotes: number | null
          floracion_cuaje: number | null
          floracion_flor_madura: number | null
          floracion_sin_flor: number
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
          ronda_id: string | null
          severidad: number | null
          sublote_id: string | null
          user_id: string | null
        }
        Insert: {
          arboles_afectados: number
          arboles_monitoreados: number
          created_at?: string | null
          fecha_monitoreo: string
          floracion_brotes?: number | null
          floracion_cuaje?: number | null
          floracion_flor_madura?: number | null
          floracion_sin_flor?: number
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
          ronda_id?: string | null
          severidad?: number | null
          sublote_id?: string | null
          user_id?: string | null
        }
        Update: {
          arboles_afectados?: number
          arboles_monitoreados?: number
          created_at?: string | null
          fecha_monitoreo?: string
          floracion_brotes?: number | null
          floracion_cuaje?: number | null
          floracion_flor_madura?: number | null
          floracion_sin_flor?: number
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
          ronda_id?: string | null
          severidad?: number | null
          sublote_id?: string | null
          user_id?: string | null
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
            foreignKeyName: "monitoreos_ronda_id_fkey"
            columns: ["ronda_id"]
            isOneToOne: false
            referencedRelation: "rondas_monitoreo"
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
      novedades_uso: {
        Row: {
          fuente_novedad: string | null
          id: string
          ocurrido_at: string
          tipo: string
          usuario_id: string
        }
        Insert: {
          fuente_novedad?: string | null
          id?: string
          ocurrido_at?: string
          tipo: string
          usuario_id?: string
        }
        Update: {
          fuente_novedad?: string | null
          id?: string
          ocurrido_at?: string
          tipo?: string
          usuario_id?: string
        }
        Relationships: []
      }
      pest_seasonal_profile: {
        Row: {
          created_at: string
          historical_tier: string
          id: string
          lote_id: string | null
          n_years_observed: number
          pest_id: string
          source: string
          week_of_year: number
        }
        Insert: {
          created_at?: string
          historical_tier: string
          id?: string
          lote_id?: string | null
          n_years_observed: number
          pest_id: string
          source?: string
          week_of_year: number
        }
        Update: {
          created_at?: string
          historical_tier?: string
          id?: string
          lote_id?: string | null
          n_years_observed?: number
          pest_id?: string
          source?: string
          week_of_year?: number
        }
        Relationships: [
          {
            foreignKeyName: "pest_seasonal_profile_lote_id_fkey"
            columns: ["lote_id"]
            isOneToOne: false
            referencedRelation: "lotes"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "pest_seasonal_profile_pest_id_fkey"
            columns: ["pest_id"]
            isOneToOne: false
            referencedRelation: "plagas_enfermedades_catalogo"
            referencedColumns: ["id"]
          },
        ]
      }
      pest_umbral_economico: {
        Row: {
          grupo_key: string | null
          id: string
          pest_id: string
          source_label: string
          umbral_pct: number
          updated_at: string | null
        }
        Insert: {
          grupo_key?: string | null
          id?: string
          pest_id: string
          source_label: string
          umbral_pct: number
          updated_at?: string | null
        }
        Update: {
          grupo_key?: string | null
          id?: string
          pest_id?: string
          source_label?: string
          umbral_pct?: number
          updated_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "pest_umbral_economico_pest_id_fkey"
            columns: ["pest_id"]
            isOneToOne: true
            referencedRelation: "plagas_enfermedades_catalogo"
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
          kg_exportacion: number | null
          kg_nacional: number | null
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
          kg_exportacion?: number | null
          kg_nacional?: number | null
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
          kg_exportacion?: number | null
          kg_nacional?: number | null
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
      revisiones_periodicas: {
        Row: {
          activa: boolean
          cadencia_dias: number | null
          clave: string
          created_at: string
          descripcion: string | null
          destino_id: string
          dias_gracia: number
          disparo: string
          evento_reinicio: string | null
          evento_selector: string | null
          negocio: string
          nombre: string
          periodo: string | null
          ultima_revision_at: string | null
          ultima_revision_por: string | null
          updated_at: string
        }
        Insert: {
          activa?: boolean
          cadencia_dias?: number | null
          clave: string
          created_at?: string
          descripcion?: string | null
          destino_id: string
          dias_gracia?: number
          disparo: string
          evento_reinicio?: string | null
          evento_selector?: string | null
          negocio: string
          nombre: string
          periodo?: string | null
          ultima_revision_at?: string | null
          ultima_revision_por?: string | null
          updated_at?: string
        }
        Update: {
          activa?: boolean
          cadencia_dias?: number | null
          clave?: string
          created_at?: string
          descripcion?: string | null
          destino_id?: string
          dias_gracia?: number
          disparo?: string
          evento_reinicio?: string | null
          evento_selector?: string | null
          negocio?: string
          nombre?: string
          periodo?: string | null
          ultima_revision_at?: string | null
          ultima_revision_por?: string | null
          updated_at?: string
        }
        Relationships: []
      }
      rondas_avisos: {
        Row: {
          clave: string
          detalle: Json | null
          enviado_en: string
          ronda_id: string | null
        }
        Insert: {
          clave: string
          detalle?: Json | null
          enviado_en?: string
          ronda_id?: string | null
        }
        Update: {
          clave?: string
          detalle?: Json | null
          enviado_en?: string
          ronda_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "rondas_avisos_ronda_id_fkey"
            columns: ["ronda_id"]
            isOneToOne: false
            referencedRelation: "rondas_inventario"
            referencedColumns: ["id"]
          },
        ]
      }
      rondas_excepciones: {
        Row: {
          aplicacion_en: string | null
          aplicacion_movimiento_id: string | null
          aplicacion_por_telegram: string | null
          aplicacion_por_usuario: string | null
          cantidad_fisica: number
          captura_en: string | null
          captura_movimiento_id: string | null
          captura_por_telegram: string | null
          captura_por_usuario: string | null
          causa_sugerida: string | null
          created_at: string
          decision_causa: string | null
          decision_en: string | null
          decision_nota: string | null
          decision_por_telegram: string | null
          decision_por_usuario: string | null
          estado: Database["public"]["Enums"]["estado_excepcion_inventario"]
          explicacion_citada: string | null
          explicacion_david: string | null
          explicacion_david_accion: string | null
          explicacion_david_en: string | null
          explicacion_david_telegram: string | null
          explicacion_david_usuario: string | null
          fisico_origen: string
          id: string
          interprete_confianza: string
          observacion_uriel: string | null
          producto_id: string
          propuesta_causa: string | null
          propuesta_delta: number | null
          propuesta_en: string | null
          propuesta_nota: string | null
          propuesta_por_telegram: string | null
          propuesta_por_usuario: string | null
          reportada_en: string
          reportada_por_telegram: string | null
          reportada_por_usuario: string | null
          ronda_id: string
          teorico_conteo: number
          transcrito_id: string | null
          updated_at: string
          via_propuesta: string
        }
        Insert: {
          aplicacion_en?: string | null
          aplicacion_movimiento_id?: string | null
          aplicacion_por_telegram?: string | null
          aplicacion_por_usuario?: string | null
          cantidad_fisica: number
          captura_en?: string | null
          captura_movimiento_id?: string | null
          captura_por_telegram?: string | null
          captura_por_usuario?: string | null
          causa_sugerida?: string | null
          created_at?: string
          decision_causa?: string | null
          decision_en?: string | null
          decision_nota?: string | null
          decision_por_telegram?: string | null
          decision_por_usuario?: string | null
          estado?: Database["public"]["Enums"]["estado_excepcion_inventario"]
          explicacion_citada?: string | null
          explicacion_david?: string | null
          explicacion_david_accion?: string | null
          explicacion_david_en?: string | null
          explicacion_david_telegram?: string | null
          explicacion_david_usuario?: string | null
          fisico_origen: string
          id?: string
          interprete_confianza: string
          observacion_uriel?: string | null
          producto_id: string
          propuesta_causa?: string | null
          propuesta_delta?: number | null
          propuesta_en?: string | null
          propuesta_nota?: string | null
          propuesta_por_telegram?: string | null
          propuesta_por_usuario?: string | null
          reportada_en?: string
          reportada_por_telegram?: string | null
          reportada_por_usuario?: string | null
          ronda_id: string
          teorico_conteo: number
          transcrito_id?: string | null
          updated_at?: string
          via_propuesta: string
        }
        Update: {
          aplicacion_en?: string | null
          aplicacion_movimiento_id?: string | null
          aplicacion_por_telegram?: string | null
          aplicacion_por_usuario?: string | null
          cantidad_fisica?: number
          captura_en?: string | null
          captura_movimiento_id?: string | null
          captura_por_telegram?: string | null
          captura_por_usuario?: string | null
          causa_sugerida?: string | null
          created_at?: string
          decision_causa?: string | null
          decision_en?: string | null
          decision_nota?: string | null
          decision_por_telegram?: string | null
          decision_por_usuario?: string | null
          estado?: Database["public"]["Enums"]["estado_excepcion_inventario"]
          explicacion_citada?: string | null
          explicacion_david?: string | null
          explicacion_david_accion?: string | null
          explicacion_david_en?: string | null
          explicacion_david_telegram?: string | null
          explicacion_david_usuario?: string | null
          fisico_origen?: string
          id?: string
          interprete_confianza?: string
          observacion_uriel?: string | null
          producto_id?: string
          propuesta_causa?: string | null
          propuesta_delta?: number | null
          propuesta_en?: string | null
          propuesta_nota?: string | null
          propuesta_por_telegram?: string | null
          propuesta_por_usuario?: string | null
          reportada_en?: string
          reportada_por_telegram?: string | null
          reportada_por_usuario?: string | null
          ronda_id?: string
          teorico_conteo?: number
          transcrito_id?: string | null
          updated_at?: string
          via_propuesta?: string
        }
        Relationships: [
          {
            foreignKeyName: "rondas_excepciones_aplicacion_movimiento_id_fkey"
            columns: ["aplicacion_movimiento_id"]
            isOneToOne: false
            referencedRelation: "movimientos_inventario"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "rondas_excepciones_aplicacion_por_telegram_fkey"
            columns: ["aplicacion_por_telegram"]
            isOneToOne: false
            referencedRelation: "telegram_usuarios"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "rondas_excepciones_captura_movimiento_id_fkey"
            columns: ["captura_movimiento_id"]
            isOneToOne: false
            referencedRelation: "movimientos_inventario"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "rondas_excepciones_captura_por_telegram_fkey"
            columns: ["captura_por_telegram"]
            isOneToOne: false
            referencedRelation: "telegram_usuarios"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "rondas_excepciones_causa_sugerida_fkey"
            columns: ["causa_sugerida"]
            isOneToOne: false
            referencedRelation: "inventario_causas_raiz"
            referencedColumns: ["clave"]
          },
          {
            foreignKeyName: "rondas_excepciones_decision_causa_fkey"
            columns: ["decision_causa"]
            isOneToOne: false
            referencedRelation: "inventario_causas_raiz"
            referencedColumns: ["clave"]
          },
          {
            foreignKeyName: "rondas_excepciones_decision_por_telegram_fkey"
            columns: ["decision_por_telegram"]
            isOneToOne: false
            referencedRelation: "telegram_usuarios"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "rondas_excepciones_explicacion_david_telegram_fkey"
            columns: ["explicacion_david_telegram"]
            isOneToOne: false
            referencedRelation: "telegram_usuarios"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "rondas_excepciones_producto_id_fkey"
            columns: ["producto_id"]
            isOneToOne: false
            referencedRelation: "productos"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "rondas_excepciones_propuesta_causa_fkey"
            columns: ["propuesta_causa"]
            isOneToOne: false
            referencedRelation: "inventario_causas_raiz"
            referencedColumns: ["clave"]
          },
          {
            foreignKeyName: "rondas_excepciones_propuesta_por_telegram_fkey"
            columns: ["propuesta_por_telegram"]
            isOneToOne: false
            referencedRelation: "telegram_usuarios"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "rondas_excepciones_reportada_por_telegram_fkey"
            columns: ["reportada_por_telegram"]
            isOneToOne: false
            referencedRelation: "telegram_usuarios"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "rondas_excepciones_ronda_id_fkey"
            columns: ["ronda_id"]
            isOneToOne: false
            referencedRelation: "rondas_inventario"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "rondas_excepciones_transcrito_id_fkey"
            columns: ["transcrito_id"]
            isOneToOne: false
            referencedRelation: "rondas_transcritos"
            referencedColumns: ["id"]
          },
        ]
      }
      rondas_inventario: {
        Row: {
          abierta_en: string | null
          abierta_por_telegram: string | null
          abierta_por_usuario: string | null
          alcance_declarado: string | null
          alcance_nota: string | null
          cerrada_en: string | null
          cerrada_por_telegram: string | null
          cerrada_por_usuario: string | null
          created_at: string
          es_linea_base: boolean
          estado: Database["public"]["Enums"]["estado_ronda_inventario"]
          id: string
          observaciones_libres: Json
          periodo: string
          updated_at: string
        }
        Insert: {
          abierta_en?: string | null
          abierta_por_telegram?: string | null
          abierta_por_usuario?: string | null
          alcance_declarado?: string | null
          alcance_nota?: string | null
          cerrada_en?: string | null
          cerrada_por_telegram?: string | null
          cerrada_por_usuario?: string | null
          created_at?: string
          es_linea_base?: boolean
          estado?: Database["public"]["Enums"]["estado_ronda_inventario"]
          id?: string
          observaciones_libres?: Json
          periodo: string
          updated_at?: string
        }
        Update: {
          abierta_en?: string | null
          abierta_por_telegram?: string | null
          abierta_por_usuario?: string | null
          alcance_declarado?: string | null
          alcance_nota?: string | null
          cerrada_en?: string | null
          cerrada_por_telegram?: string | null
          cerrada_por_usuario?: string | null
          created_at?: string
          es_linea_base?: boolean
          estado?: Database["public"]["Enums"]["estado_ronda_inventario"]
          id?: string
          observaciones_libres?: Json
          periodo?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "rondas_inventario_abierta_por_telegram_fkey"
            columns: ["abierta_por_telegram"]
            isOneToOne: false
            referencedRelation: "telegram_usuarios"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "rondas_inventario_cerrada_por_telegram_fkey"
            columns: ["cerrada_por_telegram"]
            isOneToOne: false
            referencedRelation: "telegram_usuarios"
            referencedColumns: ["id"]
          },
        ]
      }
      rondas_inventario_alcance: {
        Row: {
          cantidad_teorica: number
          nombre_producto: string
          precio_unitario: number | null
          producto_id: string
          ronda_id: string
          unidad: Database["public"]["Enums"]["unidad_medida"]
        }
        Insert: {
          cantidad_teorica: number
          nombre_producto: string
          precio_unitario?: number | null
          producto_id: string
          ronda_id: string
          unidad: Database["public"]["Enums"]["unidad_medida"]
        }
        Update: {
          cantidad_teorica?: number
          nombre_producto?: string
          precio_unitario?: number | null
          producto_id?: string
          ronda_id?: string
          unidad?: Database["public"]["Enums"]["unidad_medida"]
        }
        Relationships: [
          {
            foreignKeyName: "rondas_inventario_alcance_producto_id_fkey"
            columns: ["producto_id"]
            isOneToOne: false
            referencedRelation: "productos"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "rondas_inventario_alcance_ronda_id_fkey"
            columns: ["ronda_id"]
            isOneToOne: false
            referencedRelation: "rondas_inventario"
            referencedColumns: ["id"]
          },
        ]
      }
      rondas_monitoreo: {
        Row: {
          created_at: string | null
          fecha_fin: string | null
          fecha_inicio: string
          id: string
          nombre: string | null
          observaciones: string | null
        }
        Insert: {
          created_at?: string | null
          fecha_fin?: string | null
          fecha_inicio: string
          id?: string
          nombre?: string | null
          observaciones?: string | null
        }
        Update: {
          created_at?: string | null
          fecha_fin?: string | null
          fecha_inicio?: string
          id?: string
          nombre?: string | null
          observaciones?: string | null
        }
        Relationships: []
      }
      rondas_reportes: {
        Row: {
          contenido: Json
          emitido_en: string
          incluye_valoracion: boolean
          ronda_id: string
          texto_telegram: string
        }
        Insert: {
          contenido: Json
          emitido_en?: string
          incluye_valoracion: boolean
          ronda_id: string
          texto_telegram: string
        }
        Update: {
          contenido?: Json
          emitido_en?: string
          incluye_valoracion?: boolean
          ronda_id?: string
          texto_telegram?: string
        }
        Relationships: [
          {
            foreignKeyName: "rondas_reportes_ronda_id_fkey"
            columns: ["ronda_id"]
            isOneToOne: true
            referencedRelation: "rondas_inventario"
            referencedColumns: ["id"]
          },
        ]
      }
      rondas_transcritos: {
        Row: {
          actor_telegram_id: string | null
          actor_usuario_id: string | null
          confirmado_en: string | null
          correcciones: Json
          created_at: string
          duracion_audio_seg: number | null
          estado: string
          id: string
          intentos_preview: number
          interpretacion: Json | null
          preview: Json | null
          ronda_id: string
          transcrito: string
        }
        Insert: {
          actor_telegram_id?: string | null
          actor_usuario_id?: string | null
          confirmado_en?: string | null
          correcciones?: Json
          created_at?: string
          duracion_audio_seg?: number | null
          estado?: string
          id?: string
          intentos_preview?: number
          interpretacion?: Json | null
          preview?: Json | null
          ronda_id: string
          transcrito: string
        }
        Update: {
          actor_telegram_id?: string | null
          actor_usuario_id?: string | null
          confirmado_en?: string | null
          correcciones?: Json
          created_at?: string
          duracion_audio_seg?: number | null
          estado?: string
          id?: string
          intentos_preview?: number
          interpretacion?: Json | null
          preview?: Json | null
          ronda_id?: string
          transcrito?: string
        }
        Relationships: [
          {
            foreignKeyName: "rondas_transcritos_actor_telegram_id_fkey"
            columns: ["actor_telegram_id"]
            isOneToOne: false
            referencedRelation: "telegram_usuarios"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "rondas_transcritos_ronda_id_fkey"
            columns: ["ronda_id"]
            isOneToOne: false
            referencedRelation: "rondas_inventario"
            referencedColumns: ["id"]
          },
        ]
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
      telegram_alertas_suscripciones: {
        Row: {
          alerta_clave: string
          escalamiento: boolean
          recibe: boolean
          telegram_usuario_id: string
          updated_at: string
          updated_by: string | null
        }
        Insert: {
          alerta_clave: string
          escalamiento?: boolean
          recibe?: boolean
          telegram_usuario_id: string
          updated_at?: string
          updated_by?: string | null
        }
        Update: {
          alerta_clave?: string
          escalamiento?: boolean
          recibe?: boolean
          telegram_usuario_id?: string
          updated_at?: string
          updated_by?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "telegram_alertas_suscripciones_alerta_clave_fkey"
            columns: ["alerta_clave"]
            isOneToOne: false
            referencedRelation: "alertas_catalogo"
            referencedColumns: ["clave"]
          },
          {
            foreignKeyName: "telegram_alertas_suscripciones_telegram_usuario_id_fkey"
            columns: ["telegram_usuario_id"]
            isOneToOne: false
            referencedRelation: "telegram_usuarios"
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
          modulos_acceso: string[]
          nombre_completo: string | null
          rol: Database["public"]["Enums"]["rol_usuario"]
        }
        Insert: {
          activo?: boolean | null
          created_at?: string | null
          email: string
          id: string
          last_login?: string | null
          modulos_acceso?: string[]
          nombre_completo?: string | null
          rol: Database["public"]["Enums"]["rol_usuario"]
        }
        Update: {
          activo?: boolean | null
          created_at?: string | null
          email?: string
          id?: string
          last_login?: string | null
          modulos_acceso?: string[]
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
      v_hato_estado_actual: {
        Row: {
          animal_id: string | null
          estado: string | null
          etapa: string | null
          etapa_forzada: boolean | null
          fecha_nacimiento: string | null
          fecha_probable_parto: string | null
          fecha_secar: string | null
          meses_prenez: number | null
          nombre: string | null
          num_partos: number | null
          numero: number | null
          pl: number | null
          raza: string | null
          ultima_confirmacion_prenez_fecha: string | null
          ultima_confirmacion_prenez_metodo: string | null
          ultimo_aborto_fecha: string | null
          ultimo_chequeo_fecha: string | null
          ultimo_chequeo_vaca_id: string | null
          ultimo_estado_chequeo: string | null
          ultimo_evento_fecha: string | null
          ultimo_parto_fecha: string | null
          ultimo_secado_real_fecha: string | null
          ultimo_servicio_fecha: string | null
          ultimo_servicio_toro_id: string | null
          ultimo_tipo_servicio: string | null
        }
        Relationships: [
          {
            foreignKeyName: "hato_eventos_toro_id_fkey"
            columns: ["ultimo_servicio_toro_id"]
            isOneToOne: false
            referencedRelation: "hato_toros"
            referencedColumns: ["id"]
          },
        ]
      }
      v_hato_pajillas_stock: {
        Row: {
          cantidad_actual: number | null
          cantidad_inicial: number | null
          pajilla_id: string | null
          toro_id: string | null
          usos: number | null
        }
        Relationships: [
          {
            foreignKeyName: "hato_pajillas_toro_id_fkey"
            columns: ["toro_id"]
            isOneToOne: false
            referencedRelation: "hato_toros"
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
      es_usuario_gerencia: { Args: never; Returns: boolean }
      fn_alertas_horario_cambiar: {
        Args: { p_hora: string; p_jobname: string }
        Returns: {
          activo: boolean
          hora_bogota: string
          jobname: string
        }[]
      }
      fn_alertas_horario_listar: {
        Args: never
        Returns: {
          activo: boolean
          hora_bogota: string
          jobname: string
        }[]
      }
      fn_cerrar_aplicacion: { Args: { payload: Json }; Returns: Json }
      fn_cleanup_compra_dependencies: {
        Args: { p_compra_id: string }
        Returns: undefined
      }
      fn_clima_candado_soltar: { Args: { p_dueno: string }; Returns: boolean }
      fn_clima_candado_tomar: {
        Args: { p_dueno: string; p_segundos: number }
        Returns: boolean
      }
      fn_clima_rollup_diario: { Args: { p_fecha?: string }; Returns: undefined }
      fn_cosecha_aguacate: { Args: { p_fecha: string }; Returns: string }
      fn_ganado_confirmar_pendiente_multi: {
        Args: { p_filas: Json; p_movimiento_id: string }
        Returns: number
      }
      fn_ganado_registrar_traslado_multi: {
        Args: {
          p_destinos: Json
          p_fecha: string
          p_notas?: string
          p_origenes: Json
          p_peso_promedio_kg?: number
        }
        Returns: number
      }
      fn_hato_commit_chequeo: {
        Args: { p_created_by: string; payload: Json }
        Returns: Json
      }
      fn_hato_confirmar_paso_tratamiento: {
        Args: {
          p_animal_id: string
          p_fecha_ejecutada: string
          p_paso_id: string
          p_respondida_por: string
        }
        Returns: Json
      }
      fn_hato_eliminar_quincena_venta: {
        Args: { p_quincena_id: string }
        Returns: Json
      }
      fn_hato_guardar_quincena_venta: { Args: { payload: Json }; Returns: Json }
      fn_hato_registrar_tratamiento: {
        Args: {
          p_animal_id: string
          p_created_by?: string
          p_descripcion_paso?: string
          p_fecha_inicio: string
          p_fecha_proximo_paso?: string
          p_fuente?: string
          p_nombre: string
          p_nota?: string
        }
        Returns: string
      }
      fn_hato_registrar_venta_animales: {
        Args: { payload: Json }
        Returns: Json
      }
      fn_informes_visita_snippet_fts: {
        Args: { p_temas: string[]; p_texto: string }
        Returns: unknown
      }
      fn_novedades_autores: {
        Args: { p_ids: string[] }
        Returns: {
          id: string
          nombre: string
        }[]
      }
      fn_ronda_abrir: { Args: { payload: Json }; Returns: Json }
      fn_ronda_actor_correo: {
        Args: { p_telegram: string; p_usuario: string }
        Returns: string
      }
      fn_ronda_actor_nombre: {
        Args: { p_telegram: string; p_usuario: string }
        Returns: string
      }
      fn_ronda_aplicar_ajuste: { Args: { payload: Json }; Returns: Json }
      fn_ronda_cerrar: { Args: { payload: Json }; Returns: Json }
      fn_ronda_confirmar_hallazgos: { Args: { payload: Json }; Returns: Json }
      fn_ronda_decidir_ajuste: { Args: { payload: Json }; Returns: Json }
      fn_ronda_deshacer_confirmacion: { Args: { payload: Json }; Returns: Json }
      fn_ronda_emitir_reporte: { Args: { payload: Json }; Returns: Json }
      fn_ronda_explicacion_david: { Args: { payload: Json }; Returns: Json }
      fn_ronda_proponer_ajuste: { Args: { payload: Json }; Returns: Json }
      fn_ronda_resolver_con_captura: { Args: { payload: Json }; Returns: Json }
      fn_ronda_validar_actor: {
        Args: { p_modulo: string; p_telegram: string; p_usuario: string }
        Returns: undefined
      }
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
      po_sonda: {
        Args: { p_consulta: string; p_preparacion?: string[] }
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
      estado_excepcion_inventario:
        | "reportada"
        | "explicacion_precargada"
        | "explicada"
        | "cerrada_sin_ajuste"
        | "resuelta_con_captura"
        | "ajuste_propuesto"
        | "ajuste_aprobado"
        | "ajuste_desestimado"
        | "ajuste_aplicado"
      estado_fisico: "Líquido" | "Sólido"
      estado_producto:
        | "OK"
        | "Sin existencias"
        | "Vencido"
        | "Perdido"
        | "Próximo a vencer (3 meses)"
      estado_ronda_inventario: "programada" | "en_curso" | "cerrada" | "omitida"
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
  TableName extends (DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
        DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])
    : never) = never,
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
  TableName extends (DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never) = never,
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
  TableName extends (DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never) = never,
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
  EnumName extends (DefaultSchemaEnumNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"]
    : never) = never,
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
  CompositeTypeName extends (PublicCompositeTypeNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"]
    : never) = never,
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
      estado_excepcion_inventario: [
        "reportada",
        "explicacion_precargada",
        "explicada",
        "cerrada_sin_ajuste",
        "resuelta_con_captura",
        "ajuste_propuesto",
        "ajuste_aprobado",
        "ajuste_desestimado",
        "ajuste_aplicado",
      ],
      estado_fisico: ["Líquido", "Sólido"],
      estado_producto: [
        "OK",
        "Sin existencias",
        "Vencido",
        "Perdido",
        "Próximo a vencer (3 meses)",
      ],
      estado_ronda_inventario: ["programada", "en_curso", "cerrada", "omitida"],
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
