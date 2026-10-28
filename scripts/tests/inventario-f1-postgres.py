"""Pruebas F1 contra PostgreSQL 17 local, sin red, puertos ni volúmenes.

Requiere Docker y una imagen postgres:17-alpine YA disponible. No instala ni
descarga nada. Nunca acepta una URL, conexión ni nombre de base externo.
"""
import concurrent.futures
import json
import pathlib
import re
import subprocess
import time
import uuid

ROOT = pathlib.Path(__file__).resolve().parents[2]
CONTAINER = 'escocia-f1-' + uuid.uuid4().hex[:10]
G = '00000000-0000-4000-8000-000000000001'
A = '00000000-0000-4000-8000-000000000002'
P = '10000000-0000-4000-8000-000000000001'
Q = '10000000-0000-4000-8000-000000000002'
passed = 0


def sql(query, success=True):
    result = subprocess.run(
        ['docker', 'exec', '-i', CONTAINER, 'psql', '-U', 'postgres', '-X', '-qAt', '-v', 'ON_ERROR_STOP=1'],
        input=query, text=True, capture_output=True, timeout=30,
    )
    if success and result.returncode:
        raise AssertionError(result.stderr)
    if not success:
        assert result.returncode != 0, 'Se esperaba rechazo/rollback'
    value = result.stdout.strip()
    if re.fullmatch(r'-?\d+\.\d+', value):
        value = value.rstrip('0').rstrip('.')
    return value


def call(operation, data, request=None, actor=G, success=True, prefix=''):
    request = request or str(uuid.uuid4())
    payload = json.dumps(data).replace("'", "''")
    return sql(f"""SET ROLE authenticated;
      SET request.jwt.claim.sub = '{actor}';
      SET request.jwt.claim.email = 'local-fixture@example.invalid';
      SET request.jwt.claims = '{{"sub":"{actor}","role":"authenticated","email":"local-fixture@example.invalid"}}';
      {prefix}
      SELECT public.fn_inventario_guardar('{request}', '{operation}', '{payload}'::jsonb);""", success)


def movement(amount=20, product=P, kind='Entrada', expected=100):
    return dict(fecha='2026-10-27', producto_id=product, tipo_movimiento=kind,
                cantidad=amount, saldo_esperado=expected, observaciones='Prueba local')


def purchase(products=None):
    return dict(fecha='2026-10-27', proveedor='Proveedor local', proveedor_id=G,
                numero_factura='LOCAL', url_factura='', productos=products or [
                    dict(producto_id=P, cantidad=20, unidad='Kilos', costo_unitario=5,
                         costo_total=100, numero_lote='', fecha_vencimiento='', observaciones='Local')])


def reset():
    sql(f"""TRUNCATE public.inventario_operaciones, public.fin_gastos, public.movimientos_inventario, public.compras, public.productos;
    INSERT INTO public.productos(id,nombre,categoria,grupo,unidad_medida,cantidad_actual,precio_unitario,activo)
    VALUES ('{P}','Uno','Fertilizante','Agroinsumos','Kilos',100,2,true),('{Q}','Dos','Fertilizante','Agroinsumos','Kilos',100,2,true);""")


def snapshot():
    return sql("SELECT json_build_array((SELECT json_agg(x ORDER BY id) FROM productos x),"
               "(SELECT json_agg(x ORDER BY id) FROM compras x),"
               "(SELECT json_agg(x ORDER BY id) FROM movimientos_inventario x),"
               "(SELECT json_agg(x ORDER BY solicitud_id) FROM inventario_operaciones x),"
               "(SELECT json_agg(x ORDER BY id) FROM fin_gastos x));")


def check(name):
    global passed
    passed += 1
    print('PASS', name, flush=True)


