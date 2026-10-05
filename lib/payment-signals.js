function normalize(value){
  return String(value||'')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g,'')
    .toLowerCase()
    .replace(/\s+/g,' ')
    .trim();
}

const RULES=[
  ['alias', t => /(^|[^a-z0-9])alias([^a-z0-9]|$)/.test(t)],
  ['sena', t => /(^|[^a-z0-9])sena(r|ndo|do|da)?([^a-z0-9]|$)/.test(t)],
  ['te_transferi', t => t.includes('te transferi')],
  ['ya_pague', t => t.includes('ya pague')],
  ['comprobante', t => t.includes('comprobante')],
  ['transferencia_realizada', t => t.includes('transferencia realizada')],
  ['te_pague', t => t.includes('te pague')],
  ['ya_transferi', t => t.includes('ya transferi')],
  ['pago_realizado', t => t.includes('pago realizado')],
  ['abone', t => /(^|[^a-z0-9])abone([^a-z0-9]|$)/.test(t)],
  ['hice_transferencia', t => t.includes('hice la transferencia') || t.includes('te hice la transferencia')],
  ['transferencia_hecha', t => t.includes('transferencia hecha')],
  ['mande_comprobante', t => t.includes('mande el comprobante') || t.includes('te mande el comprobante')],
  ['pago_hecho', t => t.includes('pago hecho')]
];

export function detectPaymentSignal(value){
  const original=String(value||'').trim();
  if(!original) return null;
  const text=normalize(original);
  for(const [type,test] of RULES){
    if(test(text)){
      return {type,text:original.slice(0,500)};
    }
  }
  return null;
}
