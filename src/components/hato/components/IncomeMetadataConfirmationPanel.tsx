import {Button} from '@/components/ui/button';
import type {useIncomeMetadataConfirmation} from '../hooks/useIncomeMetadataConfirmation';
type Mode='prepare'|'post'|'status'|'resolve'|'new';
export function IncomeMetadataConfirmationPanel({confirmation:c,onAction}:{confirmation:ReturnType<typeof useIncomeMetadataConfirmation>;onAction:(mode:Mode)=>Promise<void>}){
 const a=c.attempt,r=a?.result,p=r?.plan;
 return <section aria-label="Revisión de observaciones y factura" className="space-y-2 rounded border p-3">
 <p>Las correcciones financieras de una quincena medida se revisan en Hato Lechero → Producción, con bruto, ICA y neto. Aquí solo se cambian observaciones y factura.</p>
 {c.error&&<p role="alert">{c.error}</p>}
 <Button type="button" variant="outline" disabled={c.busy} onClick={()=>void onAction('status')}>Consultar intento original de observaciones/factura</Button>
 {a&&<><p className="break-all text-xs">Intento: {a.key} · {r?.state??'resultado desconocido'}</p>
 {p&&<div><p>Ingreso: {String(p.beforeIncome.id)} · Fecha: {String(p.beforeIncome.fecha)} · Neto: {String(p.beforeIncome.valor)} · Litros: {String(p.beforeIncome.cantidad)}</p><p>Observaciones: {String(p.beforeIncome.observaciones??'sin dato')} → {String(p.afterIncome.observaciones??'sin dato')}</p><p className="break-all">Factura: {String(p.beforeIncome.url_factura??'sin factura')} → {String(p.afterIncome.url_factura??'sin factura')}</p><p>La producción y todos los valores financieros se conservan.</p></div>}
 {a?.intent.attachment&&<p className="break-all">Recibo de factura: {a.intent.attachment.receiptId} · {a.intent.attachment.identity.mime} · {a.intent.attachment.identity.size} bytes · SHA-256 {a.intent.attachment.identity.sha256}</p>}
 {r?.state==='pending'&&<Button type="button" disabled={c.busy} onClick={()=>void onAction('post')}>Confirmar observaciones/factura capturadas</Button>}
 {(!r||r.state==='unknown')&&<Button type="button" disabled={c.busy} onClick={()=>void onAction('prepare')}>Recuperar preparación original</Button>}
 {(!r||r.state==='pending'||r.state==='unknown')&&<Button type="button" disabled={c.busy} onClick={()=>void onAction('resolve')}>Cancelar intento original</Button>}
 {r?.state==='committed'&&<p role="status">Metadatos confirmados; recibo verificado.</p>}
 {(r?.state==='committed'||r?.state==='canceled')&&<Button type="button" disabled={c.busy} onClick={()=>void onAction('new')}>Reconocer resultado y continuar</Button>}
 </>}
 </section>;
}