def run_cases():
    reset()
    request = str(uuid.uuid4())
    first = call('movimiento', movement(), request)
    assert first == call('movimiento', movement(), request)
    assert sql(f"SELECT cantidad_actual FROM productos WHERE id='{P}'") == '120'
    assert sql('SELECT count(*) FROM movimientos_inventario') == '1'
    assert sql('SELECT responsable FROM movimientos_inventario') == 'local-fixture@example.invalid'
    check('respuesta perdida/reintento: un solo movimiento, mismo resultado')
    state = snapshot()
    call('movimiento', movement(30), request, success=False)
    call('movimiento', movement(), request, actor=A, success=False)
    assert snapshot() == state
    check('clave reutilizada con otros datos u otro usuario: sin efectos')

    reset()
    with concurrent.futures.ThreadPoolExecutor(2) as pool:
        results = list(pool.map(lambda x: call('movimiento', movement(x)), [20, 30]))
    assert sql(f"SELECT cantidad_actual FROM productos WHERE id='{P}'") == '150'
    assert sql('SELECT count(*) FROM movimientos_inventario') == '2'
    check('dos sesiones concurrentes conservan ambos incrementos')

    reset()
    with concurrent.futures.ThreadPoolExecutor(2) as pool:
        jobs = [pool.submit(call, 'compra', purchase()), pool.submit(call, 'movimiento', movement(30))]
        [job.result() for job in jobs]
    assert sql(f"SELECT cantidad_actual FROM productos WHERE id='{P}'") == '150'
    assert sql('SELECT count(*) FROM movimientos_inventario') == '2'
    check('compra y movimiento concurrentes conservan ambos hechos')

    reset()
    request = str(uuid.uuid4())
    with concurrent.futures.ThreadPoolExecutor(2) as pool:
        results = list(pool.map(lambda _: call('movimiento', movement(), request), range(2)))
    assert results[0] == results[1]
    assert sql('SELECT count(*) FROM movimientos_inventario') == '1'
    check('dos sesiones con la misma clave no duplican')

    for actor in ['00000000-0000-4000-8000-000000000003',
                  '00000000-0000-4000-8000-000000000004',
                  '00000000-0000-4000-8000-000000000005']:
        state = snapshot()
        call('movimiento', movement(), actor=actor, success=False)
        assert snapshot() == state
    sql("SET ROLE anon; SELECT public.fn_inventario_guardar(gen_random_uuid(),'movimiento','{}');", success=False)
    check('cuentas sin escritura, cuenta inactiva y anon rechazados')

    reset()
    call('movimiento', movement(10, kind='Salida Otros'), actor=A)
    assert sql(f"SELECT cantidad_actual FROM productos WHERE id='{P}'") == '90'
    state = snapshot()
    call('movimiento', movement(91, kind='Salida Otros'), success=False)
    call('movimiento', movement(50, kind='Ajuste', expected=100), success=False)
    call('movimiento', movement('NaN'), success=False)
    assert snapshot() == state
    call('movimiento', movement(0, kind='Ajuste', expected=90))
    assert sql(f"SELECT cantidad_actual FROM productos WHERE id='{P}'") == '0'
    check('salida, ajuste a cero, saldo obsoleto, saldo insuficiente y NaN')
    reset()
    call('movimiento', movement(0.01))
    call('movimiento', movement(0.005, kind='Salida Otros'))
    assert sql(f"SELECT cantidad_actual FROM productos WHERE id='{P}'") == '100'
    assert sql('SELECT sum(cantidad) FROM movimientos_inventario') == '0'
    check('precisión NUMERIC(12,2): saldo y movimiento redondean juntos')

    reset()
    for table, event in [('movimientos_inventario','INSERT'), ('productos','UPDATE'),
                         ('inventario_operaciones','UPDATE')]:
        sql(f"""CREATE FUNCTION public.f1_fallar() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN
          RAISE EXCEPTION 'fallo inyectado'; END $$;
          CREATE TRIGGER f1_fallar BEFORE {event} ON public.{table} FOR EACH ROW EXECUTE FUNCTION public.f1_fallar();""")
        state = snapshot()
        call('movimiento', movement(), success=False)
        assert snapshot() == state
        sql(f'DROP TRIGGER f1_fallar ON public.{table}; DROP FUNCTION public.f1_fallar();')
    check('fallos en ledger, stock y recibo revierten todo')

    for table in ['productos', 'inventario_operaciones']:
        sql(f"""CREATE FUNCTION public.f1_omitir() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN RETURN NULL; END $$;
          CREATE TRIGGER f1_omitir BEFORE UPDATE ON public.{table} FOR EACH ROW EXECUTE FUNCTION public.f1_omitir();""")
        state = snapshot()
        call('movimiento', movement(), success=False)
        assert snapshot() == state
        sql(f'DROP TRIGGER f1_omitir ON public.{table}; DROP FUNCTION public.f1_omitir();')
    check('UPDATE que no afecta filas tampoco confirma un guardado parcial')

    reset()
    batch = purchase()
    batch['productos'].append(dict(batch['productos'][0], producto_id=Q, cantidad=-1))
    state = snapshot()
    call('compra', batch, success=False)
    assert snapshot() == state
    batch['productos'][1]['cantidad'] = 20
    request = str(uuid.uuid4())
    first = call('compra', batch, request, actor=A)
    assert first == call('compra', batch, request, actor=A)
    assert sql('SELECT count(*) FROM compras') == '2'
    assert sql('SELECT count(*) FROM movimientos_inventario') == '2'
    assert sql('SELECT sum(cantidad_actual) FROM productos') == '240'
    check('compra completa atómica; falla en segunda línea; reintento del lote')

    reset()
    batch = purchase()
    batch['productos'].append(dict(batch['productos'][0], cantidad=30))
    call('compra', batch)
    assert sql(f"SELECT cantidad_actual FROM productos WHERE id='{P}'") == '150'
    check('producto repetido dentro de la compra usa el saldo actualizado')

    reset()
    batch = purchase()
    batch['productos'].append(dict(batch['productos'][0], producto_id=Q))
    inverse = dict(batch, productos=list(reversed(batch['productos'])))
    with concurrent.futures.ThreadPoolExecutor(2) as pool:
        list(pool.map(lambda data: call('compra', data), [batch, inverse]))
    assert sql('SELECT sum(cantidad_actual) FROM productos') == '280'
    assert sql('SELECT count(*) FROM compras') == '4'
    check('compras concurrentes con productos en orden inverso')

    reset()
    call('compra', purchase())
    later = purchase()
    later['fecha'] = '2026-10-28'
    later['productos'][0]['costo_unitario'] = 7
    call('compra', later)
    last = sql("SELECT id FROM compras ORDER BY fecha_compra DESC LIMIT 1")
    call('eliminar_compra', dict(compra_id=last, fecha='2026-10-28'))
    assert sql(f"SELECT precio_unitario FROM productos WHERE id='{P}'") == '5'
    assert sql(f"SELECT cantidad_actual FROM productos WHERE id='{P}'") == '120'
    check('borrar compra restaura el precio de la compra sobreviviente')

    reset()
    call('compra', purchase())
    compra = sql('SELECT id FROM compras')
    sql(f"INSERT INTO fin_gastos(compra_id) VALUES ('{compra}')")
    request = str(uuid.uuid4())
    data = dict(compra_id=compra, fecha='2026-10-27')
    sql("CREATE FUNCTION public.f1_fallar() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN RAISE EXCEPTION 'fallo borrado'; END $$;"
        "CREATE TRIGGER f1_fallar BEFORE DELETE ON public.compras FOR EACH ROW EXECUTE FUNCTION public.f1_fallar();")
    state = snapshot()
    call('eliminar_compra', data, request, actor=A, success=False)
    assert snapshot() == state
    sql('DROP TRIGGER f1_fallar ON public.compras; DROP FUNCTION public.f1_fallar();')
    first = call('eliminar_compra', data, request, actor=A)
    assert first == call('eliminar_compra', data, request, actor=A)
    assert sql(f"SELECT cantidad_actual FROM productos WHERE id='{P}'") == '100'
    assert sql(f"SELECT precio_unitario IS NULL FROM productos WHERE id='{P}'") == 't'
    assert sql('SELECT count(*) FROM compras') == '0'
    assert sql('SELECT count(*) FROM fin_gastos') == '0'
    assert sql('SELECT count(*) FROM movimientos_inventario') == '2'
    check('borrado y cleanup atómicos, compensación única, precio sin dato')
    assert sql(f"SELECT count(*) FROM inventario_operaciones WHERE usuario_id='{A}'") == '1'
    # El esquema real ya enlaza updated_by a Auth. Limpiar esa referencia
    # sintética existente aísla el efecto de la nueva FK del recibo.
    sql(f"UPDATE productos SET updated_by=NULL WHERE updated_by='{A}';")
    sql(f"DELETE FROM usuarios WHERE id='{A}'; DELETE FROM auth.users WHERE id='{A}';")
    assert sql(f"SELECT count(*) FROM inventario_operaciones WHERE usuario_id='{A}'") == '0'
    assert sql('SELECT count(*) FROM movimientos_inventario') == '2'
    assert sql(f"SELECT cantidad_actual FROM productos WHERE id='{P}'") == '100'
    check('el nuevo recibo no bloquea la baja de cuenta ni borra movimientos')
    print(f'{passed} grupos de pruebas PostgreSQL OK')


