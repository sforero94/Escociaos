import {Button} from '@/components/ui/button';
import type {useSaleCorrectionConfirmation} from '../hooks/useSaleCorrectionConfirmation';
type Mode='prepare'|'post'|'status'|'resolve'|'new';
export function SaleCorrectionConfirmationPanel({confirmation:c,onAction}:{confirmation:ReturnType<typeof useSaleCorrectionConfirmation>;onAction:(mode:Mode)=>Promise<void>}){
 const a=c.attempt,r=a?.result,s=r?.original,p=r?.plan;
 const names={business:'Negocio',category:'Categoría',region:'Región',medium:'Medio de pago',buyer:'Comprador'};
 return <section aria-label="Revisión financiera de venta Hato" className="space-y-2 rounded border p-3">
 <p>Las correcciones de una venta Hato requieren revisar la venta y los animales ligados antes de confirmar. Se conservan el evento, el estado del animal, los recibos originales y el historial.</p>
 {c.error&&<p role="alert">{c.error}</p>}
 <Button type="button" variant="outline" disabled={c.busy} onClick={()=>void onAction('status')}>Consultar corrección original de venta</Button>
 {a&&<><p className="break-all text-xs">Intento: {a.key} · {r?.state??'resultado desconocido'}</p>
 {p&&s&&<div><p>Ingreso: {String(p.beforeIncome.id)}</p><p>Venta original: {String(s.sale.request.request_key)}</p>
 {s.sale.links.map(link=><p key={String(link.event.id)}>Animal {String(link.animal.numero??'sin número')} · {String(link.animal.nombre??'sin nombre')} · Estado capturado: {String(link.animal.estado)} · Evento {String(link.event.id)} · Fecha original: {String(link.event.fecha)}</p>)}
 <p>Fecha: {String(p.beforeIncome.fecha)} → {String(p.afterIncome.fecha)}</p><p>Descripción: {String(p.beforeIncome.nombre)} → {String(p.afterIncome.nombre)}</p><p>Valor: {String(p.beforeIncome.valor)} → {String(p.afterIncome.valor)}</p>
 {Object.entries(names).map(([k,name])=><p key={k}>{name}: {String(s.beforeRefs[k]?.nombre??'sin dato')} → {String(s.refs[k]?.nombre??'sin dato')}</p>)}
 <p>La cantidad, las observaciones y la factura se conservan.</p></div>}
 {r?.state==='pending'&&<Button type="button" disabled={c.busy} onClick={()=>void onAction('post')}>Confirmar corrección financiera capturada</Button>}
 {(!r||r.state==='unknown')&&<Button type="button" disabled={c.busy} onClick={()=>void onAction('prepare')}>Recuperar preparación financiera original</Button>}
 {(!r||r.state==='pending'||r.state==='unknown')&&<Button type="button" disabled={c.busy} onClick={()=>void onAction('resolve')}>Cancelar corrección original</Button>}
 {r?.state==='committed'&&<p role="status">Corrección confirmada; recibo verificado.</p>}
 {(r?.state==='committed'||r?.state==='canceled')&&<Button type="button" disabled={c.busy} onClick={()=>void onAction('new')}>Reconocer corrección y continuar</Button>}
 </>}
 </section>;
}
