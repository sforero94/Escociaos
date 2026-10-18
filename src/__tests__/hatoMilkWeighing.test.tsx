import {it,expect} from 'vitest';
import {milkWeighingIntent,milkWeighingTotal} from '@/utils/hato/hatoMilkWeighingProtocol';
const cell={animalId:'11111111-1111-4111-8111-111111111111',date:'2026-10-07',am:0.1,pm:0.2,observed:null};
const intent={version:1,year:2026,month:10,captureId:null,cells:[cell]};
it('validates captured literal input and exact decimal total',()=>{expect(milkWeighingIntent(intent)).toEqual(intent);expect(milkWeighingTotal(.1,.2)).toBe(.3);expect(milkWeighingTotal(1e-7,2e-7)).toBe(3e-7);expect(milkWeighingTotal(null,0)).toBe(0);});
it.each([{...intent,created_by:cell.animalId},{...intent,cells:[cell,cell]},{...intent,cells:[{...cell,am:null,pm:null}]},{...intent,cells:[{...cell,am:-1}]},{...intent,cells:[{...cell,am:'1'}]},{...intent,cells:[{...cell,am:NaN}]},{...intent,cells:[{...cell,date:'2026-02-30'}]},{...intent,cells:[{...cell,date:'2026-11-07'}]},{...intent,cells:[{...cell,observed:{id:cell.animalId}}]},{...intent,captureId:'Other'},{...intent,year:'2026'}])('refuses malformed original input %#',bad=>{expect(()=>milkWeighingIntent(bad)).toThrow('original');});
