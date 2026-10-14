#!/usr/bin/env python3
"""Captured predicates, synthetic rows, ordinary-role PG17.6 tests. No network or production calls."""
import json
import os
from pathlib import Path
import subprocess
import time
import uuid

ROOT = Path(__file__).resolve().parents[2]
IMAGE = 'postgres@sha256:00bc86618629af00d2937fdc5a5d63db3ff8450acf52f0636ec813c7f4902929'
ENV = os.environ.copy()
for key in ('DOCKER_HOST', 'DOCKER_CONTEXT', 'DOCKER_TLS', 'DOCKER_TLS_VERIFY', 'DOCKER_CERT_PATH'):
    ENV.pop(key, None)
DOCKER = ['docker', '--host=unix:///var/run/docker.sock']
CONTAINER = None
CHECKS = 0
TABLES = ['chat_conversations', 'chat_messages', 'esco_memorias', 'productos', 'compras', 'fin_gastos', 'monitoreos']
BUCKETS = ['facturas', 'reportes-semanales', 'chequeos-fotos', 'hato-liquidaciones-fotos', 'hato-pesajes-fotos', 'informes-visita']
ROLES = ['Gerencia', 'Administrador', 'Monitor', 'Verificador']
# Sanitized 2026-10-10 metadata snapshot: exact captured policy expressions, roles and helper bodies.
# No live account ids, records, tokens, bucket URLs or data are included.
CAPTURED_POLICIES = [{'cmd': 'DELETE',
  'permissive': 'PERMISSIVE',
  'policyname': 'chat_conversations_delete',
  'qual': '((( SELECT auth.uid() AS uid) = user_id) AND ( SELECT es_usuario_gerencia() AS '
          'es_usuario_gerencia))',
  'roles': '{public}',
  'schemaname': 'public',
  'tablename': 'chat_conversations',
  'with_check': None},
 {'cmd': 'INSERT',
  'permissive': 'PERMISSIVE',
  'policyname': 'chat_conversations_insert',
  'qual': None,
  'roles': '{public}',
  'schemaname': 'public',
  'tablename': 'chat_conversations',
  'with_check': '((( SELECT auth.uid() AS uid) = user_id) AND ( SELECT es_usuario_gerencia() AS '
                'es_usuario_gerencia))'},
 {'cmd': 'SELECT',
  'permissive': 'PERMISSIVE',
  'policyname': 'chat_conversations_select',
  'qual': '((( SELECT auth.uid() AS uid) = user_id) AND ( SELECT es_usuario_gerencia() AS '
          'es_usuario_gerencia))',
  'roles': '{public}',
  'schemaname': 'public',
  'tablename': 'chat_conversations',
  'with_check': None},
 {'cmd': 'INSERT',
  'permissive': 'PERMISSIVE',
  'policyname': 'chat_messages_insert',
  'qual': None,
  'roles': '{public}',
  'schemaname': 'public',
  'tablename': 'chat_messages',
  'with_check': '(EXISTS ( SELECT 1\n'
                '   FROM chat_conversations\n'
                '  WHERE ((chat_conversations.id = chat_messages.conversation_id) AND '
                '(chat_conversations.user_id = ( SELECT auth.uid() AS uid)))))'},
 {'cmd': 'SELECT',
  'permissive': 'PERMISSIVE',
  'policyname': 'chat_messages_select',
  'qual': '(EXISTS ( SELECT 1\n'
          '   FROM chat_conversations\n'
          '  WHERE ((chat_conversations.id = chat_messages.conversation_id) AND (chat_conversations.user_id '
          '= ( SELECT auth.uid() AS uid)))))',
  'roles': '{public}',
  'schemaname': 'public',
  'tablename': 'chat_messages',
  'with_check': None},
 {'cmd': 'ALL',
  'permissive': 'PERMISSIVE',
  'policyname': 'Administrador puede todo en compras',
  'qual': "(( SELECT get_user_role() AS get_user_role) = 'Administrador'::rol_usuario)",
  'roles': '{public}',
  'schemaname': 'public',
  'tablename': 'compras',
  'with_check': None},
 {'cmd': 'ALL',
  'permissive': 'PERMISSIVE',
  'policyname': 'Gerencia acceso total',
  'qual': "(( SELECT get_user_role() AS get_user_role) = 'Gerencia'::rol_usuario)",
  'roles': '{public}',
  'schemaname': 'public',
  'tablename': 'compras',
  'with_check': None},
 {'cmd': 'ALL',
  'permissive': 'PERMISSIVE',
  'policyname': 'esco_memorias_owner_all',
  'qual': '(user_id = ( SELECT auth.uid() AS uid))',
  'roles': '{public}',
  'schemaname': 'public',
  'tablename': 'esco_memorias',
  'with_check': '(user_id = ( SELECT auth.uid() AS uid))'},
 {'cmd': 'DELETE',
  'permissive': 'PERMISSIVE',
  'policyname': 'fin_gastos_delete',
  'qual': '( SELECT es_usuario_gerencia() AS es_usuario_gerencia)',
  'roles': '{public}',
  'schemaname': 'public',
  'tablename': 'fin_gastos',
  'with_check': None},
 {'cmd': 'INSERT',
  'permissive': 'PERMISSIVE',
  'policyname': 'fin_gastos_insert',
  'qual': None,
  'roles': '{public}',
  'schemaname': 'public',
  'tablename': 'fin_gastos',
  'with_check': '( SELECT es_usuario_gerencia() AS es_usuario_gerencia)'},
 {'cmd': 'SELECT',
  'permissive': 'PERMISSIVE',
  'policyname': 'fin_gastos_select',
  'qual': '( SELECT es_usuario_gerencia() AS es_usuario_gerencia)',
  'roles': '{public}',
  'schemaname': 'public',
  'tablename': 'fin_gastos',
  'with_check': None},
 {'cmd': 'UPDATE',
  'permissive': 'PERMISSIVE',
  'policyname': 'fin_gastos_update',
  'qual': '( SELECT es_usuario_gerencia() AS es_usuario_gerencia)',
  'roles': '{public}',
  'schemaname': 'public',
  'tablename': 'fin_gastos',
  'with_check': None},
 {'cmd': 'ALL',
  'permissive': 'PERMISSIVE',
  'policyname': 'Administrador puede todo en monitoreos',
  'qual': "(( SELECT get_user_role() AS get_user_role) = 'Administrador'::rol_usuario)",
  'roles': '{public}',
  'schemaname': 'public',
  'tablename': 'monitoreos',
  'with_check': None},
 {'cmd': 'ALL',
  'permissive': 'PERMISSIVE',
  'policyname': 'Gerencia acceso total',
  'qual': "(( SELECT get_user_role() AS get_user_role) = 'Gerencia'::rol_usuario)",
  'roles': '{public}',
  'schemaname': 'public',
  'tablename': 'monitoreos',
  'with_check': None},
 {'cmd': 'UPDATE',
  'permissive': 'PERMISSIVE',
  'policyname': 'Usuarios autenticados pueden actualizar monitoreos',
  'qual': "(( SELECT get_user_role() AS get_user_role) = ANY (ARRAY['Gerencia'::rol_usuario, "
          "'Administrador'::rol_usuario]))",
  'roles': '{authenticated}',
  'schemaname': 'public',
  'tablename': 'monitoreos',
  'with_check': "(( SELECT get_user_role() AS get_user_role) = ANY (ARRAY['Gerencia'::rol_usuario, "
                "'Administrador'::rol_usuario]))"},
 {'cmd': 'INSERT',
  'permissive': 'PERMISSIVE',
  'policyname': 'Usuarios autenticados pueden insertar monitoreos',
  'qual': None,
  'roles': '{authenticated}',
  'schemaname': 'public',
  'tablename': 'monitoreos',
  'with_check': "(( SELECT get_user_role() AS get_user_role) = ANY (ARRAY['Gerencia'::rol_usuario, "
                "'Administrador'::rol_usuario]))"},
 {'cmd': 'SELECT',
  'permissive': 'PERMISSIVE',
  'policyname': 'Usuarios autenticados pueden leer monitoreos',
  'qual': 'true',
  'roles': '{authenticated}',
  'schemaname': 'public',
  'tablename': 'monitoreos',
  'with_check': None},
 {'cmd': 'UPDATE',
  'permissive': 'PERMISSIVE',
  'policyname': 'Administrador actualiza productos',
  'qual': "(( SELECT get_user_role() AS get_user_role) = 'Administrador'::rol_usuario)",
  'roles': '{public}',
  'schemaname': 'public',
  'tablename': 'productos',
  'with_check': None},
 {'cmd': 'INSERT',
  'permissive': 'PERMISSIVE',
  'policyname': 'Administrador escritura productos',
  'qual': None,
  'roles': '{public}',
  'schemaname': 'public',
  'tablename': 'productos',
  'with_check': "(( SELECT get_user_role() AS get_user_role) = 'Administrador'::rol_usuario)"},
 {'cmd': 'SELECT',
  'permissive': 'PERMISSIVE',
  'policyname': 'Administrador lectura productos',
  'qual': "(( SELECT get_user_role() AS get_user_role) = 'Administrador'::rol_usuario)",
  'roles': '{public}',
  'schemaname': 'public',
  'tablename': 'productos',
  'with_check': None},
 {'cmd': 'ALL',
  'permissive': 'PERMISSIVE',
  'policyname': 'Gerencia acceso total',
  'qual': "(( SELECT get_user_role() AS get_user_role) = 'Gerencia'::rol_usuario)",
  'roles': '{public}',
  'schemaname': 'public',
  'tablename': 'productos',
  'with_check': None},
 {'cmd': 'SELECT',
  'permissive': 'PERMISSIVE',
  'policyname': 'Permitir lectura de precios a usuarios autenticados',
  'qual': 'true',
  'roles': '{authenticated}',
  'schemaname': 'public',
  'tablename': 'productos',
  'with_check': None},
 {'cmd': 'SELECT',
  'permissive': 'PERMISSIVE',
  'policyname': 'Usuarios autenticados leen productos',
  'qual': 'true',
  'roles': '{authenticated}',
  'schemaname': 'public',
  'tablename': 'productos',
  'with_check': None},
 {'cmd': 'SELECT',
  'permissive': 'PERMISSIVE',
  'policyname': 'Verificador lee productos',
  'qual': "(( SELECT get_user_role() AS get_user_role) = 'Verificador'::rol_usuario)",
  'roles': '{public}',
  'schemaname': 'public',
  'tablename': 'productos',
  'with_check': None},
 {'cmd': 'ALL',
  'permissive': 'PERMISSIVE',
  'policyname': 'Gerencia acceso total',
  'qual': "(( SELECT get_user_role() AS get_user_role) = 'Gerencia'::rol_usuario)",
  'roles': '{public}',
  'schemaname': 'public',
  'tablename': 'usuarios',
  'with_check': None},
 {'cmd': 'SELECT',
  'permissive': 'PERMISSIVE',
  'policyname': 'Usuario ve su perfil',
  'qual': '((id = ( SELECT auth.uid() AS uid)) OR (( SELECT get_user_role() AS get_user_role) = '
          "'Gerencia'::rol_usuario))",
  'roles': '{public}',
  'schemaname': 'public',
  'tablename': 'usuarios',
  'with_check': None},
 {'cmd': 'UPDATE',
  'permissive': 'PERMISSIVE',
  'policyname': 'Administrador puede actualizar facturas',
  'qual': "((bucket_id = 'facturas'::text) AND (EXISTS ( SELECT 1\n"
          '   FROM usuarios\n'
          "  WHERE ((usuarios.id = auth.uid()) AND (usuarios.rol = 'Administrador'::rol_usuario)))))",
  'roles': '{authenticated}',
  'schemaname': 'storage',
  'tablename': 'objects',
  'with_check': None},
 {'cmd': 'DELETE',
  'permissive': 'PERMISSIVE',
  'policyname': 'Administrador puede eliminar facturas',
  'qual': "((bucket_id = 'facturas'::text) AND (EXISTS ( SELECT 1\n"
          '   FROM usuarios\n'
          "  WHERE ((usuarios.id = auth.uid()) AND (usuarios.rol = 'Administrador'::rol_usuario)))))",
  'roles': '{authenticated}',
  'schemaname': 'storage',
  'tablename': 'objects',
  'with_check': None},
 {'cmd': 'SELECT',
  'permissive': 'PERMISSIVE',
  'policyname': 'Administrador puede leer facturas',
  'qual': "((bucket_id = 'facturas'::text) AND (EXISTS ( SELECT 1\n"
          '   FROM usuarios\n'
          "  WHERE ((usuarios.id = auth.uid()) AND (usuarios.rol = 'Administrador'::rol_usuario)))))",
  'roles': '{authenticated}',
  'schemaname': 'storage',
  'tablename': 'objects',
  'with_check': None},
 {'cmd': 'INSERT',
  'permissive': 'PERMISSIVE',
  'policyname': 'Administrador puede subir facturas',
  'qual': None,
  'roles': '{authenticated}',
  'schemaname': 'storage',
  'tablename': 'objects',
  'with_check': "((bucket_id = 'facturas'::text) AND (EXISTS ( SELECT 1\n"
                '   FROM usuarios\n'
                "  WHERE ((usuarios.id = auth.uid()) AND (usuarios.rol = 'Administrador'::rol_usuario)))))"},
 {'cmd': 'DELETE',
  'permissive': 'PERMISSIVE',
  'policyname': 'Authenticated users can delete reports',
  'qual': "((bucket_id = 'reportes-semanales'::text) AND (EXISTS ( SELECT 1\n"
          '   FROM usuarios u\n'
          "  WHERE ((u.id = ( SELECT auth.uid() AS uid)) AND (u.rol = 'Gerencia'::rol_usuario)))))",
  'roles': '{authenticated}',
  'schemaname': 'storage',
  'tablename': 'objects',
  'with_check': None},
 {'cmd': 'SELECT',
  'permissive': 'PERMISSIVE',
  'policyname': 'Authenticated users can read reports',
  'qual': "(bucket_id = 'reportes-semanales'::text)",
  'roles': '{authenticated}',
  'schemaname': 'storage',
  'tablename': 'objects',
  'with_check': None},
 {'cmd': 'UPDATE',
  'permissive': 'PERMISSIVE',
  'policyname': 'Authenticated users can update reports',
  'qual': "((bucket_id = 'reportes-semanales'::text) AND (EXISTS ( SELECT 1\n"
          '   FROM usuarios u\n'
          "  WHERE ((u.id = ( SELECT auth.uid() AS uid)) AND (u.rol = ANY (ARRAY['Gerencia'::rol_usuario, "
          "'Administrador'::rol_usuario]))))))",
  'roles': '{authenticated}',
  'schemaname': 'storage',
  'tablename': 'objects',
  'with_check': None},
 {'cmd': 'INSERT',
  'permissive': 'PERMISSIVE',
  'policyname': 'Authenticated users can upload reports',
  'qual': None,
  'roles': '{authenticated}',
  'schemaname': 'storage',
  'tablename': 'objects',
  'with_check': "((bucket_id = 'reportes-semanales'::text) AND (EXISTS ( SELECT 1\n"
                '   FROM usuarios u\n'
                '  WHERE ((u.id = ( SELECT auth.uid() AS uid)) AND (u.rol = ANY '
                "(ARRAY['Gerencia'::rol_usuario, 'Administrador'::rol_usuario]))))))"},
 {'cmd': 'UPDATE',
  'permissive': 'PERMISSIVE',
  'policyname': 'Gerencia puede actualizar facturas',
  'qual': "((bucket_id = 'facturas'::text) AND (EXISTS ( SELECT 1\n"
          '   FROM usuarios\n'
          "  WHERE ((usuarios.id = auth.uid()) AND (usuarios.rol = 'Gerencia'::rol_usuario)))))",
  'roles': '{authenticated}',
  'schemaname': 'storage',
  'tablename': 'objects',
  'with_check': None},
 {'cmd': 'DELETE',
  'permissive': 'PERMISSIVE',
  'policyname': 'Gerencia puede eliminar facturas',
  'qual': "((bucket_id = 'facturas'::text) AND (EXISTS ( SELECT 1\n"
          '   FROM usuarios\n'
          "  WHERE ((usuarios.id = auth.uid()) AND (usuarios.rol = 'Gerencia'::rol_usuario)))))",
  'roles': '{authenticated}',
  'schemaname': 'storage',
  'tablename': 'objects',
  'with_check': None},
 {'cmd': 'SELECT',
  'permissive': 'PERMISSIVE',
  'policyname': 'Gerencia puede leer facturas',
  'qual': "((bucket_id = 'facturas'::text) AND (EXISTS ( SELECT 1\n"
          '   FROM usuarios\n'
          "  WHERE ((usuarios.id = auth.uid()) AND (usuarios.rol = 'Gerencia'::rol_usuario)))))",
  'roles': '{authenticated}',
  'schemaname': 'storage',
  'tablename': 'objects',
  'with_check': None},
 {'cmd': 'INSERT',
  'permissive': 'PERMISSIVE',
  'policyname': 'Gerencia puede subir facturas',
  'qual': None,
  'roles': '{authenticated}',
  'schemaname': 'storage',
  'tablename': 'objects',
  'with_check': "((bucket_id = 'facturas'::text) AND (EXISTS ( SELECT 1\n"
                '   FROM usuarios\n'
                "  WHERE ((usuarios.id = auth.uid()) AND (usuarios.rol = 'Gerencia'::rol_usuario)))))"},
 {'cmd': 'UPDATE',
  'permissive': 'PERMISSIVE',
  'policyname': 'Hato: actualizar fotos de chequeo',
  'qual': "((bucket_id = 'chequeos-fotos'::text) AND (EXISTS ( SELECT 1\n"
          '   FROM usuarios\n'
          "  WHERE ((usuarios.id = auth.uid()) AND (usuarios.rol = ANY (ARRAY['Administrador'::rol_usuario, "
          "'Gerencia'::rol_usuario]))))))",
  'roles': '{authenticated}',
  'schemaname': 'storage',
  'tablename': 'objects',
  'with_check': None},
 {'cmd': 'UPDATE',
  'permissive': 'PERMISSIVE',
  'policyname': 'Hato: actualizar fotos de liquidacion',
  'qual': "((bucket_id = 'hato-liquidaciones-fotos'::text) AND (EXISTS ( SELECT 1\n"
          '   FROM usuarios\n'
          "  WHERE ((usuarios.id = auth.uid()) AND (usuarios.rol = ANY (ARRAY['Administrador'::rol_usuario, "
          "'Gerencia'::rol_usuario]))))))",
  'roles': '{authenticated}',
  'schemaname': 'storage',
  'tablename': 'objects',
  'with_check': None},
 {'cmd': 'UPDATE',
  'permissive': 'PERMISSIVE',
  'policyname': 'Hato: actualizar fotos de pesaje',
  'qual': "((bucket_id = 'hato-pesajes-fotos'::text) AND (EXISTS ( SELECT 1\n"
          '   FROM usuarios\n'
          "  WHERE ((usuarios.id = auth.uid()) AND (usuarios.rol = ANY (ARRAY['Administrador'::rol_usuario, "
          "'Gerencia'::rol_usuario]))))))",
  'roles': '{authenticated}',
  'schemaname': 'storage',
  'tablename': 'objects',
  'with_check': None},
 {'cmd': 'DELETE',
  'permissive': 'PERMISSIVE',
  'policyname': 'Hato: eliminar fotos de chequeo',
  'qual': "((bucket_id = 'chequeos-fotos'::text) AND (EXISTS ( SELECT 1\n"
          '   FROM usuarios\n'
          "  WHERE ((usuarios.id = auth.uid()) AND (usuarios.rol = 'Gerencia'::rol_usuario)))))",
  'roles': '{authenticated}',
  'schemaname': 'storage',
  'tablename': 'objects',
  'with_check': None},
 {'cmd': 'DELETE',
  'permissive': 'PERMISSIVE',
  'policyname': 'Hato: eliminar fotos de liquidacion',
  'qual': "((bucket_id = 'hato-liquidaciones-fotos'::text) AND (EXISTS ( SELECT 1\n"
          '   FROM usuarios\n'
          "  WHERE ((usuarios.id = auth.uid()) AND (usuarios.rol = 'Gerencia'::rol_usuario)))))",
  'roles': '{authenticated}',
  'schemaname': 'storage',
  'tablename': 'objects',
  'with_check': None},
 {'cmd': 'DELETE',
  'permissive': 'PERMISSIVE',
  'policyname': 'Hato: eliminar fotos de pesaje',
  'qual': "((bucket_id = 'hato-pesajes-fotos'::text) AND (EXISTS ( SELECT 1\n"
          '   FROM usuarios\n'
          "  WHERE ((usuarios.id = auth.uid()) AND (usuarios.rol = 'Gerencia'::rol_usuario)))))",
  'roles': '{authenticated}',
  'schemaname': 'storage',
  'tablename': 'objects',
  'with_check': None},
 {'cmd': 'SELECT',
  'permissive': 'PERMISSIVE',
  'policyname': 'Hato: leer fotos de chequeo',
  'qual': "((bucket_id = 'chequeos-fotos'::text) AND (EXISTS ( SELECT 1\n"
          '   FROM usuarios\n'
          "  WHERE ((usuarios.id = auth.uid()) AND (usuarios.rol = ANY (ARRAY['Administrador'::rol_usuario, "
          "'Gerencia'::rol_usuario]))))))",
  'roles': '{authenticated}',
  'schemaname': 'storage',
  'tablename': 'objects',
  'with_check': None},
 {'cmd': 'SELECT',
  'permissive': 'PERMISSIVE',
  'policyname': 'Hato: leer fotos de liquidacion',
  'qual': "((bucket_id = 'hato-liquidaciones-fotos'::text) AND (EXISTS ( SELECT 1\n"
          '   FROM usuarios\n'
          "  WHERE ((usuarios.id = auth.uid()) AND (usuarios.rol = ANY (ARRAY['Administrador'::rol_usuario, "
          "'Gerencia'::rol_usuario]))))))",
  'roles': '{authenticated}',
  'schemaname': 'storage',
  'tablename': 'objects',
  'with_check': None},
 {'cmd': 'SELECT',
  'permissive': 'PERMISSIVE',
  'policyname': 'Hato: leer fotos de pesaje',
  'qual': "((bucket_id = 'hato-pesajes-fotos'::text) AND (EXISTS ( SELECT 1\n"
          '   FROM usuarios\n'
          "  WHERE ((usuarios.id = auth.uid()) AND (usuarios.rol = ANY (ARRAY['Administrador'::rol_usuario, "
          "'Gerencia'::rol_usuario]))))))",
  'roles': '{authenticated}',
  'schemaname': 'storage',
  'tablename': 'objects',
  'with_check': None},
 {'cmd': 'INSERT',
  'permissive': 'PERMISSIVE',
  'policyname': 'Hato: subir fotos de chequeo',
  'qual': None,
  'roles': '{authenticated}',
  'schemaname': 'storage',
  'tablename': 'objects',
  'with_check': "((bucket_id = 'chequeos-fotos'::text) AND (EXISTS ( SELECT 1\n"
                '   FROM usuarios\n'
                '  WHERE ((usuarios.id = auth.uid()) AND (usuarios.rol = ANY '
                "(ARRAY['Administrador'::rol_usuario, 'Gerencia'::rol_usuario]))))))"},
 {'cmd': 'INSERT',
  'permissive': 'PERMISSIVE',
  'policyname': 'Hato: subir fotos de liquidacion',
  'qual': None,
  'roles': '{authenticated}',
  'schemaname': 'storage',
  'tablename': 'objects',
  'with_check': "((bucket_id = 'hato-liquidaciones-fotos'::text) AND (EXISTS ( SELECT 1\n"
                '   FROM usuarios\n'
                '  WHERE ((usuarios.id = auth.uid()) AND (usuarios.rol = ANY '
                "(ARRAY['Administrador'::rol_usuario, 'Gerencia'::rol_usuario]))))))"},
 {'cmd': 'INSERT',
  'permissive': 'PERMISSIVE',
  'policyname': 'Hato: subir fotos de pesaje',
  'qual': None,
  'roles': '{authenticated}',
  'schemaname': 'storage',
  'tablename': 'objects',
  'with_check': "((bucket_id = 'hato-pesajes-fotos'::text) AND (EXISTS ( SELECT 1\n"
                '   FROM usuarios\n'
                '  WHERE ((usuarios.id = auth.uid()) AND (usuarios.rol = ANY '
                "(ARRAY['Administrador'::rol_usuario, 'Gerencia'::rol_usuario]))))))"},
 {'cmd': 'UPDATE',
  'permissive': 'PERMISSIVE',
  'policyname': 'Informes visita: actualizar',
  'qual': "((bucket_id = 'informes-visita'::text) AND (( SELECT get_user_role() AS get_user_role) = ANY "
          "(ARRAY['Administrador'::rol_usuario, 'Gerencia'::rol_usuario])))",
  'roles': '{authenticated}',
  'schemaname': 'storage',
  'tablename': 'objects',
  'with_check': None},
 {'cmd': 'DELETE',
  'permissive': 'PERMISSIVE',
  'policyname': 'Informes visita: eliminar',
  'qual': "((bucket_id = 'informes-visita'::text) AND (( SELECT get_user_role() AS get_user_role) = "
          "'Gerencia'::rol_usuario))",
  'roles': '{authenticated}',
  'schemaname': 'storage',
  'tablename': 'objects',
  'with_check': None},
 {'cmd': 'SELECT',
  'permissive': 'PERMISSIVE',
  'policyname': 'Informes visita: leer',
  'qual': "(bucket_id = 'informes-visita'::text)",
  'roles': '{authenticated}',
  'schemaname': 'storage',
  'tablename': 'objects',
  'with_check': None},
 {'cmd': 'INSERT',
  'permissive': 'PERMISSIVE',
  'policyname': 'Informes visita: subir',
  'qual': None,
  'roles': '{authenticated}',
  'schemaname': 'storage',
  'tablename': 'objects',
  'with_check': "((bucket_id = 'informes-visita'::text) AND (( SELECT get_user_role() AS get_user_role) = "
                "ANY (ARRAY['Administrador'::rol_usuario, 'Gerencia'::rol_usuario])))"}]
