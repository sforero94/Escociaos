"""Conversión sintáctica offline, sin equivalencia de operaciones o permisos.

No elige agrupación/métricas/ámbito; el llamador debe aportarlos explícitamente.
No interpreta lote_name, contexto, reference_day ni estados/resultados legados.
"""
import copy

from check_contracts import validar


def convertir_fechas_legadas(argumentos, opciones_explicitas):
    entrada = copy.deepcopy(argumentos)
    opciones = copy.deepcopy(opciones_explicitas)
    if type(entrada) is not dict or set(entrada) != {"date_from", "date_to"}:
        raise ValueError("contrato_legado_no_representable")
    if type(opciones) is not dict or set(opciones) != {"lotes", "grupo", "metricas"}:
        raise ValueError("opciones_explicitas_requeridas")
    canonico = {"desde": entrada["date_from"], "hasta": entrada["date_to"], **opciones}
    validar(canonico)
    return canonico
