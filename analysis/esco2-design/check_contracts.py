"""Prueba offline del diseño. No es ejecutor, autenticador ni frontera RLS.

No lee variables de entorno, credenciales o datos externos. No usa red.
"""
import copy
import datetime
import decimal
import json
from pathlib import Path
import unittest

from jsonschema import Draft202012Validator, FormatChecker
from jsonschema.exceptions import ValidationError

REGISTRO = json.loads(Path(__file__).with_name("operations.json").read_text())
OPERACION = REGISTRO["operations"][0]


def esquema_modelo(operacion):
    return {"name": operacion["name"], "description": operacion["description"],
            "parameters": operacion["parameters"]}


def validar(argumentos, operacion=OPERACION):
    Draft202012Validator(operacion["parameters"], format_checker=FormatChecker()).validate(argumentos)
    inicio = datetime.date.fromisoformat(argumentos["desde"])
    fin = datetime.date.fromisoformat(argumentos["hasta"])
    dias = (fin - inicio).days + 1
    if dias < 1 or dias > operacion["semanticRules"]["maximumInclusiveDays"]:
        raise ValueError("periodo_fuera_de_limite")


class ContratoDiseno(unittest.TestCase):
    def setUp(self):
        self.argumentos = {"desde": "2026-10-01", "hasta": "2026-10-31", "lotes": [],
                           "grupo": "lote", "metricas": ["jornales", "costo_registrado"]}

    def test_argumentos_publicados_validos(self):
        Draft202012Validator.check_schema(OPERACION["parameters"])
        validar(self.argumentos)
        self.assertIs(esquema_modelo(OPERACION)["parameters"], OPERACION["parameters"])

    def test_fronteras_rechazadas(self):
        variantes = [{"sql": "SELECT * FROM usuarios"}, {"tabla": "fin_gastos"},
                     {"role": "Gerencia"}, {"lotes": ["lote-a", "lote-a"]},
                     {"metricas": ["salario"]}, {"grupo": "empleado"},
                     {"desde": "2026-02-30"}, {"desde": "2026-11-01"},
                     {"desde": "2024-01-01"}, {"metricas": []}]
        for cambio in variantes:
            with self.subTest(cambio=cambio), self.assertRaises((ValidationError, ValueError)):
                validar(self.argumentos | cambio)

    def test_cambio_contrato_llega_a_ambas_superficies(self):
        nueva = copy.deepcopy(OPERACION)
        nueva["parameters"]["properties"]["grupo"]["enum"].append("tarea")
        self.assertIn("tarea", esquema_modelo(nueva)["parameters"]["properties"]["grupo"]["enum"])
        validar(self.argumentos | {"grupo": "tarea"}, nueva)
        with self.assertRaises(ValidationError):
            validar(self.argumentos | {"grupo": "tarea"})

    def test_oraculo_sintetico_incluye_sin_lote_y_faltantes(self):
        # Oráculo mínimo independiente de lectores del producto; sólo prueba la regla propuesta.
        filas = [("lote-a", "0.5", "100"), (None, "0.25", "40"), ("lote-a", "1", None)]
        grupos = {}
        faltantes = 0
        for lote, _, costo in filas:
            if costo is None:
                faltantes += 1
                continue
            grupos[lote] = grupos.get(lote, decimal.Decimal(0)) + decimal.Decimal(costo)
        self.assertEqual(grupos, {"lote-a": decimal.Decimal("100"), None: decimal.Decimal("40")})
        self.assertEqual(sum(grupos.values()), decimal.Decimal("140"))
        self.assertEqual(faltantes, 1)  # subtotal, no total completo
        self.assertEqual(sum(decimal.Decimal(f[1]) for f in filas), decimal.Decimal("1.75"))
        # Mutante que elimina lote nulo: el resultado debe diferir del oráculo.
        self.assertNotEqual(sum(v for k, v in grupos.items() if k is not None), decimal.Decimal("140"))


if __name__ == "__main__":
    unittest.main(verbosity=2)
