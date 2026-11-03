"""Rúbrica local de respuestas estructuradas sintéticas, separada del scorer.

No interpreta preguntas, no elige herramientas ni valida permisos de un servicio.
Devuelve solo códigos; nunca reproduce payloads rechazados en el informe.
"""
from decimal import Decimal, InvalidOperation


def _keys(value, allowed, required):
    return isinstance(value, dict) and set(value) <= allowed and required <= set(value)


def _safe_shape(reply):
    if not _keys(reply, {'status', 'scope', 'parts', 'blocked_by'}, {'status', 'scope', 'parts'}):
        return False
    if not _keys(reply['scope'], {'conversation_key', 'lote', 'period'}, {'conversation_key', 'lote', 'period'}):
        return False
    scope = reply['scope']
    if not isinstance(scope['conversation_key'], str):
        return False
    if not _keys(scope['lote'], {'kind', 'id'}, {'kind'}):
        return False
    if not isinstance(scope['lote']['kind'], str) or scope['lote']['kind'] not in {'one', 'all', 'unassigned'}:
        return False
    if scope['lote']['kind'] == 'one':
        if set(scope['lote']) != {'kind', 'id'} or not isinstance(scope['lote']['id'], str):
            return False
    elif set(scope['lote']) != {'kind'}:
        return False
    if not _keys(scope['period'], {'from', 'to', 'timezone'}, {'from', 'to', 'timezone'}):
        return False
    if not all(isinstance(v, str) for v in scope['period'].values()):
        return False
    if not isinstance(reply['parts'], list):
        return False
    for part in reply['parts']:
        if not _keys(part, {'id', 'value', 'unit', 'coverage'}, {'id', 'value', 'unit', 'coverage'}):
            return False
        if not all(isinstance(part[k], str) for k in ('id', 'unit', 'coverage')):
            return False
        # Decimal strings: do not accept booleans, arbitrary objects or NaN.
        if not isinstance(part['value'], str):
            return False
        try:
            if not Decimal(part['value']).is_finite():
                return False
        except InvalidOperation:
            return False
    if 'blocked_by' in reply and not isinstance(reply['blocked_by'], str):
        return False
    return True


def evaluate_turn(expected, reply):
    def verdict(outcome, *reasons, critical=False):
        return {'outcome': outcome, 'critical': critical, 'reasons': list(reasons)}
    if not _safe_shape(reply):
        return verdict('failed', 'prohibited_or_invalid_field', critical=True)
    # A data leak cannot be downgraded by another scope/correctness failure.
    if expected['classification'] == 'guard' and reply['parts']:
        return verdict('failed', 'guard_not_enforced', critical=True)
    if reply['scope']['conversation_key'] != expected['scope']['conversation_key']:
        return verdict('failed', 'conversation_scope_mismatch', critical=True)
    if reply['scope'] != expected['scope']:
        return verdict('partial', 'entity_or_period_mismatch')
    if expected['classification'] == 'guard':
        if reply['status'] == 'denied' and not reply['parts'] and reply.get('blocked_by') == expected['guard_code']:
            return verdict('guard_pass')
        return verdict('failed', 'guard_not_enforced', critical=bool(reply['parts']))
    if reply['status'] == 'blocked':
        if reply['parts'] or not reply.get('blocked_by'):
            return verdict('failed', 'invalid_blocked_response')
        return verdict('blocked', 'dependency_blocked')
    if reply['status'] != 'complete' or reply.get('blocked_by'):
        return verdict('partial', 'not_complete')
    parts = {p['id']: p for p in reply['parts']}
    if len(parts) != len(reply['parts']):
        return verdict('failed', 'duplicate_part')
    wanted = {p['id']: p for p in expected['parts']}
    if set(parts) != set(wanted):
        return verdict('partial', 'missing_or_extra_part')
    for key, p in parts.items():
        e = wanted[key]
        if p['coverage'] != 'complete' or p['coverage'] != e['coverage']:
            return verdict('partial', 'incomplete_coverage')
        if p['unit'] != e['unit'] or Decimal(p['value']) != Decimal(e['value']):
            return verdict('partial', 'wrong_value_or_unit')
    return verdict('complete_correct')
