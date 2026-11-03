"""Audita sólo alcance de archivos/ancestría local. No integra ni usa red.

Un resultado correcto NO aprueba M2/M2.5, permisos, producto o despliegue.
"""
import argparse
import json
from pathlib import Path
import subprocess


def git(*argumentos):
    return subprocess.check_output(["git", *argumentos], text=True).strip()


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--base", required=True, help="Commit local exacto verificado por coordinación")
    opciones = parser.parse_args()
    base = git("rev-parse", "--verify", opciones.base + "^{commit}")
    head = git("rev-parse", "HEAD")
    ancestro = subprocess.run(["git", "merge-base", "--is-ancestor", base, head], check=False).returncode == 0
    cambiados = set(filter(None, git("diff", "--name-only", base).splitlines()))
    nuevos = set(filter(None, git("ls-files", "--others", "--exclude-standard").splitlines()))
    rutas = sorted(cambiados | nuevos)
    fuera = [ruta for ruta in rutas if not ruta.startswith(("docs/esco2/", "analysis/esco2-design/"))]
    enlaces = [ruta for ruta in rutas if Path(ruta).is_symlink()]
    limpio = not git("status", "--porcelain")
    resultado = {"base": base, "head": head, "base_is_ancestor": ancestro,
                 "worktree_clean": limpio, "changed_paths": rutas,
                 "outside_preparation_scope": fuera, "symlinks_in_changes": enlaces,
                 "scope_check_passed": ancestro and not fuera and not enlaces,
                 "meaning": "file_scope_only_not_product_or_release_acceptance"}
    print(json.dumps(resultado, indent=2))
    return 0 if resultado["scope_check_passed"] else 1


if __name__ == "__main__":
    raise SystemExit(main())
