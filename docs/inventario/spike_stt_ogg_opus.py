#!/usr/bin/env python3
"""Spike de la Fase 1 (docs/brief_tecnico_verificacion_inventario.md §5.7):
¿el par (OGG/Opus de Telegram, endpoint STT de OpenRouter) funciona?

OpenRouter documenta `ogg` entre los formatos de `input_audio` describiéndolo
como "OGG Vorbis" (verificado de nuevo el 2026-08-28 contra
https://openrouter.ai/docs/guides/overview/multimodal/audio.md y
https://openrouter.ai/docs/guides/overview/multimodal/stt.md -- la tabla de
formatos de la página STT dedicada dice LITERAL lo mismo: `ogg` -> `audio/ogg`
-> "Ogg Vorbis audio"). Telegram manda OGG/**Opus**: mismo contenedor, códec
distinto. La documentación no permite afirmar que el par funcione: hace falta
probarlo contra la API real, con una `OPENROUTER_API_KEY` válida.

QUÉ HACE ESTE SCRIPT
---------------------------------------------------------------------------
1. Construye la petición EXACTA que el pipeline de producción (§5.2/§5.3 del
   brief) haría en la etapa (1) -- transcripción -- contra
   `POST https://openrouter.ai/api/v1/audio/transcriptions`, en su variante
   `multipart/form-data` (la que usa el SDK compatible con OpenAI, la misma
   que usaría el edge function vía `fetch` + `FormData`): campos `file`
   (el audio) y `model` (por defecto el de §5.3, `RONDA_STT_MODELO`
   overridable). Es intencionalmente la variante multipart, NO la JSON con
   `input_audio.data` en base64 -- ambas rutas están documentadas y aceptan
   los mismos `format`, pero multipart es la que evita tener que declarar
   `format: "ogg"` a mano (el endpoint infiere el tipo del archivo adjunto
   por su `Content-Type`/extensión, que para este fixture es `audio/ogg`).
2. Si `OPENROUTER_API_KEY` NO está en el entorno, lo dice explícitamente y
   sale con código 2 -- sin inventar un resultado. Esto refleja el estado
   real de esta sesión de implementación: la clave vive como secreto de la
   edge function en Supabase, nunca en este working tree ni en ningún
   `.env` versionado (CLAUDE.md), y no estuvo disponible al escribir la
   Fase 1.
3. Si la clave SÍ está (uso posterior, por el dueño o en CI con el secreto
   inyectado), hace la llamada real y imprime el resultado: el texto
   transcrito si la llamada tuvo éxito, o el cuerpo exacto del error si el
   proveedor rechazó el formato -- que es la señal que decide la opción 2 de
   §5.7 (probar `format: "oga"` / otro modelo STT de los 19 disponibles).

QUÉ SE VERIFICÓ EN ESTA SESIÓN, SIN CLAVE (documentado para que quede
registro de qué parte del spike sí se pudo completar):
---------------------------------------------------------------------------
- El entorno SÍ tiene salida a internet (`curl` a openrouter.ai respondió
  200 en `/api/v1/models`), así que se pudo re-verificar la documentación
  citada en el brief en vivo, y confirmar que sigue diciendo lo mismo
  (ver más arriba) -- no había quedado desactualizada entre el 2026-08-28
  en que el CTO la citó y hoy.
- Una petición multipart REAL (con el fixture de este directorio) contra
  `POST /api/v1/audio/transcriptions`, SIN `Authorization`, devuelve
  `401 {"error":{"message":"No cookie auth credentials found","code":401}}`
  -- confirma que el endpoint existe, que acepta la forma multipart de la
  petición (no hay ningún 404 ni error de "Content-Type no soportado"
  antes de la puerta de autenticación), y que la puerta de auth se evalúa
  ANTES que el cuerpo -- por lo que no hay forma de aprender nada sobre si
  el par OGG/Opus funciona sin una clave real. El spike de verdad exige
  la clave; esto no es un atajo, es la confirmación de que no lo hay.

EL FIXTURE (`fixtures/uriel_nota_hallazgos.ogg`)
---------------------------------------------------------------------------
No es una nota de voz real de Uriel (no existe una en este entorno) sino
una síntesis de voz (macOS `say`) leyendo LITERAL el ejemplo del dueño en
`docs/plan_verificacion_inventario.md` §11.1:

    "Hay un desface en Silicalmag donde deberían haber cien kilos y hay
    noventa kilos, David dice que es por error en el sistema y hacen
    falta tres martillos que no aparecen."

Mono, 48 kHz, Opus, contenedor Ogg -- el mismo formato que
`message.voice` de Telegram (`mime_type: "audio/ogg"`, códec Opus). Cómo se
construyó, porque ninguna herramienta de este sandbox lo hace de punta a
punta y vale la pena dejarlo escrito para la próxima vez que haga falta:

  1. `say -o nota.aiff "<texto>"` -- síntesis de voz, 22050 Hz.
  2. `afconvert -f WAVE -d LEI16@48000 -c 1 nota.aiff nota_48k.wav` --
     remuestreo a 48 kHz mono (Opus solo acepta 8k/12k/16k/24k/48k).
  3. `afconvert -f caff -d opus nota_48k.wav nota_opus.caf` -- el
     codificador Opus de Core Audio SÍ funciona en este sandbox.
  4. `afconvert -f Oggf -d opus nota_48k.wav salida.ogg` -- **esto FALLA**
     en este entorno con `Error: ExtAudioFileWrite failed ('pck?')`,
     reproducible incluso con un tono sintético (probado, no es un
     problema del audio de entrada): el *muxer* Ogg de Core Audio en esta
     máquina está roto, aunque el códec Opus (paso 3, contenedor CAF) y el
     *demuxer* Ogg (`afinfo`/`afconvert` SÍ leen `.ogg` de vuelta, probado
     con el archivo de este mismo fixture) funcionan bien.
  5. Por eso el contenedor Ogg de este fixture se armó a mano (ver
     `_muxear_ogg_opus_desde_caf` en este archivo): se leyeron los paquetes
     Opus crudos del chunk `pakt`/`data` del `.caf` del paso 3 y se
     reempaquetaron en páginas Ogg válidas (cabecera `OpusHead`, comentario
     `OpusTags`, CRC-32 de Ogg -- polinomio 0x04C11DB7, no reflejado).
     Verificado: `file` lo reconoce como "Ogg data, Opus audio" y
     `afconvert`/`afinfo` (que sí saben LEER Ogg/Opus) lo decodifican de
     vuelta sin error, con el mismo conteo de paquetes que el `.caf`
     de origen -- es un archivo Ogg/Opus válido, no una aproximación.
     Esta función solo se necesita si algún día hay que regenerar el
     fixture; el `.ogg` ya generado queda commiteado.

USO
---------------------------------------------------------------------------
    OPENROUTER_API_KEY=sk-or-... python3 docs/inventario/spike_stt_ogg_opus.py
    python3 docs/inventario/spike_stt_ogg_opus.py --solo-verificar-endpoint
"""
from __future__ import annotations