def run_local():
    try:
        subprocess.run(['docker', 'run', '--pull=never', '--rm', '-d', '--name', CONTAINER,
                        '--network=none', '--tmpfs', '/var/lib/postgresql/data',
                        '-e', 'POSTGRES_HOST_AUTH_METHOD=trust', 'postgres:17-alpine'],
                       check=True, capture_output=True, text=True)
        for _ in range(100):
            ready = subprocess.run(['docker', 'exec', CONTAINER, 'pg_isready', '-U', 'postgres'], capture_output=True)
            logs = subprocess.run(['docker', 'logs', CONTAINER], capture_output=True, text=True)
            output = logs.stdout + logs.stderr
            if ready.returncode == 0 and 'PostgreSQL init process complete' in output and output.count('database system is ready to accept connections') >= 2:
                break
            time.sleep(.1)
        else:
            raise AssertionError('PostgreSQL local no inició')
        sql((ROOT / 'scripts/tests/inventario-f1-fixture.sql').read_text())
        sql((ROOT / 'src/sql/migrations/185_inventario_guardado_atomico.sql').read_text())
        check('migración completa compila con RLS y roles')

        run_cases()
    finally:
        subprocess.run(['docker', 'rm', '-f', CONTAINER], capture_output=True)


if __name__ == '__main__':
    run_local()
