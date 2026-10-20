#!/usr/bin/env python3
"""Unchanged invoice candidate admission on the exact contained combined graph."""
import argparse
import importlib.util
import json
from pathlib import Path

spec = importlib.util.spec_from_file_location('metadata_admission', Path(__file__).with_name('hato-income-metadata-replay.py'))
p = importlib.util.module_from_spec(spec)
spec.loader.exec_module(p)
c, r = p.c, p.r
CANDIDATE = r.ROOT / 'src/sql/security-candidates/invoice-server-validation.sql'
TARGETS = "('storage.objects'::regclass,'storage.buckets'::regclass,'public.compras'::regclass,'public.fin_gastos'::regclass,'public.fin_ingresos'::regclass)"

def exercise(sql, ctx):
    check = ctx['check']
    # Structure-only exports contain no bucket rows; seed a private synthetic fixture.
    sql("INSERT INTO storage.buckets(id,name,public) VALUES('facturas','facturas',false) ON CONFLICT(id) DO NOTHING;")
    check(sql("SELECT NOT public FROM storage.buckets WHERE id='facturas';") == 't', 'synthetic private invoice bucket satisfies prerequisite without claiming live data')
    rows = p.query(sql)
    before = sql(rows)
    baseline = sql('SELECT hato_income_metadata.baseline();')
    # Names/bindings only: no copied private function bodies or data.
    inventory = json.loads(sql("SELECT coalesce(jsonb_agg(jsonb_build_object('relation',tgrelid::regclass::text,'trigger',tgname,'function',tgfoid::regprocedure::text,'enabled',tgenabled) ORDER BY tgrelid::regclass::text,tgname),'[]') FROM pg_trigger WHERE NOT tgisinternal AND tgrelid IN " + TARGETS + ';'))
    check(bool(inventory), 'exact combined graph contains existing Storage/reference triggers')
    check(sql("SELECT to_regnamespace('invoice_upload') IS NULL;") == 't', 'invoice private namespace is not implicitly installed')
    failed = sql(CANDIDATE.read_text(), False)
    if failed.returncode == 0 or 'Invoice installation requires reviewed current Storage/reference triggers' not in failed.stderr:
        diagnostic = Path('/tmp/escocia-invoice-combined-refusal-private.log')
        diagnostic.touch(mode=0o600, exist_ok=True)
        diagnostic.write_text(failed.stderr)
    check(failed.returncode != 0 and 'Invoice installation requires reviewed current Storage/reference triggers' in failed.stderr, 'unchanged invoice candidate refuses exact existing trigger baseline')
    check(sql(rows) == before, 'refused invoice installation preserves every existing domain/private/Storage row')
    check(sql('SELECT hato_income_metadata.baseline();') == baseline, 'refused invoice installation preserves exact combined catalog baseline')
    check(sql("SELECT to_regnamespace('invoice_upload') IS NULL;") == 't', 'refused installation leaves no invoice controls or partial DDL')
    sql('SELECT hato_income_metadata.assert_baseline();SELECT hato_income_metadata.assert_controls();SELECT hato_quincena.assert_controls();')
    check(True, 'original metadata and Production authority/body pins remain valid')
    exercise.inventory = inventory

def main():
    parser = argparse.ArgumentParser()
    for name in ('evidence-dir', 'runtime', 'client', 'output', 'private-diagnostics'):
        parser.add_argument('--' + name, type=Path, required=True)
    args = parser.parse_args()
    old = json.loads((r.ROOT / 'docs/security-integrity/hato-income-metadata-replay.json').read_text())
    files = list(dict.fromkeys([Path(__file__), CANDIDATE, *[r.ROOT / k for k in old['source_hashes']]]))
    frozen = {f: f.read_bytes() for f in files}
    base = p.p
    while not hasattr(base, 's'):
        base = base.p
    catalog, rls, storage, types, hashes, admission = base.s.load(args.evidence_dir.resolve())
    base.install.inputs = (storage, types, rls, catalog)
    if args.output.resolve().is_relative_to(args.evidence_dir.resolve()) or args.output.name.endswith('-private.json'):
        raise ValueError('Private output boundary')
    with r.database(args.runtime.resolve(), args.client.resolve(), args.private_diagnostics.resolve()) as sql:
        result = c.run(catalog, rls, hashes, sql, followup=exercise, installation=p.install)
    if any(f.read_bytes() != value for f, value in frozen.items()):
        raise ValueError('Changing invoice admission sources cannot be certified')
    result.update(coordinated_candidate_count=55, invoice_candidate_installed=False,
                  existing_trigger_bindings=exercise.inventory,
                  source_hashes={str(f.relative_to(r.ROOT)): r.p.digest(v) for f, v in frozen.items()},
                  temporary_database_stopped_and_removed=True,
                  limits=['Six approved local structure snapshots and contained synthetic PG only; never production.',
                          'Admission refusal and rollback only. No invoice candidate/caller/grant changes or new attachment support.',
                          'Exact compatible invoice trigger/policy/authority/body-pin integration and actual byte/reference SDK proofs remain required before financial writer retirement.'])
    args.output.write_text(json.dumps(result, indent=2) + '\n')

if __name__ == '__main__':
    main()
