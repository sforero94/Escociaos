"""Prototipo offline de solicitudes B, sin JWT, SQL, SDK, credenciales ni red.

El adaptador de identidad es sintético: sus sujetos NO son tokens verificados.
No importar desde producto. No acredita RLS ni atomicidad frente a revocaciones.
"""
from dataclasses import dataclass
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

    def _autorizar(self, sujeto, conversacion):
        perfil = self._perfil(sujeto)
        acceso = OPERACION["access"]
        if (perfil is None or perfil.rol != acceso["role"] or not perfil.activo
                or self._propietario(conversacion) != sujeto):
            raise Denegado("acceso_denegado")
        return perfil

    def ejecutar(self, sesion_sintetica, canal, conversacion, operacion, argumentos):
        # Sesión opaca sólo para la prueba; no acepta un subject/role del plan.
        sujeto = self._identidad(sesion_sintetica)
        if sujeto is None or canal != OPERACION["access"]["channel"]:
            raise Denegado("acceso_denegado")
        self._autorizar(sujeto, conversacion)
        if operacion != OPERACION["name"]:
            raise Denegado("operacion_no_permitida")
        validar(argumentos)
        # El perfil y dueño vigentes se consultan otra vez antes de cada lectura.
        perfil = self._autorizar(sujeto, conversacion)
        pedidos = frozenset(argumentos["lotes"])
        if not pedidos.issubset(perfil.lotes):
            raise Denegado("ambito_denegado")
        lotes = pedidos or perfil.lotes
        sin_lote = not pedidos and perfil.permite_sin_lote
        if not lotes and not sin_lote:
            raise Denegado("ambito_denegado")
        fuente = OPERACION["source"]
        solicitud = SolicitudLectura(
            sujeto, conversacion, fuente["table"], tuple(fuente["projection"]),
            tuple(sorted(lotes)), sin_lote, argumentos["desde"], argumentos["hasta"])
        return self._leer(solicitud)