CAPTURED_HELPERS = ['CREATE OR REPLACE FUNCTION public.es_usuario_gerencia()\n'
 ' RETURNS boolean\n'
 ' LANGUAGE plpgsql\n'
 ' SECURITY DEFINER\n'
 " SET search_path TO 'public', 'pg_temp'\n"
 'AS $function$\n'
 'BEGIN\n'
 '    RETURN EXISTS (\n'
 '        SELECT 1 FROM public.usuarios\n'
 '        WHERE usuarios.id = auth.uid()\n'
 "        AND usuarios.rol = 'Gerencia'\n"
 '        AND usuarios.activo = true\n'
 '    );\n'
 'END;\n'
 '$function$\n',
 'CREATE OR REPLACE FUNCTION public.get_user_role()\n'
 ' RETURNS rol_usuario\n'
 ' LANGUAGE sql\n'
 ' SECURITY DEFINER\n'
 " SET search_path TO 'public', 'pg_temp'\n"
 'AS $function$\n'
 '  SELECT rol FROM usuarios WHERE id = auth.uid() AND activo = true\n'
 '$function$\n']


def docker(args, data=None, check=True):
    return subprocess.run(DOCKER + args, input=data, text=True, capture_output=True,
                          env=ENV, check=check, timeout=60)


def sql(source, ok=True):
    result = docker(['exec', '-i', '-u', 'postgres', CONTAINER, 'psql', '-X', '-qAt',
                     '-v', 'ON_ERROR_STOP=1', '-d', 'postgres'], source, False)
    if ok and result.returncode:
        raise AssertionError(result.stderr)
    if not ok and result.returncode == 0:
        raise AssertionError('Expected SQL rejection, got success')
    return result.stdout.strip() if ok else result.stderr


