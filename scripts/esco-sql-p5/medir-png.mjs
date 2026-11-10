// D3 local experiment: public licensed assets and a fixed synthetic chart, no product input.
// Run with Deno 2.1.4; see docs/esco2/esco-sql-p5-d3-spike.md for asset preparation.
const assetDir = Deno.args[0];
if (!assetDir) throw Error('Usage: deno run --allow-read medir-png.mjs <asset-directory>');
const read = (name) => Deno.readFile(`${assetDir}/${name}`);
const sha = async (bytes) => Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256', bytes))).map(v => v.toString(16).padStart(2, '0')).join('');
const wrapper = await read('index.mjs');
const wasm = await read('index_bg.wasm');
const font = await read('EscoSansSubset-Regular.ttf');
if (await sha(wrapper) !== '10170d02d816f02ec76f9bc095b01d9becf536e7b1e12e5aa616652c84b237a1') throw Error('Wrapper hash mismatch');
if (await sha(wasm) !== '22bf6e9f9a100d972da0411a69c5ba504367fc1fa87b3b64e3f35e53926d2d70') throw Error('Wasm hash mismatch');
if (await sha(font) !== '41fe94278a67320534dcac66d540d1fcdb5856e79ebe6f79ae2dc2dd8550764c') throw Error('Font hash mismatch');
let externalFetches = 0;
globalThis.fetch = () => { externalFetches++; throw Error('Network forbidden in D3 local experiment'); };
// Experimental-only instrumentation reads the upstream module's linear-memory size.
// The wrapper bytes above are verified before appending this non-product export.
const instrumented = new TextDecoder().decode(wrapper) + '\nexport function memoryBytes(){return wasm?.memory?.buffer?.byteLength??0;}';
const { Resvg, initWasm, memoryBytes } = await import('data:text/javascript;base64,' + btoa(instrumented));
const encode = (bytes) => { let raw = ''; for (let i = 0; i < bytes.length; i += 8192) raw += String.fromCharCode(...bytes.subarray(i, i + 8192)); return btoa(raw); };
const decode = (value) => { const raw = atob(value); const bytes = new Uint8Array(raw.length); for (let i = 0; i < raw.length; i++) bytes[i] = raw.charCodeAt(i); return bytes; };
const wasm64 = encode(wasm), font64 = encode(font);
const before = Deno.memoryUsage();
const started = performance.now();
await initWasm(decode(wasm64));
const initMs = performance.now() - started;
const fontBytes = decode(font64);
const svg = ['<svg xmlns="http://www.w3.org/2000/svg" width="720" height="480"><rect width="720" height="480" fill="white"/><g font-family="Esco Sans Subset" font-size="14" fill="#1f2937"><text x="30" y="30">Producción sintética: árbol, ñ, á, lluvia y $95M</text>'];
for (let i = 0; i < 60; i++) {
  for (let j = 0; j < 6; j++) {
    const height = 10 + ((i * 37 + j * 17) % 350);
    svg.push(`<rect x="${45 + i * 10 + j * 1.5}" y="${405 - height}" width="1.3" height="${height}" fill="${['#2563eb', '#16a34a', '#dc2626', '#9333ea', '#0891b2', '#f59e0b'][j]}"/>`);
  }
  if (i % 6 === 0) svg.push(`<text x="${45 + i * 10}" y="430">${String(i).padStart(2, '0')}</text>`);
}
svg.push('<text x="30" y="455">Sin dato ≠ 0; 60 categorías × 6 series sintéticas.</text></g></svg>');
const timings = [], stages = [];
let pngBytes = 0;
for (let i = 0; i < 41; i++) {
  const started = performance.now();
  const renderer = new Resvg(svg.join(''), { font: { fontBuffers: [fontBytes], defaultFontFamily: 'Esco Sans Subset' } });
  let image;
  try {
    image = renderer.render();
    const png = image.asPng();
    if (png[0] !== 137 || png[1] !== 80 || png[2] !== 78 || png[3] !== 71) throw Error('Not PNG');
    if (image.width !== 720 || image.height !== 480) throw Error('Wrong dimensions');
    pngBytes = png.byteLength;
  } finally {
    image?.free();
    renderer.free();
  }
  timings.push(performance.now() - started);
  stages.push({ ...Deno.memoryUsage(), wasm: memoryBytes() });
}
console.log(JSON.stringify({ deno: Deno.version.deno, platform: Deno.build.target, init_ms: initMs, first_render_ms: timings[0], warm_render_ms: timings.slice(1), before, stages, external_fetches: externalFetches, png_bytes: pngBytes, raw_assets_bytes: wasm.length + font.length, encoded_asset_characters: wasm64.length + font64.length }));
