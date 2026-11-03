"""Compatibilidad sintáctica sintética; no prueba equivalencia con el lector legado."""
import unittest

from jsonschema.exceptions import ValidationError

from labor_compatibility import convertir_fechas_legadas


class CompatibilidadLabor(unittest.TestCase):
    def setUp(self):
        self.fechas = {"date_from": "2026-10-01", "date_to": "2026-10-31"}
        self.opciones = {"lotes": ["lote-a"], "grupo": "total", "metricas": ["jornales"]}

    def test_conversion_solo_renombra_fechas(self):
        self.assertEqual(convertir_fechas_legadas(self.fechas, self.opciones),
                         {"desde": "2026-10-01", "hasta": "2026-10-31", **self.opciones})

    def test_no_descarta_selectores_o_campos_servidor(self):
        for campo, valor in [("lote_name", "Lote A"), ("lote_name", None),
                             ("reference_day", "2026-10-31"), ("empleado_id", "persona-sintetica")]:
            with self.subTest(campo=campo, valor=valor), self.assertRaisesRegex(ValueError, "no_representable"):
                convertir_fechas_legadas(self.fechas | {campo: valor}, self.opciones)

    def test_rechaza_aliases_en_conflicto_o_fechas_ausentes(self):
        for fechas in [self.fechas | {"desde": "2026-09-01"}, {"date_from": "2026-10-01"}]:
            with self.subTest(fechas=fechas), self.assertRaises(ValueError):
                convertir_fechas_legadas(fechas, self.opciones)

    def test_no_inventa_defaults_ni_acepta_override_de_fechas(self):
        for opciones in [{}, {"grupo": "lote"}, self.opciones | {"desde": "1900-01-01"}]:
            with self.subTest(opciones=opciones), self.assertRaises(ValueError):
                convertir_fechas_legadas(self.fechas, opciones)

    def test_valida_con_el_registro_canonico(self):
        for fechas, opciones in [(self.fechas | {"date_from": "2026-02-30"}, self.opciones),
                                 (self.fechas | {"date_from": "1900-01-01"}, self.opciones),
                                 (self.fechas, self.opciones | {"metricas": ["salario"]})]:
            with self.subTest(fechas=fechas, opciones=opciones), self.assertRaises((ValueError, ValidationError)):
                convertir_fechas_legadas(fechas, opciones)

    def test_resultado_no_comparte_listas_con_llamador(self):
        salida = convertir_fechas_legadas(self.fechas, self.opciones)
        self.opciones["lotes"].append("lote-b")
        self.opciones["metricas"].append("costo_registrado")
        self.assertEqual(salida["lotes"], ["lote-a"])
        self.assertEqual(salida["metricas"], ["jornales"])


if __name__ == "__main__":
    unittest.main(verbosity=2)