def literal(value):
    return "'" + value.replace("'", "''") + "'"


def ident(value):
    return '"' + value.replace('"', '""') + '"'


def verify(condition, label):
    global CHECKS
    if not condition:
        raise AssertionError(label)
    CHECKS += 1
    print('PASS', label, flush=True)


ACTORS = {role: str(uuid.uuid4()) for role in ROLES}
ACTORS.update({f'inactive-{role}': str(uuid.uuid4()) for role in ROLES})
ACTORS.update({'missing': str(uuid.uuid4()), 'null-active': str(uuid.uuid4()), 'no-claim': None})
ROWS = {}
CONVERSATIONS = {actor: str(uuid.uuid4()) for actor in ACTORS}
FOREIGN = ACTORS['Gerencia']
OTHER = ACTORS['Administrador']


def fixture():
    source = """
CREATE ROLE anon; CREATE ROLE authenticated;
CREATE SCHEMA auth; CREATE SCHEMA storage;
CREATE FUNCTION auth.uid() RETURNS uuid LANGUAGE sql STABLE AS $$
 SELECT nullif(current_setting('request.jwt.claim.sub',true),'')::uuid $$;
GRANT USAGE ON SCHEMA auth,storage TO authenticated,anon;
CREATE TYPE public.rol_usuario AS ENUM ('Administrador','Gerencia','Verificador','Monitor');
CREATE TABLE public.usuarios(id uuid PRIMARY KEY,rol public.rol_usuario,activo boolean);
CREATE TABLE storage.buckets(id text PRIMARY KEY);
CREATE TABLE storage.objects(id uuid PRIMARY KEY,bucket_id text NOT NULL REFERENCES storage.buckets,name text);
"""
    # These are minimal synthetic columns needed by the captured predicates, not the full live schema.
    for table in TABLES:
        source += f'CREATE TABLE public.{table}(id uuid PRIMARY KEY,user_id uuid,conversation_id uuid,name text);\n'
    for role, actor in ACTORS.items():
        if role not in ('missing', 'no-claim'):
            business_role = role.removeprefix('inactive-') if role != 'null-active' else 'Administrador'
            active = 'false' if role.startswith('inactive-') else 'NULL' if role == 'null-active' else 'true'
            source += f'INSERT INTO public.usuarios VALUES({literal(actor)},{literal(business_role)},{active});\n'
    source += '\n'.join(definition.rstrip().rstrip(';') + ';' for definition in CAPTURED_HELPERS)
    for table in TABLES + ['usuarios']:
        source += f'ALTER TABLE public.{table} ENABLE ROW LEVEL SECURITY;\n'
    source += 'ALTER TABLE storage.objects ENABLE ROW LEVEL SECURITY;\n'
    for bucket in BUCKETS + ['synthetic-unknown']:
        source += f'INSERT INTO storage.buckets VALUES({literal(bucket)});\n'
    # Synthetic table privileges deliberately permit ordinary roles to reach RLS.
    # They are fixture scaffolding, never a grant proposed by the candidate.
    source += 'GRANT SELECT,INSERT,UPDATE,DELETE ON ALL TABLES IN SCHEMA public,storage TO authenticated,anon;\n'
    for row in CAPTURED_POLICIES:
        roles = ','.join('PUBLIC' if role == 'public' else ident(role)
                         for role in row['roles'].strip('{}').split(','))
        source += f"CREATE POLICY {ident(row['policyname'])} ON {ident(row['schemaname'])}.{ident(row['tablename'])} "
        source += f"AS {row['permissive']} FOR {row['cmd']} TO {roles}"
        if row['qual'] is not None:
            source += f" USING ({row['qual']})"
        if row['with_check'] is not None:
            source += f" WITH CHECK ({row['with_check']})"
        source += ';\n'
    # Explicitly invoker-owned probe: catches only actual permission/RLS failures.
    source += """
CREATE FUNCTION public.synthetic_rls_probe(command text) RETURNS integer LANGUAGE plpgsql SECURITY INVOKER AS $$
DECLARE result integer;
BEGIN
 EXECUTE command INTO result;
 RETURN result;
EXCEPTION WHEN insufficient_privilege THEN RETURN -1;
END $$;
"""
    for name, actor in ACTORS.items():
        owner = actor or '00000000-0000-0000-0000-000000000000'
        for table in TABLES:
            row_id = CONVERSATIONS[name] if table == 'chat_conversations' else str(uuid.uuid4())
            ROWS[(name, table)] = row_id
            source += f'INSERT INTO public.{table} VALUES({literal(row_id)},{literal(owner)},{literal(CONVERSATIONS[name])},\'synthetic\');\n'
        for bucket in BUCKETS + ['synthetic-unknown']:
            row_id = str(uuid.uuid4())
            ROWS[(name, bucket)] = row_id
            source += f'INSERT INTO storage.objects VALUES({literal(row_id)},{literal(bucket)},\'synthetic\');\n'
    sql(source)