import mimetypes
import os
import struct
import sys
import urllib.error
import urllib.request
import uuid
from pathlib import Path

RAIZ = Path(__file__).resolve().parent
FIXTURE = RAIZ / "fixtures" / "uriel_nota_hallazgos.ogg"
ENDPOINT = "https://openrouter.ai/api/v1/audio/transcriptions"
# Mismo default que propone el brief técnico §5.3 -- overridable por env,
# nunca hardcodeado en el edge function real (precedente ACCIONES_MODELO).
MODELO_DEFAULT = os.environ.get("RONDA_STT_MODELO", "openai/whisper-large-v3-turbo")


def _construir_multipart(campos: dict[str, str], archivo: tuple[str, bytes, str]) -> tuple[bytes, str]:
    """Arma un cuerpo `multipart/form-data` a mano (stdlib puro, sin agregar
    `requests` como dependencia nueva -- ver CLAUDE.md, "Dependencies need
    justification"; esto es un script de spike, no código de producción, y
    no vale la pena una dependencia nueva para una sola llamada)."""
    boundary = f"----escociaos-spike-{uuid.uuid4().hex}"
    partes: list[bytes] = []
    for nombre, valor in campos.items():
        partes.append(f"--{boundary}\r\nContent-Disposition: form-data; name=\"{nombre}\"\r\n\r\n{valor}\r\n".encode())
    nombre_archivo, contenido, tipo_mime = archivo
    partes.append(
        (
            f"--{boundary}\r\n"
            f'Content-Disposition: form-data; name="file"; filename="{nombre_archivo}"\r\n'
            f"Content-Type: {tipo_mime}\r\n\r\n"
        ).encode()
        + contenido
        + b"\r\n"
    )
    partes.append(f"--{boundary}--\r\n".encode())
    return b"".join(partes), boundary


