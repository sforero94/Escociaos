"""Prototipo offline de solicitudes B, sin JWT, SQL, SDK, credenciales ni red.

El adaptador de identidad es sintético: sus sujetos NO son tokens verificados.
No importar desde producto. No acredita RLS ni atomicidad frente a revocaciones.
"""
from dataclasses import dataclass
import copy
import hashlib
import json
from typing import Callable

from check_contracts import OPERACION, validar


class Denegado(Exception):
    """Rechazo seguro del prototipo, sin contexto ni datos de negocio."""


@dataclass(frozen=True)
class Perfil:
    rol: str
    activo: bool
    lotes: frozenset[str]
    permite_sin_lote: bool = False


@dataclass(frozen=True)
class SolicitudLectura:
    sujeto: str
    conversacion: str
    tabla: str
    columnas: tuple[str, ...]
    lotes: tuple[str, ...]
    incluye_sin_lote: bool
    desde: str
    hasta: str
    contrato_hash: str
    operacion: str
    grupo: str
    metricas: tuple[str, ...]
    campo_fecha: str
    # Es una solicitud cerrada, nunca SQL/URL/headers del modelo.
    metodo: str = "read"


class FronteraDirecta:
    def __init__(self, identidad: Callable[[str], str | None],
                 perfil: Callable[[str], Perfil | None],
                 propietario: Callable[[str], str | None],
                 leer: Callable[[SolicitudLectura], object]):
        self._identidad = identidad
        self._perfil = perfil
        self._propietario = propietario
        self._leer = leer
        # Serialización inmutable, sin alias al registro global o al esquema del modelo.
        self._contrato = json.dumps(OPERACION, sort_keys=True, separators=(",", ":"))
        self._contrato_hash = hashlib.sha256(self._contrato.encode()).hexdigest()

    def _autorizar(self, sujeto, conversacion, acceso):
        perfil = self._perfil(sujeto)
        if (not isinstance(perfil, Perfil) or perfil.rol != acceso["role"]
                or perfil.activo is not True or type(perfil.permite_sin_lote) is not bool
                or not isinstance(perfil.lotes, frozenset)
                or any(type(lote) is not str or not lote.strip() for lote in perfil.lotes)
                or self._propietario(conversacion) != sujeto):
            raise Denegado("acceso_denegado")
        return perfil

    def ejecutar(self, sesion_sintetica, canal, conversacion, operacion, argumentos):
        contrato = json.loads(self._contrato)
        # Sesión opaca sólo para la prueba; no acepta un subject/role del plan.
        sujeto = self._identidad(sesion_sintetica)
        if type(sujeto) is not str or not sujeto or canal != contrato["access"]["channel"]:
            raise Denegado("acceso_denegado")
        self._autorizar(sujeto, conversacion, contrato["access"])
        if operacion != contrato["name"]:
            raise Denegado("operacion_no_permitida")
        argumentos_validados = copy.deepcopy(argumentos)
        validar(argumentos_validados, contrato)
        # El perfil y dueño vigentes se consultan otra vez antes de cada lectura.
        perfil = self._autorizar(sujeto, conversacion, contrato["access"])
        pedidos = frozenset(argumentos_validados["lotes"])
        if not pedidos.issubset(perfil.lotes):
            raise Denegado("ambito_denegado")
        lotes = pedidos or perfil.lotes
        sin_lote = not pedidos and perfil.permite_sin_lote
        if not lotes and not sin_lote:
            raise Denegado("ambito_denegado")
        fuente = contrato["source"]
        metricas = tuple(argumentos_validados["metricas"])
        campos = set(fuente["identityProjection"]) | {contrato["metrics"][metrica]["field"] for metrica in metricas}
        columnas = tuple(campo for campo in fuente["projection"] if campo in campos)
        solicitud = SolicitudLectura(
            sujeto, conversacion, fuente["table"], columnas,
            tuple(sorted(lotes)), sin_lote, argumentos_validados["desde"],
            argumentos_validados["hasta"], self._contrato_hash, contrato["name"],
            argumentos_validados["grupo"], metricas, fuente["dateField"])
        self._leer(solicitud)  # Espía de emisión; su salida no es evidencia ni se devuelve.
        return solicitud