def probes(name, target, foreign=False, database_role='authenticated'):
    actor = ACTORS[name]
    owner = actor or '00000000-0000-0000-0000-000000000000'
    foreign_name = 'Administrador' if name == 'Gerencia' else 'Gerencia'
    row_owner = foreign_name if foreign else name
    row_id = ROWS[(row_owner, target)]
    if target in TABLES:
        table = f'public.{target}'
        inserted_owner = ACTORS[foreign_name] if foreign else owner
        conversation = CONVERSATIONS[foreign_name] if foreign else CONVERSATIONS[name]
        values = f'{literal(str(uuid.uuid4()))},{literal(inserted_owner)},{literal(conversation)},\'synthetic inserted\''
    else:
        table = 'storage.objects'
        values = f'{literal(str(uuid.uuid4()))},{literal(target)},\'synthetic inserted\''
    commands = [f'SELECT count(*)::integer FROM {table} WHERE id={literal(row_id)}',
        f'WITH changed AS (INSERT INTO {table} VALUES({values}) RETURNING id) SELECT count(*)::integer FROM changed',
        f"WITH changed AS (UPDATE {table} SET name='synthetic changed' WHERE id={literal(row_id)} RETURNING id) SELECT count(*)::integer FROM changed",
        f'WITH changed AS (DELETE FROM {table} WHERE id={literal(row_id)} RETURNING id) SELECT count(*)::integer FROM changed']
    expressions = ','.join(f'public.synthetic_rls_probe({literal(command)})' for command in commands)
    result = sql(f"BEGIN; SET LOCAL ROLE {database_role}; SET LOCAL request.jwt.claim.sub={literal(actor or '')}; "
                 f"SELECT json_build_array(current_user,{expressions})::text; ROLLBACK;")
    outcome = json.loads(result)
    verify(outcome[0] == database_role, f'ordinary {database_role} SQL execution {name}/{target}/{foreign}')
    return tuple(value == 1 for value in outcome[1:])


