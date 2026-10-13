/** Untrusted XLSX admission. No ExcelJS workbook parser runs before this completes. */
import { Inflate, SaxesParser } from '../vendor/spreadsheet/exceljs-runtime.mjs';
import { XLSX_LIMITS } from './limits.ts';
export { XLSX_LIMITS } from './limits.ts';
export type Range = {
    top: number;
    left: number;
    bottom: number;
    right: number;
};
export type SheetMetadata = {
    name: string;
    path: string;
    range: Range | null;
    numbers: Map<string, number>;
    dates: Map<string, number>;
};
const MAIN = 'http://schemas.openxmlformats.org/spreadsheetml/2006/main';
const REL = 'http://schemas.openxmlformats.org/package/2006/relationships';
const DOCUMENT_REL = 'http://schemas.openxmlformats.org/officeDocument/2006/relationships';
export function invalid(message: string): never { throw new Error(`Archivo XLSX inválido: ${message}`); }
export function address(ref: string): {
    row: number;
    column: number;
} {
    const match = /^([A-Z]{1,3})([1-9]\d{0,6})$/.exec(ref);
    if (!match)
        return invalid(`referencia ${ref}`);
    const column = [...match[1]].reduce((n, c) => n * 26 + c.charCodeAt(0) - 64, 0), row = Number(match[2]);
    if (row > XLSX_LIMITS.rows || column > XLSX_LIMITS.columns)
        return invalid('límite de filas/columnas');
    return { row, column };
}
export function rangeFromRef(ref: string): Range {
    const parts = ref.split(':');
    if (parts.length > 2)
        return invalid('dimensión');
    const a = address(parts[0]), b = address(parts[1] ?? parts[0]);
    if (a.row > b.row || a.column > b.column)
        return invalid('dimensión invertida');
    return { top: a.row, left: a.column, bottom: b.row, right: b.column };
}
function crc32(bytes: Uint8Array): number { let crc = 0xffffffff; for (const byte of bytes) {
    crc ^= byte;
    for (let i = 0; i < 8; i++)
        crc = (crc >>> 1) ^ ((crc & 1) ? 0xedb88320 : 0);
} return (crc ^ 0xffffffff) >>> 0; }
function unzip(bytes: Uint8Array): Map<string, Uint8Array> {
    if (bytes.byteLength > XLSX_LIMITS.archiveBytes)
        return invalid('máximo 20 MiB');
    if (bytes[0] === 0xd0 && bytes[1] === 0xcf)
        throw new Error('El formato .xls no es compatible. Convierta el archivo a .xlsx en Excel o LibreOffice.');
    const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength), len = bytes.length;
    const u16 = (p: number) => view.getUint16(p, true), u32 = (p: number) => view.getUint32(p, true);
    if (len < 22 || u32(0) !== 0x04034b50)
        return invalid('se requiere un archivo .xlsx ZIP; CSV se importa por separado');
    let end = -1;
    for (let p = len - 22; p >= Math.max(0, len - 65557); p--)
        if (u32(p) === 0x06054b50 && p + 22 + u16(p + 20) === len) {
            end = p;
            break;
        }
    if (end < 0)
        return invalid('directorio ZIP ausente');
    const count = u16(end + 10), central = u32(end + 16), size = u32(end + 12);
    if (u16(end + 4) || u16(end + 6) || u16(end + 8) !== count || count > XLSX_LIMITS.entries || central + size !== end || !count)
        return invalid('directorio ZIP no soportado o demasiado grande');
    const files = new Map<string, Uint8Array>(), blocks: {
        start: number;
        end: number;
    }[] = [];
    let p = central, total = 0;
    const decoder = new TextDecoder('utf-8', { fatal: true });
    for (let i = 0; i < count; i++) {
        if (p + 46 > end || u32(p) !== 0x02014b50)
            return invalid('entrada ZIP truncada');
        const flags = u16(p + 8), method = u16(p + 10), crc = u32(p + 16), compressed = u32(p + 20), expanded = u32(p + 24), nameLen = u16(p + 28), extra = u16(p + 30), comment = u16(p + 32), local = u32(p + 42);
        if (p + 46 + nameLen + extra + comment > end || u16(p + 34) || flags & ~0x080e || ![0, 8].includes(method) || compressed === 0xffffffff || expanded === 0xffffffff)
            return invalid('ZIP cifrado, ZIP64 o compresión no soportada');
        const nameBytes = bytes.subarray(p + 46, p + 46 + nameLen);
        let name: string;
        try {
            name = decoder.decode(nameBytes);
        }
        catch {
            return invalid('nombre ZIP no UTF-8');
        }
        if (!name || name.includes('\\') || [...name].some(character => character.charCodeAt(0) < 32) || name.startsWith('/') || name.split('/').some((part, i, parts) => part === '.' || part === '..' || (!part && i !== parts.length - 1)) || files.has(name))
            return invalid('ruta ZIP ambigua');
        // JSZip honors Unicode-path extra fields. Admit them only when identical to
        // the already checked UTF-8 path; ZIP64 metadata is deliberately unsupported.
        const checkExtra = (start: number, length: number) => { let pos = start; const endExtra = start + length; while (pos < endExtra) {
            if (pos + 4 > endExtra)
                return invalid('campo extra ZIP');
            const kind = u16(pos), size = u16(pos + 2);
            pos += 4;
            if (pos + size > endExtra)
                return invalid('campo extra ZIP');
            if (kind === 1)
                return invalid('ZIP64 no soportado');
            if (kind === 0x7075) {
                if (size < 5 || bytes[pos] !== 1 || u32(pos + 1) !== crc32(nameBytes))
                    return invalid('ruta Unicode ZIP');
                let unicode: string;
                try {
                    unicode = decoder.decode(bytes.subarray(pos + 5, pos + size));
                }
                catch {
                    return invalid('ruta Unicode ZIP');
                }
                if (unicode !== name)
                    return invalid('ruta Unicode ZIP discordante');
            }
            pos += size;
        } };
        checkExtra(p + 46 + nameLen, extra);
        const isXML = /\.(xml|rels)$/i.test(name), limit = isXML ? XLSX_LIMITS.xmlBytes : XLSX_LIMITS.expandedBytes;
        if (expanded > limit || total + expanded > XLSX_LIMITS.expandedBytes)
            return invalid('límite de expansión ZIP/XML');
        if (local + 30 > central || u32(local) !== 0x04034b50 || u16(local + 6) !== flags || u16(local + 8) !== method)
            return invalid('cabecera local ZIP');
        const localName = u16(local + 26), localExtra = u16(local + 28), start = local + 30 + localName + localExtra, stop = start + compressed;
        if (localName !== nameLen || stop > central || bytes.subarray(local + 30, local + 30 + localName).some((b, j) => b !== nameBytes[j]))
            return invalid('cabeceras ZIP discordantes');
        if (!(flags & 8) && (u32(local + 14) !== crc || u32(local + 18) !== compressed || u32(local + 22) !== expanded))
            return invalid('tamaños ZIP discordantes');
        let blockEnd = stop;
        if (flags & 8) {
            const descriptor = stop + (stop + 4 <= central && u32(stop) === 0x08074b50 ? 4 : 0);
            if (descriptor + 12 > central || u32(descriptor) !== crc || u32(descriptor + 4) !== compressed || u32(descriptor + 8) !== expanded)
                return invalid('descriptor ZIP');
            blockEnd = descriptor + 12;
        }
        blocks.push({ start: local, end: blockEnd });
        checkExtra(local + 30 + localName, localExtra);
        const input = bytes.subarray(start, stop);
        let output: Uint8Array;
        if (method === 0) {
            if (compressed !== expanded)
                return invalid('tamaño almacenado');
            output = input;
        }
        else {
            const chunks: Uint8Array[] = [];
            let actual = 0;
            const inflate = new Inflate({ raw: true, chunkSize: 16384 });
            inflate.onData = chunk => { actual += chunk.length; if (actual > expanded || actual > limit || total + actual > XLSX_LIMITS.expandedBytes)
                return invalid('límite de expansión real'); chunks.push(chunk); };
            try {
                inflate.push(input, true);
            }
            catch (error) {
                if (error instanceof Error && error.message.startsWith('Archivo XLSX'))
                    throw error;
                return invalid('deflate corrupto');
            }
            if (inflate.err || !inflate.ended || inflate.strm.avail_in || actual !== expanded)
                return invalid('deflate/tamaño real discordante');
            output = new Uint8Array(actual);
            let offset = 0;
            for (const chunk of chunks) {
                output.set(chunk, offset);
                offset += chunk.length;
            }
        }
        if (crc32(output) !== crc)
            return invalid('CRC ZIP');
        total += output.length;
        files.set(name, output);
        p += 46 + nameLen + extra + comment;
    }
    if (p !== end)
        return invalid('directorio ZIP sobrante');
    blocks.sort((a, b) => a.start - b.start);
    let previous = 0;
    for (const block of blocks) {
        if (block.start !== previous)
            return invalid('entradas ZIP solapadas o datos ocultos');
        previous = block.end;
    }
    if (previous !== central)
        return invalid('datos ZIP ocultos');
    return files;
}
type Tag = {
    local: string;
    uri: string;
    attributes: Record<string, {
        value: string;
        local: string;
        uri: string;
    }>;
};
const attr = (tag: Tag, name: string) => Object.values(tag.attributes).find(a => a.local === name && !a.uri)?.value;
function xml(bytes: Uint8Array, open: (tag: Tag) => void = () => { }, text: (text: string) => void = () => { }, close: (tag: Tag) => void = () => { }, root?: {
    local: string;
    uri: string;
}): void {
    const parser = new SaxesParser({ xmlns: true });
    let depth = 0, nodes = 0;
    parser.on('doctype', () => invalid('DTD no permitido'));
    parser.on('error', (error: Error) => invalid(`XML mal formado: ${error.message}`));
    parser.on('opentag', (tag: Tag) => { if (!nodes && root && (tag.local !== root.local || tag.uri !== root.uri))
        return invalid('namespace/raíz OOXML'); if (++depth > 128 || ++nodes > 5000000)
        return invalid('límite XML'); open(tag); });
    parser.on('closetag', (tag: Tag) => { close(tag); depth--; });
    parser.on('text', text);
    parser.on('cdata', text);
    try {
        parser.write(new TextDecoder('utf-8', { fatal: true }).decode(bytes)).close();
    }
    catch (error) {
        if (error instanceof Error && error.message.startsWith('Archivo XLSX'))
            throw error;
        return invalid('XML/UTF-8');
    }
}
export async function inspectXlsxArchive(input: Uint8Array | ArrayBuffer): Promise<{
    sheets: SheetMetadata[];
    date1904: boolean;
}> {
    const files = unzip(input instanceof Uint8Array ? input : new Uint8Array(input));
    const part = (path: string) => files.get(path) ?? invalid(`parte ausente ${path}`);
    for (const [name, bytes] of files)
        if (/\.(xml|rels)$/i.test(name)) {
            const ids = new Set<string>();
            xml(bytes, tag => { if (/\.rels$/i.test(name) && tag.local === 'Relationship') {
                if (tag.uri !== REL)
                    return invalid('namespace de relaciones');
                const id = attr(tag, 'Id');
                if (!id || ids.has(id) || !attr(tag, 'Type') || !attr(tag, 'Target'))
                    return invalid('relación ambigua');
                ids.add(id);
            } }, () => { }, () => { }, /\.rels$/i.test(name) ? { local: 'Relationships', uri: REL } : undefined);
        }
    const sheets: {
        name: string;
        id: string;
    }[] = [], relations = new Map<string, {
        target: string;
        mode?: string;
        type: string;
    }>();
    let date1904 = false;
    xml(part('xl/workbook.xml'), tag => {
        if (tag.local === 'workbook' && tag.uri !== MAIN)
            return invalid('namespace OOXML no soportado');
        if (tag.uri !== MAIN)
            return;
        if (tag.local === 'workbookPr') {
            const value = attr(tag, 'date1904');
            if (value !== undefined && !['0', '1', 'false', 'true'].includes(value))
                return invalid('date1904');
            date1904 = value === '1' || value === 'true';
        }
        if (tag.local === 'sheet') {
            const name = attr(tag, 'name'), id = Object.values(tag.attributes).find(a => a.local === 'id' && a.uri === DOCUMENT_REL)?.value;
            if (!name || !id || sheets.some(s => s.name === name || s.id === id))
                return invalid('hoja ambigua');
            sheets.push({ name, id });
        }
    }, () => { }, () => { }, { local: 'workbook', uri: MAIN });
    if (!sheets.length || sheets.length > XLSX_LIMITS.sheets)
        return invalid('límite de hojas');
    xml(part('xl/_rels/workbook.xml.rels'), tag => { if (tag.local === 'Relationships' && tag.uri !== REL)
        return invalid('namespace de relaciones'); if (tag.local !== 'Relationship' || tag.uri !== REL)
        return; const id = attr(tag, 'Id'), target = attr(tag, 'Target'), type = attr(tag, 'Type'); if (!id || !target || !type || relations.has(id))
        return invalid('relación ambigua'); relations.set(id, { target, mode: attr(tag, 'TargetMode'), type }); }, () => { }, () => { }, { local: 'Relationships', uri: REL });
    let strings = 0, styles = 0;
    const shared = files.get('xl/sharedStrings.xml');
    let declaredUnique: number | undefined;
    if (shared)
        xml(shared, tag => {
            if (tag.uri !== MAIN)
                return invalid('namespace de textos compartidos');
            if (tag.local === 'sst') {
                const count = attr(tag, 'count'), unique = attr(tag, 'uniqueCount');
                for (const value of [count, unique])
                    if (value !== undefined && (!/^\d+$/.test(value) || Number(value) > XLSX_LIMITS.cells))
                        return invalid('conteo de textos compartidos');
                if (unique !== undefined)
                    declaredUnique = Number(unique);
            }
            if (tag.local === 'si' && ++strings > XLSX_LIMITS.cells)
                return invalid('límite de textos compartidos');
        }, () => { }, () => { }, { local: 'sst', uri: MAIN });
    if (declaredUnique !== undefined && declaredUnique !== strings)
        return invalid('conteo de textos compartidos discordante');
    const style = files.get('xl/styles.xml');
    const counted: Record<string, string> = { numFmts: 'numFmt', fonts: 'font', fills: 'fill', borders: 'border', cellStyleXfs: 'xf', cellXfs: 'xf', cellStyles: 'cellStyle', dxfs: 'dxf' };
    const collections = new Map<string, {
        actual: number;
        declared?: number;
    }>();
    let collection: string | undefined;
    const formats = new Map<number, string>(), styleFormats: number[] = [];
    if (style)
        xml(style, tag => {
            if (tag.uri !== MAIN)
                return;
            if (tag.local === 'numFmt' && collection === 'numFmts') {
                const id = Number(attr(tag, 'numFmtId')), code = attr(tag, 'formatCode');
                if (!Number.isInteger(id) || id < 0 || code === undefined || formats.has(id))
                    return invalid('formato numérico ambiguo');
                formats.set(id, code);
            }
            if (tag.local === 'xf' && collection === 'cellXfs') {
                const id = Number(attr(tag, 'numFmtId') ?? 0);
                if (!Number.isInteger(id) || id < 0)
                    return invalid('referencia de formato');
                styleFormats.push(id);
            }
            if (counted[tag.local]) {
                if (collection || collections.has(tag.local))
                    return invalid('colección de estilos duplicada');
                collection = tag.local;
                const declared = attr(tag, 'count');
                if (declared !== undefined && (!/^\d+$/.test(declared) || Number(declared) > XLSX_LIMITS.cells))
                    return invalid('conteo de estilos');
                collections.set(collection, { actual: 0, declared: declared === undefined ? undefined : Number(declared) });
            }
            else if (collection && tag.local === counted[collection]) {
                const record = collections.get(collection)!;
                if (++record.actual > XLSX_LIMITS.cells)
                    return invalid('límite de estilos');
            }
        }, () => { }, tag => { if (tag.local === collection)
            collection = undefined; }, { local: 'styleSheet', uri: MAIN });
    for (const record of collections.values())
        if (record.declared !== undefined && record.declared !== record.actual)
            return invalid('conteo de estilos discordante');
    styles = collections.get('cellXfs')?.actual ?? 0;
    const dateStyles = new Set<number>();
    styleFormats.forEach((id, i) => { if (id >= 164 && !formats.has(id))
        return invalid('referencia de formato numérico'); const code = formats.get(id); if ((id >= 14 && id <= 22) || (id >= 27 && id <= 36) || (id >= 45 && id <= 47) || (id >= 50 && id <= 58) || (code && /[ymdhs]|\[[hms]+\]/i.test(code.replace(/"[^"]*"|\\./g, '').replace(/\[(?![hms]+\])[^\]]*\]/ig, ''))))
        dateStyles.add(i); });
    let matrixTotal = 0, cellTotal = 0, mergeCells = 0, mergeCount = 0;
    const used = new Set<string>();
    const metadata: SheetMetadata[] = [];
    for (const sheet of sheets) {
        const relation = relations.get(sheet.id);
        if (!relation || relation.mode || relation.type !== `${DOCUMENT_REL}/worksheet`)
            return invalid('relación de hoja interna requerida');
        const path = relation.target.startsWith('/') ? relation.target.slice(1) : `xl/${relation.target}`;
        if (!/^xl\/worksheets\/[^/]+\.xml$/.test(path) || used.has(path))
            return invalid('destino de hoja ambiguo');
        used.add(path);
        let range: Range | null = null, observed: Range | null = null, row = 0, previousRow = 0, previousCol = 0;
        const merges: Range[] = [];
        const seen = new Set<string>(), numbers = new Map<string, number>(), dates = new Map<string, number>();
        let cell: {
            ref: string;
            type?: string;
            style?: string;
            value: string;
            formula?: {
                type?: string;
                si?: string;
                ref?: string;
            };
        } | null = null, inValue = false;
        const masters = new Map<string, Range>(), followers: {
            si: string;
            ref: string;
        }[] = [];
        xml(part(path), tag => {
            if (['worksheet', 'dimension', 'sheetData', 'row', 'c', 'v', 'f', 'col', 'mergeCell'].includes(tag.local) && tag.uri !== MAIN)
                return invalid('namespace de hoja');
            if (tag.uri !== MAIN)
                return;
            if (tag.local === 'dimension') {
                if (range)
                    return invalid('dimensión duplicada');
                range = rangeFromRef(attr(tag, 'ref') ?? '');
            }
            if (tag.local === 'row') {
                row = Number(attr(tag, 'r'));
                if (!Number.isInteger(row) || row <= previousRow || row > XLSX_LIMITS.rows)
                    return invalid('fila inválida');
                previousRow = row;
                previousCol = 0;
            }
            if (tag.local === 'col') {
                const min = Number(attr(tag, 'min')), max = Number(attr(tag, 'max'));
                if (!Number.isInteger(min) || !Number.isInteger(max) || min < 1 || max < min || max > XLSX_LIMITS.columns)
                    return invalid('geometría de columnas');
            }
            if (tag.local === 'mergeCell') {
                const merged = rangeFromRef(attr(tag, 'ref') ?? '');
                mergeCells += (merged.bottom - merged.top + 1) * (merged.right - merged.left + 1);
                if (++mergeCount > 1024 || mergeCells > XLSX_LIMITS.cells)
                    return invalid('límite de rangos combinados');
                if (merges.some(m => merged.top <= m.bottom && merged.bottom >= m.top && merged.left <= m.right && merged.right >= m.left))
                    return invalid('rangos combinados solapados');
                merges.push(merged);
            }
            if (tag.local === 'c') {
                const ref = attr(tag, 'r') ?? '', pos = address(ref);
                if (!row || pos.row !== row || pos.column <= previousCol || seen.has(ref) || ++cellTotal > XLSX_LIMITS.cells)
                    return invalid('celda/fila duplicada o límite de celdas');
                previousCol = pos.column;
                seen.add(ref);
                observed = observed ? { top: Math.min(observed.top, pos.row), left: Math.min(observed.left, pos.column), bottom: Math.max(observed.bottom, pos.row), right: Math.max(observed.right, pos.column) } : { top: pos.row, left: pos.column, bottom: pos.row, right: pos.column };
                cell = { ref, type: attr(tag, 't'), style: attr(tag, 's'), value: '' };
                if (cell.type && !['n', 's', 'str', 'inlineStr', 'b', 'e', 'd'].includes(cell.type))
                    return invalid('tipo de celda');
                if (cell.style !== undefined && (!/^\d+$/.test(cell.style) || Number(cell.style) >= styles))
                    return invalid('referencia de estilo');
            }
            if (tag.local === 'v' && cell)
                inValue = true;
            if (tag.local === 'f' && cell) {
                cell.formula = { type: attr(tag, 't'), si: attr(tag, 'si'), ref: attr(tag, 'ref') };
                if (cell.formula.type === 'shared') {
                    const si = cell.formula.si;
                    if (!si || !/^\d+$/.test(si))
                        return invalid('índice de fórmula compartida');
                    if (cell.formula.ref) {
                        if (masters.has(si))
                            return invalid('fórmula compartida duplicada');
                        masters.set(si, rangeFromRef(cell.formula.ref));
                    }
                    else
                        followers.push({ si, ref: cell.ref });
                }
            }
        }, text => { if (inValue && cell)
            cell.value += text; }, tag => {
            if (tag.uri !== MAIN)
                return;
            if (tag.local === 'v')
                inValue = false;
            if (tag.local === 'c' && cell) {
                const value = cell.value.trim();
                if (cell.type === 's' && (!/^\d+$/.test(value) || Number(value) >= strings))
                    return invalid('referencia de texto compartido');
                if (cell.type === 'd') {
                    if (!/^\d{4}-\d{2}-\d{2}(?:T\d{2}:\d{2}:\d{2}(?:\.\d+)?(?:Z|[+-]\d{2}:\d{2}))?$/.test(value) || !Number.isFinite(Date.parse(value)))
                        return invalid('fecha ISO');
                    dates.set(cell.ref, (Date.parse(value) - Date.UTC(1899, 11, 30)) / 86400000);
                }
                if (cell.type === 'b' && !['0', '1'].includes(value))
                    return invalid('booleano');
                if ((!cell.type || cell.type === 'n') && value) {
                    const n = Number(value);
                    if (!/^[+-]?(?:\d+(?:\.\d*)?|\.\d+)(?:[eE][+-]?\d+)?$/.test(value) || !Number.isFinite(n))
                        return invalid('número no finito/inválido');
                    numbers.set(cell.ref, n);
                    if (dateStyles.has(Number(cell.style ?? 0)))
                        dates.set(cell.ref, n + (date1904 ? 1462 : 0));
                }
                cell = null;
            }
            if (tag.local === 'row')
                row = 0;
        }, { local: 'worksheet', uri: MAIN });
        for (const follower of followers) {
            const master = masters.get(follower.si), pos = address(follower.ref);
            if (!master || pos.row < master.top || pos.row > master.bottom || pos.column < master.left || pos.column > master.right)
                return invalid('referencia de fórmula compartida');
        }
        const finalRange = (range as Range | null) ?? (observed as Range | null);
        const actual = observed as Range | null;
        if (finalRange && actual && (actual.top < finalRange.top || actual.left < finalRange.left || actual.bottom > finalRange.bottom || actual.right > finalRange.right))
            return invalid('celdas fuera de dimensión');
        for (const merged of merges)
            if (!finalRange || merged.top < finalRange.top || merged.left < finalRange.left || merged.bottom > finalRange.bottom || merged.right > finalRange.right)
                return invalid('rango combinado fuera de dimensión');
        if (finalRange)
            matrixTotal += (finalRange.bottom - finalRange.top + 1) * (finalRange.right - finalRange.left + 1);
        if (matrixTotal > XLSX_LIMITS.cells)
            return invalid('límite de matriz del libro');
        metadata.push({ name: sheet.name, path, range: finalRange, numbers, dates });
    }
    return { sheets: metadata, date1904 };
}
