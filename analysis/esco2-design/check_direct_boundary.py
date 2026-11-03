"""Contrato adversarial de preparación B sobre identidades y puertos ficticios.

No prueba firma/expiración JWT, base de datos, RLS, red ni aceptación de producto.
"""
from concurrent.futures import ThreadPoolExecutor
import unittest

from jsonschema.exceptions import ValidationError

from direct_boundary import Denegado, FronteraDirecta, Perfil


class FronteraSintetica(unittest.TestCase):
    def setUp(self):
        self.sesiones = {"sesion-a": "actor-a", "sesion-b": "actor-b"}
        self.perfiles = {
            "actor-a": Perfil("Gerencia", True, frozenset({"lote-a"}), True),
            "actor-b": Perfil("Gerencia", True, frozenset({"lote-b"})),
        }
        self.duenos = {"conversacion-a": "actor-a", "conversacion-b": "actor-b"}
        self.lecturas = []
        self.frontera = FronteraDirecta(self.sesiones.get, self.perfiles.get,
                                        self.duenos.get, self.leer)
        self.argumentos = {"desde": "2026-10-01", "hasta": "2026-10-31", "lotes": [],
                           "grupo": "lote", "metricas": ["jornales", "costo_registrado"]}

    def leer(self, solicitud):
        self.lecturas.append(solicitud)
        return solicitud  # No existe fuente de negocio, ni siquiera remota.

    def ejecutar(self, **cambios):
        params = {"sesion_sintetica": "sesion-a", "canal": "web", "conversacion": "conversacion-a",
                  "operacion": "labores.resumen.v1", "argumentos": self.argumentos}
        return self.frontera.ejecutar(**(params | cambios))

    def test_lectura_fija_minima_y_ambito_del_servidor(self):
        resultado = self.ejecutar()
        self.assertEqual(resultado.tabla, "registros_trabajo")
        self.assertEqual(resultado.columnas, ("id", "fecha_trabajo", "lote_id", "fraccion_jornal", "costo_jornal"))
        self.assertEqual(resultado.metodo, "read")
        self.assertEqual(resultado.lotes, ("lote-a",))  # vacío nunca significa todos los datos
        self.assertTrue(resultado.incluye_sin_lote)

    def test_agrupacion_y_metricas_sobreviven_sin_perdida(self):
        for grupo, metricas in [("total", ["jornales"]), ("lote", ["costo_registrado"]),
                                ("lote", ["jornales", "costo_registrado"])]:
            with self.subTest(grupo=grupo, metricas=metricas):
                salida = self.ejecutar(argumentos=self.argumentos | {"grupo": grupo, "metricas": metricas})
                self.assertEqual(salida.grupo, grupo)
                self.assertEqual(salida.metricas, tuple(metricas))
                self.assertEqual(salida.operacion, "labores.resumen.v1")
                self.assertEqual(salida.campo_fecha, "fecha_trabajo")

    def test_proyeccion_depende_solo_de_metricas_pedidas(self):
        jornales = self.ejecutar(argumentos=self.argumentos | {"metricas": ["jornales"]})
        costos = self.ejecutar(argumentos=self.argumentos | {"metricas": ["costo_registrado"]})
        self.assertEqual(jornales.columnas, ("id", "fecha_trabajo", "lote_id", "fraccion_jornal"))
        self.assertEqual(costos.columnas, ("id", "fecha_trabajo", "lote_id", "costo_jornal"))

    def test_identidad_canal_propiedad_invalidos_no_leen(self):
        for cambio in [{"sesion_sintetica": "no-existe"}, {"canal": "telegram"},
                       {"conversacion": "conversacion-b"}, {"conversacion": "no-existe"},
                       {"operacion": "SQL"}]:
            with self.subTest(cambio=cambio), self.assertRaises(Denegado):
                self.ejecutar(**cambio)
        self.assertEqual(self.lecturas, [])

    def test_perfil_ausente_inactivo_otro_rol_no_lee(self):
        for perfil in [None, Perfil("Gerencia", False, frozenset({"lote-a"})),
                       Perfil("Administrador", True, frozenset({"lote-a"}))]:
            self.perfiles["actor-a"] = perfil
            with self.subTest(perfil=perfil), self.assertRaises(Denegado):
                self.ejecutar()
        self.assertEqual(self.lecturas, [])

    def test_plan_no_puede_proponer_identidad_fuente_o_escritura(self):
        for clave, valor in [("sujeto", "actor-b"), ("role", "Gerencia"),
                             ("tabla", "usuarios"), ("columnas", ["salario"]),
                             ("sql", "DELETE FROM registros_trabajo"), ("metodo", "write")]:
            with self.subTest(clave=clave), self.assertRaises(ValidationError):
                self.ejecutar(argumentos=self.argumentos | {clave: valor})
        self.assertEqual(self.lecturas, [])

    def test_lote_ajeno_y_ambito_vacio_no_leen(self):
        with self.assertRaises(Denegado):
            self.ejecutar(argumentos=self.argumentos | {"lotes": ["lote-b"]})
        self.perfiles["actor-a"] = Perfil("Gerencia", True, frozenset())
        with self.assertRaises(Denegado):
            self.ejecutar()
        self.assertEqual(self.lecturas, [])

    def test_sin_lote_requiere_permiso_y_no_amplia_filtro_explicito(self):
        a = self.ejecutar(argumentos=self.argumentos | {"lotes": ["lote-a"]})
        b = self.ejecutar(sesion_sintetica="sesion-b", conversacion="conversacion-b")
        self.assertFalse(a.incluye_sin_lote)
        self.assertFalse(b.incluye_sin_lote)

    def test_revocacion_entre_operaciones_no_hereda_permiso(self):
        self.ejecutar()
        self.perfiles["actor-a"] = Perfil("Monitor", True, frozenset({"lote-a"}))
        with self.assertRaises(Denegado):
            self.ejecutar()
        self.assertEqual(len(self.lecturas), 1)

    def test_cambio_propietario_antes_de_leer_no_lee(self):
        contador = 0

        def propietario_cambia(conversacion):
            nonlocal contador
            contador += 1
            return "actor-a" if contador == 1 else "actor-b"

        self.frontera._propietario = propietario_cambia
        with self.assertRaises(Denegado):
            self.ejecutar()
        self.assertEqual(self.lecturas, [])

    def test_perdida_de_ambito_antes_de_leer_no_lee(self):
        contador = 0

        def perfil_cambia(sujeto):
            nonlocal contador
            contador += 1
            return self.perfiles[sujeto] if contador == 1 else Perfil("Gerencia", True, frozenset())

        self.frontera._perfil = perfil_cambia
        with self.assertRaises(Denegado):
            self.ejecutar(argumentos=self.argumentos | {"lotes": ["lote-a"]})
        self.assertEqual(self.lecturas, [])

    def test_argumentos_mutados_despues_de_validar_no_cambian_lectura(self):
        contador = 0

        def perfil_muta_argumentos(sujeto):
            nonlocal contador
            contador += 1
            if contador == 2:
                self.argumentos["desde"] = "1900-01-01"
            return self.perfiles[sujeto]

        self.frontera._perfil = perfil_muta_argumentos
        lectura = self.ejecutar()
        self.assertEqual(lectura.desde, "2026-10-01")
        self.assertEqual(lectura.lotes, ("lote-a",))

    def test_registro_mutado_no_cambia_contrato_capturado(self):
        from check_contracts import OPERACION
        import copy
        original = copy.deepcopy(OPERACION)
        contador = 0

        def perfil_muta_registro(sujeto):
            nonlocal contador
            contador += 1
            if contador == 2:
                OPERACION["source"]["table"] = "usuarios"
                OPERACION["source"]["projection"] = ["salario"]
            return self.perfiles[sujeto]

        try:
            self.frontera._perfil = perfil_muta_registro
            lectura = self.ejecutar()
            self.assertEqual(lectura.tabla, "registros_trabajo")
            self.assertNotIn("salario", lectura.columnas)
        finally:
            OPERACION.clear()
            OPERACION.update(original)

    def test_autoridad_malformada_cierra_acceso(self):
        perfiles = [Perfil("Gerencia", "false", frozenset({"lote-a"})),
                    Perfil("Gerencia", True, frozenset({"lote-a"}), "false"),
                    Perfil("Gerencia", True, "lote-a"),
                    Perfil("Gerencia", True, frozenset({1})),
                    {"rol": "Gerencia", "activo": True}]
        for perfil in perfiles:
            self.perfiles["actor-a"] = perfil
            with self.subTest(perfil=perfil), self.assertRaises(Denegado):
                self.ejecutar()
        self.assertEqual(self.lecturas, [])

    def test_puerto_no_puede_retornar_datos_al_solicitante(self):
        self.frontera._leer = lambda solicitud: {"salario": "SYNTHETIC-SENSITIVE"}
        salida = self.ejecutar()
        self.assertEqual(salida.sujeto, "actor-a")
        self.assertNotIsInstance(salida, dict)

    def test_dos_actores_concurrentes_no_comparten_ambito(self):
        with ThreadPoolExecutor(max_workers=2) as executor:
            primero = executor.submit(self.ejecutar)
            segundo = executor.submit(self.ejecutar, sesion_sintetica="sesion-b", conversacion="conversacion-b")
            a, b = primero.result(), segundo.result()
        self.assertEqual((a.sujeto, a.lotes), ("actor-a", ("lote-a",)))
        self.assertEqual((b.sujeto, b.lotes), ("actor-b", ("lote-b",)))
        self.assertEqual(len(self.lecturas), 2)

    def test_denegacion_antes_de_validacion_no_revela_contrato(self):
        with self.assertRaisesRegex(Denegado, "acceso_denegado"):
            self.ejecutar(conversacion="conversacion-b", argumentos={"sql": "malicioso"})
        self.assertEqual(self.lecturas, [])


if __name__ == "__main__":
    unittest.main(verbosity=2)
