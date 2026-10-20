import {Table,TableHeader,TableBody,TableRow,TableHead,TableCell} from '@/components/ui/table';
import {Button} from '@/components/ui/button';
import type {useQuincenaConfirmation} from '../hooks/useQuincenaConfirmation';
import {formatCurrency} from '@/utils/format';

type Mode='prepare'|'post'|'status'|'resolve'|'new';
export function QuincenaConfirmationPanel({confirmation:c,onAction}:{confirmation:ReturnType<typeof useQuincenaConfirmation>;onAction:(mode:Mode)=>Promise<void>}){
 const a=c.attempt,r=a?.result,p=r?.plan,s=r?.original,q=p?.afterProduction??p?.beforeProduction,i=p?.afterIncome??p?.beforeIncome;
 return <section aria-label="Revisión protegida de quincena" className="space-y-2 rounded border p-3">
  <p>Consulta el intento original si hubo un error o perdiste la respuesta. La consulta no vuelve a registrar la venta.</p>
  {c.error&&<p role="alert">{c.error}</p>}
  <Button type="button" variant="outline" disabled={c.busy} onClick={()=>void onAction('status')}>Consultar intento original</Button>
  {a&&<>
   <p className="break-all text-xs">Intento: {a.key} · {r?.state??'resultado desconocido'}</p>
   {p&&q&&i&&<div className="space-y-1 text-sm">
    <p>{p.kind==='delete'?'Eliminar la quincena y su ingreso enlazado':'Guardar la quincena y su ingreso enlazado'}: {String(q.anio)} / {String(q.mes)} / {String(q.quincena)}</p>
    <p>Producción: {String(q.id)} · Ingreso: {String(i.id)}</p>
    <p>Periodo: {String(q.fecha_inicio)} — {String(q.fecha_fin)} · Pago: {String(i.fecha)}</p>
    <p>Litros: {String(i.cantidad)} · Pomar: {String(q.litros_pomar_confirmado??'sin dato')} · Vacas: {String(q.num_vacas_ordeno??'sin dato')}</p>
    <p>Región: {String(s?.region?.nombre??'sin dato')} · Medio: {String(s?.medium?.nombre??'sin dato')} · Comprador: {String(s?.buyer?.nombre??'sin comprador')}</p>
    {p.tax&&<p>Bruto: {formatCurrency(Number(p.tax.gross))} · ICA ({String(p.tax.rate)}): {formatCurrency(Number(p.tax.ica))} · Neto: {formatCurrency(Number(p.tax.net))}</p>}
    <p>Ingreso anterior: {p.beforeIncome?formatCurrency(Number(p.beforeIncome.valor)):'nuevo'} · Ingreso posterior: {p.afterIncome?formatCurrency(Number(p.afterIncome.valor)):'eliminado'}</p>
    <Table className="w-full text-left"><TableHeader><TableRow><TableHead>Valor</TableHead><TableHead>Anterior</TableHead><TableHead>Posterior</TableHead></TableRow></TableHeader><TableBody>
      {[
        ['Periodo',p.beforeProduction?`${p.beforeProduction.anio}/${p.beforeProduction.mes}/${p.beforeProduction.quincena}`:null,p.afterProduction?`${p.afterProduction.anio}/${p.afterProduction.mes}/${p.afterProduction.quincena}`:null],
        ['Pago',p.beforeIncome?.fecha,p.afterIncome?.fecha],
        ['Litros',p.beforeIncome?.cantidad,p.afterIncome?.cantidad],
        ['Neto',p.beforeIncome?.valor,p.afterIncome?.valor],
        ['Precio neto/litro',p.beforeIncome?.precio_unitario,p.afterIncome?.precio_unitario],
        ['Precio bruto/litro',p.beforeProduction?.precio_bruto_litro,p.afterProduction?.precio_bruto_litro],
        ['Pomar',p.beforeProduction?.litros_pomar_confirmado,p.afterProduction?.litros_pomar_confirmado],
        ['Vacas',p.beforeProduction?.num_vacas_ordeno,p.afterProduction?.num_vacas_ordeno],
        ['Región (id)',p.beforeIncome?.region_id,p.afterIncome?.region_id],
        ['Medio (id)',p.beforeIncome?.medio_pago_id,p.afterIncome?.medio_pago_id],
        ['Comprador (id)',p.beforeIncome?.comprador_id,p.afterIncome?.comprador_id],
        ['Descripción ingreso',p.beforeIncome?.nombre,p.afterIncome?.nombre],
        ['Notas',p.beforeProduction?.notas,p.afterProduction?.notas],
      ].map(([label,before,after])=><TableRow key={String(label)}><TableCell>{String(label)}</TableCell><TableCell className="break-all">{String(before??'sin dato')}</TableCell><TableCell className="break-all">{String(after??'sin dato')}</TableCell></TableRow>)}
    </TableBody></Table>
    <p>Notas: {String(q.notas??'sin notas')}</p>
   </div>}
   {r?.state==='pending'&&<Button type="button" disabled={c.busy} onClick={()=>void onAction('post')}>Confirmar esta quincena e ingreso</Button>}
   {(!r||r.state==='unknown')&&<Button type="button" disabled={c.busy} onClick={()=>void onAction('prepare')}>Recuperar preparación original</Button>}
   {(!r||r.state==='unknown'||r.state==='pending')&&<Button type="button" variant="outline" disabled={c.busy} onClick={()=>void onAction('resolve')}>Cancelar intento original</Button>}
   {r?.state==='committed'&&<p role="status">Operación confirmada y recibo verificado. No se volverá a registrar.</p>}
   {r?.state==='canceled'&&<p role="status">Intento cancelado; sin nueva operación.</p>}
   {(r?.state==='committed'||r?.state==='canceled')&&<Button type="button" disabled={c.busy} onClick={()=>void onAction('new')}>Reconocer resultado y continuar</Button>}
  </>}
 </section>;
}