def llamar_endpoint_transcripcion(api_key: str | None, modelo: str = MODELO_DEFAULT) -> int:
    if not FIXTURE.exists():
        print(f"ERROR: no existe el fixture {FIXTURE}. Nada que enviar.", file=sys.stderr)
        return 2

    audio = FIXTURE.read_bytes()
    tipo_mime = mimetypes.guess_type(FIXTURE.name)[0] or "audio/ogg"
    cuerpo, boundary = _construir_multipart({"model": modelo}, (FIXTURE.name, audio, tipo_mime))

    headers = {"Content-Type": f"multipart/form-data; boundary={boundary}"}
    if api_key:
        headers["Authorization"] = f"Bearer {api_key}"

    print(f"POST {ENDPOINT}")
    print(f"  model={modelo!r}  file={FIXTURE.name} ({len(audio)} bytes, {tipo_mime})")
    print(f"  Authorization={'Bearer ***' if api_key else '(ausente -- se espera 401)'}")

    req = urllib.request.Request(ENDPOINT, data=cuerpo, headers=headers, method="POST")
    try:
        with urllib.request.urlopen(req, timeout=30) as resp:
            cuerpo_resp = resp.read().decode("utf-8", errors="replace")
            print(f"\nHTTP {resp.status}")
            print(cuerpo_resp)
            if not api_key:
                print(
                    "\nADVERTENCIA: se esperaba un error de autenticación sin "
                    "OPENROUTER_API_KEY y la llamada tuvo éxito -- esto no debería "
                    "pasar; revisar si el endpoint cambió su contrato.",
                    file=sys.stderr,
                )
            return 0
    except urllib.error.HTTPError as exc:
        cuerpo_error = exc.read().decode("utf-8", errors="replace")
        print(f"\nHTTP {exc.code}")
        print(cuerpo_error)
        if not api_key:
            print(
                "\nEsperado: sin OPENROUTER_API_KEY el endpoint corta en la "
                "puerta de autenticación (401) ANTES de mirar el archivo -- "
                "esto no prueba nada sobre OGG/Opus. Corré este script con "
                "OPENROUTER_API_KEY=<clave real> para completar el spike de "
                "verdad (docs/brief_tecnico_verificacion_inventario.md §5.7).",
                file=sys.stderr,
            )
            return 2
        print(
            "\nEl proveedor RECHAZÓ el formato o el archivo con la clave puesta "
            "-- este es exactamente el resultado 2 de §5.7: probar "
            "format='oga' vía la ruta JSON base64, u otro de los 19 modelos "
            "STT listados bajo la misma llave.",
            file=sys.stderr,
        )
        return 1
    except urllib.error.URLError as exc:
        print(f"\nERROR de red: {exc}", file=sys.stderr)
        return 3


def verificar_endpoint_alcanzable() -> int:
    """No requiere clave: solo confirma que el endpoint responde (401 sin
    auth), que es la parte del spike que SÍ se pudo comprobar en esta
    sesión. No dice nada sobre OGG/Opus -- ver el docstring del módulo."""
    return llamar_endpoint_transcripcion(api_key=None)