def policy_snapshot():
    return sql("SELECT coalesce(jsonb_agg(to_jsonb(p) ORDER BY schemaname,tablename,policyname),'[]')::text "
               "FROM pg_policies p WHERE permissive='PERMISSIVE';")


def tests():
    verify(sql('SHOW server_version;').startswith('17.6'), 'pinned PostgreSQL17.6')
    fixture()
    original = policy_snapshot()
    before = {(name, target, foreign): probes(name, target, foreign)
              for name in ACTORS for target in TABLES + BUCKETS + ['synthetic-unknown']
              for foreign in (False, True)}
    verify(before[('inactive-Administrador', 'esco_memorias', False)] == (True, True, True, True),
           'fixture reproduces captured inactive own-memory exposure')
    verify(before[('missing', 'productos', False)][0], 'fixture reproduces missing-profile product read')
    verify(before[('inactive-Gerencia', 'facturas', False)][0], 'fixture reproduces inactive storage reader via self-profile SELECT')
    candidate = (ROOT / 'src/sql/security-candidates/active-account-rls.sql').read_text()
    # Missing bucket/helper drift must abort transaction before adding any policies.
    sql("DELETE FROM storage.objects WHERE bucket_id='facturas'; DELETE FROM storage.buckets WHERE id='facturas';")
    error = sql(candidate, False)
    verify('captured bucket facturas missing' in error and policy_snapshot() == original, 'missing bucket preflight refuses without policy changes: ' + error)
    sql("INSERT INTO storage.buckets VALUES('facturas');")
    # Re-seed the removed synthetic objects only, preserving the original ids.
    for name in ACTORS:
        sql(f"INSERT INTO storage.objects VALUES({literal(ROWS[(name,'facturas')])},'facturas','synthetic');")
    sql("ALTER FUNCTION public.get_user_role() RESET search_path;")
    error = sql(candidate, False)
    verify('get_user_role helper changed or missing' in error and policy_snapshot() == original, 'helper search-path drift fails closed: ' + error)
    sql("ALTER FUNCTION public.get_user_role() SET search_path TO public,pg_temp;")
    helper_definition = next(definition for definition in CAPTURED_HELPERS if 'FUNCTION public.get_user_role()' in definition)
    sql(helper_definition.replace(' AND activo = true','').rstrip().rstrip(';') + ';')
    error = sql(candidate, False)
    verify('get_user_role helper changed or missing' in error and policy_snapshot() == original,
           'helper body losing active-account filter refuses')
    sql(helper_definition.rstrip().rstrip(';') + ';')
    sql("REVOKE EXECUTE ON FUNCTION public.get_user_role() FROM PUBLIC,authenticated;")
    error = sql(candidate, False)
    verify('authenticated helper execute unavailable' in error and policy_snapshot() == original,
           'missing ordinary-role helper privilege refuses without adding grants')
    sql("GRANT EXECUTE ON FUNCTION public.get_user_role() TO PUBLIC;")
    sql("ALTER FUNCTION public.get_user_role() OWNER TO authenticated;")
    error = sql(candidate, False)
    verify('trusted helper owner cannot bypass profile RLS safely' in error and policy_snapshot() == original,
           'untrusted helper owner refuses before recursive policy evaluation')
    sql("ALTER FUNCTION public.get_user_role() OWNER TO postgres;")
    sql("ALTER TABLE public.productos DISABLE ROW LEVEL SECURITY;")
    error = sql(candidate, False)
    verify('public.productos missing or RLS disabled' in error and policy_snapshot() == original,
           'disabled target RLS refuses without changing existing policies')
    sql("ALTER TABLE public.productos ENABLE ROW LEVEL SECURITY;")
    sql(candidate)
    verify(policy_snapshot() == original, 'every original permissive policy role/predicate preserved byte-for-byte')
    counts = sql("SELECT count(*) FROM pg_policies WHERE permissive='RESTRICTIVE';")
    verify(counts == '8', 'candidate adds exactly seven table gates and one scoped storage gate')
    for name in ACTORS:
        for target in TABLES + BUCKETS + ['synthetic-unknown']:
            for foreign in (False, True):
                result = probes(name, target, foreign)
                if name in ROLES:
                    verify(result == before[(name,target,foreign)], f'active authority unchanged {name}/{target}/{foreign}')
                else:
                    verify(result == (False,False,False,False), f'closed inactive/missing/empty principal {name}/{target}/{foreign}')
    for target in TABLES + BUCKETS + ['synthetic-unknown']:
        verify(probes('no-claim', target, database_role='anon') == (False,False,False,False), f'anon remains denied {target}')
    # Active-owner memories stay owner-only; broad existing bucket readers remain broad among active accounts.
    verify(before[('Monitor','esco_memorias',False)] == (True,True,True,True) and
           before[('Monitor','esco_memorias',True)] == (False,False,False,False), 'captured memory roles/foreign ownership retained')
    verify(before[('Verificador','reportes-semanales',True)][0], 'existing active foreign report-reader authority retained')
    for name in ROLES:
        owner = ACTORS[name]
        foreign = OTHER if name == 'Gerencia' else FOREIGN
        command = f"WITH changed AS (UPDATE public.esco_memorias SET user_id={literal(foreign)} WHERE id={literal(ROWS[(name,'esco_memorias')])} RETURNING id) SELECT count(*)::integer FROM changed"
        result = sql(f"BEGIN; SET LOCAL ROLE authenticated; SET LOCAL request.jwt.claim.sub={literal(owner)}; SELECT public.synthetic_rls_probe({literal(command)}); ROLLBACK;")
        verify(result == '-1', f'active own-memory ownership transfer stays refused {name}')
    command = f"WITH changed AS (UPDATE storage.objects SET bucket_id='synthetic-unknown' WHERE id={literal(ROWS[('Gerencia','facturas')])} RETURNING id) SELECT count(*)::integer FROM changed"
    result = sql(f"BEGIN; SET LOCAL ROLE authenticated; SET LOCAL request.jwt.claim.sub={literal(ACTORS['Gerencia'])}; SELECT public.synthetic_rls_probe({literal(command)}); ROLLBACK;")
    verify(result == '-1', 'active invoice replacement cannot move into unknown bucket')
    for name in ('inactive-Administrador','inactive-Gerencia','null-active'):
        result = sql(f"BEGIN; SET LOCAL ROLE authenticated; SET LOCAL request.jwt.claim.sub={literal(ACTORS[name])}; "
                     "SELECT count(*) FROM public.usuarios WHERE id=auth.uid(); ROLLBACK;")
        verify(result == '1', f'inactive self-profile UI SELECT remains available {name}')
    # No permissive policy has been introduced for unknown buckets.
    verify(before[('Gerencia','synthetic-unknown',False)] == (False,False,False,False), 'unknown bucket gains no object permission')
    error = sql(candidate, False)
    verify('already exists' in error and policy_snapshot() == original, 'duplicate candidate application refuses transactionally')


