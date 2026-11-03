#!/usr/bin/env python3
"""Regenera las copias autocontenidas del motor de consultas Esco (#311)."""
from pathlib import Path
root = Path(__file__).resolve().parent.parent
source = (root / 'src/utils/escoConsultas.ts').read_bytes()
for tree in ['src/supabase/functions/server', 'supabase/functions/make-server-1ccce916']:
    (root / tree / 'esco-consultas.ts').write_bytes(source)
    for module in ['escoEvidencia', 'escoRespuesta', 'escoHechosTrabajo', 'escoHechosInventario', 'escoHechosRegistros', 'escoAlcance', 'escoCobertura', 'escoHechosClima', 'escoClimaCalidad', 'escoPoliticaDatos', 'escoSolicitudIndividual', 'escoProyeccionLegada', 'escoDispatcherVerificado', 'escoTurnoVerificado', 'escoNucleoDefiniciones', 'escoNucleoComun', 'escoNucleoSolicitud', 'escoNucleoTransporte', 'escoNucleoCatalogo', 'escoNucleoGanado', 'escoNucleoCultivos', 'escoNucleoComercio', 'escoNucleoOperaciones', 'calculosRadiacion']:
        contents = (root / 'src/utils' / (module + '.ts')).read_text()
        contents = contents.replace("@/utils/escoConsultas", "./esco-consultas.ts").replace("./escoConsultas", "./esco-consultas.ts")
        contents = contents.replace("./calculosRadiacion'", "./calculosRadiacion.ts'").replace('./calculosRadiacion"', './calculosRadiacion.ts"')
        import re
        contents = re.sub(r"(['\"])(?:@/utils/|\./)(esco[A-Za-z]+)(?:\.ts)?\1", lambda m: m[1] + './' + m[2] + '.ts' + m[1], contents)
        (root / tree / (module + '.ts')).write_text(contents)
    (root / tree / 'escoCohorteAplicaciones.ts').write_bytes((root / 'src/utils/escoCohorteAplicaciones.ts').read_bytes())
    (root / tree / 'escoAplicacionHechos.ts').write_bytes((root / 'src/utils/escoAplicacionHechos.ts').read_bytes())
(root / 'supabase/functions/make-server-1ccce916/chat.tsx').write_bytes((root / 'src/supabase/functions/server/chat.tsx').read_bytes())