def main(argv: list[str]) -> int:
    if "--solo-verificar-endpoint" in argv:
        return verificar_endpoint_alcanzable()

    api_key = os.environ.get("OPENROUTER_API_KEY")
    if not api_key:
        print(
            "OPENROUTER_API_KEY no está en el entorno. Este spike NO se puede "
            "completar sin la clave real -- vive como secreto de la edge "
            "function en Supabase (CLAUDE.md), nunca en este repo. Nada se "
            "inventa: corré\n\n"
            "    OPENROUTER_API_KEY=sk-or-... python3 docs/inventario/spike_stt_ogg_opus.py\n\n"
            "para completar el spike de docs/brief_tecnico_verificacion_inventario.md §5.7. "
            "Mientras tanto, --solo-verificar-endpoint confirma que el endpoint "
            "es alcanzable y que la petición multipart tiene la forma correcta.",
            file=sys.stderr,
        )
        return 2
    return llamar_endpoint_transcripcion(api_key=api_key)


# ---------------------------------------------------------------------------
# Regeneración del fixture -- solo hace falta si algún día se reemplaza por
# audio real de Uriel. No se ejecuta como parte de `main()`.
# ---------------------------------------------------------------------------


def _crc_ogg_tabla() -> list[int]:
    """CRC-32 de Ogg (RFC 3533): polinomio 0x04C11DB7, NO reflejado -- es
    distinto del CRC-32 de zip/png (0xEDB88320, reflejado). Ningún módulo de
    la stdlib de Python lo implementa directo, así que se genera la tabla."""
    tabla = []
    for i in range(256):
        crc = i << 24
        for _ in range(8):
            crc = ((crc << 1) ^ 0x04C11DB7) & 0xFFFFFFFF if crc & 0x80000000 else (crc << 1) & 0xFFFFFFFF
        tabla.append(crc)
    return tabla


_CRC_TABLA = _crc_ogg_tabla()


def _crc_ogg(datos: bytes) -> int:
    crc = 0
    for b in datos:
        crc = ((crc << 8) & 0xFFFFFFFF) ^ _CRC_TABLA[((crc >> 24) & 0xFF) ^ b]
    return crc


def _tabla_de_segmentos(paquetes: list[bytes]) -> bytes:
    """Lacing de Ogg: cada paquete se codifica como una serie de valores de
    255 (continúa) terminada por un valor < 255 (incluyendo 0 si el paquete
    es múltiplo exacto de 255). `page_segments` es 1 byte -- el llamador
    debe partir en varias páginas si esto supera 255 entradas."""
    tabla = bytearray()
    for paquete in paquetes:
        n = len(paquete)
        while n >= 255:
            tabla.append(255)
            n -= 255
        tabla.append(n)
    return bytes(tabla)


def _armar_pagina_ogg(paquetes: list[bytes], granule: int, serial: int, seqno: int, bos: bool, eos: bool) -> bytes:
    tabla_segmentos = _tabla_de_segmentos(paquetes)
    if len(tabla_segmentos) > 255:
        raise ValueError("una página Ogg no admite más de 255 entradas de segmento -- partir en más páginas")
    header_type = (0x02 if bos else 0) | (0x04 if eos else 0)
    encabezado = (
        b"OggS"
        + bytes([0, header_type])
        + struct.pack("<q", granule)
        + struct.pack("<I", serial)
        + struct.pack("<I", seqno)
        + b"\x00\x00\x00\x00"  # CRC, se rellena abajo
        + bytes([len(tabla_segmentos)])
        + tabla_segmentos
    )
    pagina_sin_crc = encabezado + b"".join(paquetes)
    crc = _crc_ogg(pagina_sin_crc)
    return pagina_sin_crc[:22] + struct.pack("<I", crc) + pagina_sin_crc[26:]