def main():
    global CONTAINER
    docker(['info','--format','{{.ServerVersion}}'])
    CONTAINER = 'escociaos-active-rls-' + uuid.uuid4().hex
    try:
        docker(['run','-d','--name',CONTAINER,'--pull=never','--network=none','--read-only',
        '--tmpfs','/var/lib/postgresql/data:rw,size=256m','--tmpfs','/var/run/postgresql:rw,size=16m',
        '--tmpfs','/tmp:rw,size=16m','--memory=512m','--cpus=2','--security-opt=no-new-privileges',
        '-e','POSTGRES_HOST_AUTH_METHOD=trust',IMAGE])
        inspection=json.loads(docker(['inspect','--format','{{json .HostConfig}}',CONTAINER]).stdout)
        verify(inspection['NetworkMode']=='none' and not inspection['Binds'] and not inspection['PortBindings'],
               'isolation: network none, no binds or ports')
        for _ in range(120):
            # pg_isready can briefly succeed against initdb's temporary server.
            # Only probe readiness once the entrypoint has exec'd the final postgres process.
            process = docker(['exec',CONTAINER,'cat','/proc/1/comm'],check=False)
            if process.stdout.strip() == 'postgres' and docker(['exec','-u','postgres',CONTAINER,'pg_isready'],check=False).returncode == 0:
                break
            time.sleep(0.25)
        else:
            raise AssertionError('Synthetic PostgreSQL startup failed')
        tests()
        print(f'{CHECKS} synthetic assertions passed. No production application or full-auth certification.',flush=True)
    finally:
        docker(['rm','-f','-v',CONTAINER],check=False)
        verify(docker(['inspect',CONTAINER],check=False).returncode != 0, 'cleanup verified: container and tmpfs removed')


if __name__ == '__main__':
    main()
