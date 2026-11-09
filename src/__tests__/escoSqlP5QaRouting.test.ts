// Frozen registration hashes from approved P4: only the final free-text handler may change.
import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
import ts from 'typescript';
const BASE = [
  {
    "key": "command:\"cancelar\"",
    "sha": "9a63271c400b00f267493497f732b2f86ea18c8b6078ae3e66fd0900b10c0072"
  },
  {
    "key": "command:\"start\"",
    "sha": "96f23ff613dc6d2398a46024610e7a43bfa911ea6b1625dce72b73cb7c3b8106"
  },
  {
    "key": "command:\"jornal\"",
    "sha": "e75c10ade4d21bcb69a35bb84efaddef1c8408fd1fb0cbc083cb4da79ac94f4d"
  },
  {
    "key": "command:\"monitoreo\"",
    "sha": "932ccbd93bbc673c2ff4c799884208e002d76a75044c6e8a7d3b9954adec76ab"
  },
  {
    "key": "command:\"ingreso\"",
    "sha": "bafbab845746ff054350dda9c06f236557f2c572f4a85cd6c9cd447561496e3f"
  },
  {
    "key": "command:\"pesaje\"",
    "sha": "455075b3c2ae0f594eb04c979b60ee33560b02309bab2c4cdc91d5222e05a594"
  },
  {
    "key": "command:\"evento\"",
    "sha": "7cc2a11c93598aa93cab1738d17afd05074f666163bd796a853b650a75bb48cd"
  },
  {
    "key": "command:\"ronda\"",
    "sha": "7141819d2caa9bf2f71f910453f2049df5191cbf98c2815eb3f308d4b36e0a98"
  },
  {
    "key": "command:\"existencias\"",
    "sha": "382b73bd875b808a5261051cf53c009e417cca258314854a4f539ec19ffb4518"
  },
  {
    "key": "command:\"cerrarronda\"",
    "sha": "88d77abbb1ee05f9ddeb49611b0e259d8af0ba0f84e7b7971061fb1b9978fbfc"
  },
  {
    "key": "callbackQuery:\"start_ronda\"",
    "sha": "a65409031389ac077f727643a895ce62a4b5ddb7d757fe38edf3da09c87986bd"
  },
  {
    "key": "callbackQuery:\"start_cierreRonda\"",
    "sha": "a3ae04ce4364bb7312b24db9ceb8394a518b18a9abf6ac98a1a81ac02d1b124b"
  },
  {
    "key": "callbackQuery:\"ronda_abrir_manual\"",
    "sha": "51b63d885a57af08ea6653858605d6bad1b0d9ff8f2dec8434574a0f8a83fc2e"
  },
  {
    "key": "callbackQuery:/^ronda_alcance:([0-9a-f-]+)$/",
    "sha": "0d13f8f0ce0199264e01a598ebfe409166c88bcacb7c2f88b6cff464b3cf8a77"
  },
  {
    "key": "callbackQuery:\"ronda_recordatorio_empezar\"",
    "sha": "9172b63e91a9c3535cb9df954e442f7a6b04a7d3445952b79c4521995bd77b37"
  },
  {
    "key": "callbackQuery:\"ronda_recordatorio_posponer\"",
    "sha": "7f51e7b3d48ff9ea9f05d5c354e8465e8109be7c79a0daa81214c9608944eace"
  },
  {
    "key": "callbackQuery:/^ronda_posponer:(1|3|7)$/",
    "sha": "0ae100d713ff616dd2047dbae334ac49846e709ed1e1e7f8478619a8cf9b3476"
  },
  {
    "key": "command:\"explicar\"",
    "sha": "32585519493e7e27b9f414e4675485a591ecb7fbdaaa0370bbd8464922784f60"
  },
  {
    "key": "callbackQuery:\"start_explicar\"",
    "sha": "4feafdebad3bf1e90181ae5cf046e6decd456313d14776697e5bc7c713f4510d"
  },
  {
    "key": "callbackQuery:/^ronda_expl:([0-9a-f-]+)$/",
    "sha": "7a2f50877309b06b4e638b512c55f7986a95215d509f882c893582876bd3fc42"
  },
  {
    "key": "command:\"proponer\"",
    "sha": "ee69005a5690de7fbca01f407d4843b99641b56a00c1b53d72b1b376ac3c0d19"
  },
  {
    "key": "callbackQuery:/^rpa:([0-9a-f-]+):iniciar$/",
    "sha": "8e9ab8725eada5f9cb0b570d8bfe5d1e5389714c453b3b7aec5da0a49f6bc93a"
  },
  {
    "key": "callbackQuery:/^rpa:([0-9a-f-]+):c([1-7])$/",
    "sha": "01070b457f346a9901b261d27b217df8f36697793d7b916d6b8943f4e8289e07"
  },
  {
    "key": "callbackQuery:/^rpa:([0-9a-f-]+):volver$/",
    "sha": "46be2ea05d6292ad80b7f1c1126690022e5e72a05cbd59da40db2fabb2c8dd2b"
  },
  {
    "key": "callbackQuery:/^rpa:([0-9a-f-]+):c([1-7]):ok$/",
    "sha": "90b67388062788468eab1b0420cc8fed272e7ba6b831ab5639f94bd70e2ecd22"
  },
  {
    "key": "command:\"aprobar\"",
    "sha": "267de5ffd0b738ee5e1b7f2665ae66617a8a58ecf1c860573bd6e3f70f20822c"
  },
  {
    "key": "callbackQuery:\"start_aprobar\"",
    "sha": "3b96a10fda4577bef3767a895d91e1c178e30ad07db9deb583a946b299d73b32"
  },
  {
    "key": "callbackQuery:/^rda:([0-9a-f-]+):(A|D)$/",
    "sha": "cc5cc1f5ce8ec2c7e430252b7c6e0c52e1795948e7fd2370cc8f3b6f03592d64"
  },
  {
    "key": "callbackQuery:/^rda:([0-9a-f-]+):(A|D):c([1-7])$/",
    "sha": "5f3d2a9a584a8debf3ff0aeb7a67caa54daa978dcfebec9f927d8348a521768d"
  },
  {
    "key": "callbackQuery:/^rda:([0-9a-f-]+):(A|D):c([1-7]):ok$/",
    "sha": "4039019c13627f98247aba02b0a061ad1f13440291d7cc8d6b90283ade83544e"
  },
  {
    "key": "callbackQuery:/^rda:([0-9a-f-]+):forzar$/",
    "sha": "c13ac0b0a262c13cb91bd0ab1aa4b50758f86d9cf506c74baec3f566507626fc"
  },
  {
    "key": "command:\"ayuda\"",
    "sha": "b2aa3959a913deab2b7ec41308062cc08abc67aee8561a4d677ab55c9af83b48"
  },
  {
    "key": "callbackQuery:\"start_jornal\"",
    "sha": "0de0593fd380f2bc5f949ddc87b5a586ee40f8252802daf28c69d4e6eb327335"
  },
  {
    "key": "callbackQuery:\"start_monitoreo\"",
    "sha": "d83a5fe188dbb8c0edae1e7f3755c6c915259772d0c935d20b75ddf65e721e62"
  },
  {
    "key": "callbackQuery:\"start_ingreso\"",
    "sha": "b2b6a66bb4ede8092b9f66384e31223d089dc1a035d08efac287bc5646731afb"
  },
  {
    "key": "callbackQuery:\"start_pesajeLeche\"",
    "sha": "1c4ca34b7ce6729b7b12f2d6cb44f77e080fa0be312bcf12ec83c30adc5cba2b"
  },
  {
    "key": "callbackQuery:\"start_eventoHato\"",
    "sha": "3f0b49565b11bb61e0159cf02ae467ee7414b81aa8e1fe584ebc870cf4cb6379"
  },
  {
    "key": "callbackQuery:\"start_consulta\"",
    "sha": "3d971d49aa10b85a106b47dc1a12b76ce7d9622450558a3c56914954fbe8481e"
  },
  {
    "key": "callbackQuery:/^mem_save:(.+)$/",
    "sha": "037b95957ba437a6669ef04eacd6b113a1db34d099e5a4ed7f3475c1ec0d6548"
  },
  {
    "key": "callbackQuery:/^mem_cancel:(.+)$/",
    "sha": "3118ef50261ca4d523ed5e9e2156028b325ecf0a254b61be932f61f2d36db465"
  },
  {
    "key": "callbackQuery:/^hato_ev_undo:/",
    "sha": "48cdbe05b635dca69287c4657378136edecfac0cbfd8e25d3188d0f06ecf600d"
  },
  {
    "key": "callbackQuery:/^hato_tr_undo:/",
    "sha": "449246920408f21445d5b317ef932fd2048fa36650d97a75b76738172c36e012"
  },
  {
    "key": "callbackQuery:/^hato_alerta:(.+):(si|no|otro)$/",
    "sha": "64babcb6e6048c8dcabe4ec1e8c71b703811b4b82f21b04a70bf13b45060151d"
  },
  {
    "key": "on:\"message:voice\"",
    "sha": "fdb80a797adceea99659470861cdfd8c68037735f5b11666e82fa890f9ab9b7a"
  },
  {
    "key": "on:\"message:audio\"",
    "sha": "d813564e28c47d924302ad737abb8e9628b747e85ac2a865f047144a8817b0f1"
  },
  {
    "key": "callbackQuery:/^ronda_prev:(confirmar|descartar):([0-9a-f-]+)$/",
    "sha": "b1113eb5026cbd74fde1801e8197991afe07e63e3836dcde304b7f8d39c0bcb7"
  },
  {
    "key": "callbackQuery:/^ronda_undo:([0-9a-f-]+)$/",
    "sha": "3d4e6478631e9b22c4b61b35cdc62993f0f04c48d4e85f6c88a3fbecdb0a8c15"
  },
  {
    "key": "on:\"message:text\"",
    "sha": "561c17848bddf64a9a062573d0a3c748538364d66d02c2bdb08d4eb6290300ec"
  },
  {
    "key": "on:\"message:text\"",
    "sha": "daebf2cdd141703c258b1f147f3c2d5e0fce51ad0958e074d1d8c115a2af01d3"
  },
  {
    "key": "on:\"message:text\"",
    "sha": "fdea56225bbee795fb8feb43d08090d380610ec999c07dc514af4f1ac9917eda"
  }
];
describe('QA P5: mantiene capturas y alertas anteriores al fallback SQL', () => {
 it('conserva el código y orden de todos los handlers previos de P4', () => {
  const src = ts.createSourceFile('bot.ts', readFileSync('src/supabase/functions/server/telegram/bot.ts','utf8'), ts.ScriptTarget.Latest,true);
  const found: Array<{key:string;sha:string}> = [];
  function visit(node: ts.Node) {
   if(ts.isCallExpression(node)&&ts.isPropertyAccessExpression(node.expression)&&node.expression.expression.getText(src)==='bot'&&['on','command','callbackQuery'].includes(node.expression.name.text))found.push({key:node.expression.name.text+':'+node.arguments[0].getText(src),sha:createHash('sha256').update(node.getText(src)).digest('hex')});
   ts.forEachChild(node,visit);
  }
  visit(src);let cursor=0;
  for(const old of BASE){ const i=found.findIndex((v,index)=>index>=cursor&&v.key===old.key);expect(i,old.key+' debe seguir registrado en orden').toBeGreaterThanOrEqual(0);expect(found[i].sha,old.key+' código intacto').toBe(old.sha);cursor=i+1;}
 });
});
