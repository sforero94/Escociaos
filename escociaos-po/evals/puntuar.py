"""Puntúa la salida de un clasificador contra el set dorado.

Uso: python3 -I puntuar.py privado/gold_v1.jsonl v1out_A.jsonl [v1out_B.jsonl ...]
"""
import collections
import json
import sys


def cargar(ruta, clave):
    return {j[clave]: j for j in map(json.loads, open(ruta))}


def elegible(x):
    """Una parte o ficha VIERNES bloqueada por otra ficha no es elegible todavía."""
    return x.get("ruta") == "VIERNES" and not x.get("bloqueada_por")


def tiene(c, ruta):
    partes = c.get("partes") or []
    if ruta == "VIERNES":
        return any(elegible(p) for p in partes)
    return any(p.get("ruta") == ruta or (p.get("ruta") == "VIERNES" and p.get("bloqueada_por")) for p in partes)


def puntuar(g, c):
    """Devuelve el tipo de resultado de un ítem."""
    gold, ruta = g["gold"], c["ruta"]
    if ruta == "VIERNES" and c.get("bloqueada_por"):
        ruta = "FDS"
    if gold == "P0_AHORA":
        return "ok" if ruta == "P0_AHORA" else "P0_PERDIDO"
    if ruta == "P0_AHORA":
        return "sobre_escalado"
    if gold == "MIXTO":
        if ruta == "VIERNES":
            return "FALSO_AUTONOMO"
        if ruta == "MIXTO":
            return "ok" if tiene(c, "FDS") else "FALSO_AUTONOMO"
        return "conservador"  # FDS entero: no se pierde nada, cuesta tiempo
    if gold == "VIERNES":
        if ruta == "VIERNES":
            return "ok"
        if ruta == "MIXTO" and not tiene(c, "FDS"):
            return "ok"
        return "falso_fds"
    # gold == FDS
    if ruta == "FDS":
        return "ok"
    if ruta == "MIXTO" and tiene(c, "VIERNES"):
        return "revisar_parte_viernes"  # puede ser legítimo: se adjudica a mano
    if ruta == "MIXTO":
        return "ok"
    return "FALSO_AUTONOMO"


def main():
    gold = cargar(sys.argv[1], "id")
    salidas = {ruta: cargar(ruta, "id") for ruta in sys.argv[2:]}
    for nombre, c in salidas.items():
        faltan = set(gold) - set(c)
        res = {k: puntuar(gold[k], c[k]) for k in gold if k in c}
        cuenta = collections.Counter(res.values())
        print(f"\n== {nombre}  ({len(res)}/{len(gold)} ítems, faltan {len(faltan)})")
        for tipo, n in sorted(cuenta.items()):
            print(f"  {tipo:24} {n}")
        for k, tipo in sorted(res.items()):
            if tipo != "ok":
                print(f"    {tipo:24} {k:9} gold={gold[k]['gold']:8} ruta={c[k]['ruta']:8} {c[k].get('por_que', '')[:110]}")
    if len(salidas) == 2:
        a, b = salidas.values()
        comunes = set(a) & set(b)
        iguales = sum(a[k]["ruta"] == b[k]["ruta"] for k in comunes)
        print(f"\nAcuerdo entre clasificadores (ruta): {iguales}/{len(comunes)}")


main()