def _leer_paquetes_opus_de_caf(ruta_caf: Path) -> tuple[list[bytes], int, int]:
    """Extrae los paquetes Opus crudos de un `.caf` con códec Opus (el que sí
    produce `afconvert -f caff -d opus`). Devuelve (paquetes, pre_skip,
    total_frames). Implementa solo lo que hace falta del formato CAF: los
    chunks `pakt` (tabla de tamaños, enteros var-length big-endian de 7
    bits/byte) y `data` (audio crudo, con un campo "edit count" de 4 bytes
    al principio)."""
    datos = ruta_caf.read_bytes()
    if datos[0:4] != b"caff":
        raise ValueError(f"{ruta_caf} no es un archivo CAF")

    chunks: dict[bytes, tuple[int, int]] = {}
    pos = 8
    while pos < len(datos):
        fourcc = datos[pos : pos + 4]
        tam = struct.unpack(">q", datos[pos + 4 : pos + 12])[0]
        inicio_cuerpo = pos + 12
        chunks[fourcc] = (tam, inicio_cuerpo)
        if tam < 0:
            break
        pos = inicio_cuerpo + tam

    tam_pakt, inicio_pakt = chunks[b"pakt"]
    num_paquetes, num_frames_validos, priming, remainder = struct.unpack(">qqii", datos[inicio_pakt : inicio_pakt + 24])

    def leer_varint(pos: int) -> tuple[int, int]:
        val = 0
        while True:
            b = datos[pos]
            pos += 1
            val = (val << 7) | (b & 0x7F)
            if not (b & 0x80):
                return val, pos

    p = inicio_pakt + 24
    tamanos: list[int] = []
    for _ in range(num_paquetes):
        tam, p = leer_varint(p)
        tamanos.append(tam)

    _, inicio_data = chunks[b"data"]
    inicio_audio = inicio_data + 4  # 4 bytes de "edit count"
    paquetes = []
    offset = inicio_audio
    for tam in tamanos:
        paquetes.append(datos[offset : offset + tam])
        offset += tam

    total_frames = num_frames_validos + priming + remainder
    return paquetes, priming, total_frames


def _muxear_ogg_opus_desde_caf(
    ruta_caf: Path, ruta_ogg_salida: Path, canales: int = 1, frecuencia_entrada: int = 48000
) -> None:
    """Reempaqueta los paquetes Opus de un `.caf` en un contenedor Ogg válido
    a mano -- necesario porque el muxer Ogg de `afconvert` está roto en este
    sandbox (ver el docstring del módulo). Agrupa hasta 200 paquetes de audio
    por página (margen bajo el límite duro de 255 segmentos; cada paquete de
    20&nbsp;ms de voz mide bien por debajo de 255 bytes, así que un segmento
    por paquete alcanza)."""
    paquetes, pre_skip, total_frames = _leer_paquetes_opus_de_caf(ruta_caf)

    serial = uuid.uuid4().int & 0xFFFFFFFF
    opus_head = (
        b"OpusHead"
        + bytes([1, canales])
        + struct.pack("<H", pre_skip)
        + struct.pack("<I", frecuencia_entrada)
        + struct.pack("<h", 0)
        + bytes([0])
    )
    vendor = b"EscociaOS-spike-stt (afconvert opus + mux Ogg a mano)"
    opus_tags = b"OpusTags" + struct.pack("<I", len(vendor)) + vendor + struct.pack("<I", 0)

    paginas = [
        _armar_pagina_ogg([opus_head], granule=0, serial=serial, seqno=0, bos=True, eos=False),
        _armar_pagina_ogg([opus_tags], granule=0, serial=serial, seqno=1, bos=False, eos=False),
    ]

    LOTE = 200
    seqno = 2
    frames_por_paquete = 960  # 20 ms a 48 kHz, el frame_size que usa Core Audio para voz
    frames_acumulados = 0
    for inicio in range(0, len(paquetes), LOTE):
        lote = paquetes[inicio : inicio + LOTE]
        es_ultimo = inicio + LOTE >= len(paquetes)
        frames_acumulados += frames_por_paquete * len(lote)
        granule = total_frames if es_ultimo else frames_acumulados
        paginas.append(
            _armar_pagina_ogg(lote, granule=granule, serial=serial, seqno=seqno, bos=False, eos=es_ultimo)
        )
        seqno += 1

    ruta_ogg_salida.write_bytes(b"".join(paginas))


if __name__ == "__main__":
    sys.exit(main(sys.argv[1:]))
