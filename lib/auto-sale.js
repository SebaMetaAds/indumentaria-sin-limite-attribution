import { patch, select } from './supabase.js';
import { createSale } from './sales.js';

function enc(v){return encodeURIComponent(v);}

function parseArMoney(raw){
  let s=String(raw||'').trim().replace(/\s+/g,'');
  if(!s) return null;
  if(s.includes('.') && s.includes(',')){
    s=s.replace(/\./g,'').replace(',','.');
  }else if(s.includes(',')){
    const parts=s.split(',');
    s=parts.length===2 && parts[1].length<=2 ? parts[0].replace(/\./g,'')+'.'+parts[1] : s.replace(/,/g,'');
  }else if(s.includes('.')){
    const parts=s.split('.');
    if(parts.length>1 && parts.slice(1).every(x=>x.length===3)) s=parts.join('');
  }
  const n=Number(s.replace(/[^0-9.]/g,''));
  return Number.isFinite(n)&&n>0?n:null;
}

function extractExplicitTotal(text){
  const value=String(text||'');
  const patterns=[
    /(?:total(?:\s+(?:del\s+)?pedido)?|importe\s+total|total\s+a\s+pagar|total\s+final)\s*[:\-]?\s*(?:ars\s*)?\$?\s*([0-9][0-9.,]*)/i
  ];
  for(const re of patterns){
    const m=value.match(re);
    const amount=m?.[1] ? parseArMoney(m[1]) : null;
    if(amount) return {amount,source:'explicit_total',text:value.slice(0,500)};
  }
  return null;
}

function extractLineSubtotals(text){
  const value=String(text||'');
  const re=/\b\d+\s*x\s*\$?\s*[0-9][0-9.,]*\s*[:=]\s*\$?\s*([0-9][0-9.,]*)/gi;
  const amounts=[];
  let m;
  while((m=re.exec(value))){
    const amount=parseArMoney(m[1]);
    if(amount) amounts.push(amount);
  }
  if(!amounts.length) return null;
  return {amount:amounts.reduce((a,b)=>a+b,0),source:'line_subtotals',text:value.slice(0,500)};
}

export async function findOrderTotalForProof({leadId,proofAt}){
  let q=`select=id,message_text,received_at,direction&lead_id=eq.${enc(leadId)}&message_text=not.is.null`;
  if(proofAt) q+=`&received_at=lte.${enc(proofAt)}`;
  q+='&order=received_at.desc&limit=200';
  const messages=await select('messages',q);

  for(const m of messages||[]){
    const found=extractExplicitTotal(m.message_text);
    if(found) return {...found,message_id:m.id,received_at:m.received_at};
  }
  for(const m of messages||[]){
    if(m.direction!=='outbound') continue;
    const found=extractLineSubtotals(m.message_text);
    if(found) return {...found,message_id:m.id,received_at:m.received_at};
  }
  return null;
}

export async function autoCreateSaleFromProof({message,lead,confidence}){
  if(!message?.id||!lead?.id) return {created:false,reason:'Datos incompletos'};
  if(message.direction!=='inbound') return {created:false,reason:'Archivo no entrante'};
  if(confidence!=='high'){
    await patch('messages',{id:`eq.${message.id}`},{auto_sale_status:'needs_total',auto_sale_error:'Comprobante con confianza media: requiere verificación'});
    return {created:false,reason:'Confianza media'};
  }

  const proofExternalId=`wa_proof:${message.message_id||message.id}`;
  const duplicate=await select('sales',`select=*&payment_external_id=eq.${enc(proofExternalId)}&limit=1`);
  if(duplicate?.[0]) return {created:false,duplicate:true,sale:duplicate[0]};

  const existingSales=await select('sales',`select=*&lead_id=eq.${enc(lead.id)}&order=sold_at.desc&limit=20`);
  const total=await findOrderTotalForProof({leadId:lead.id,proofAt:message.received_at});
  if(!total){
    await patch('messages',{id:`eq.${message.id}`},{
      auto_sale_status:'needs_total',auto_sale_error:'Comprobante detectado pero no se encontró un total de pedido claro'
    });
    return {created:false,reason:'Sin total claro'};
  }

  const closeExisting=(existingSales||[]).find(s=>{
    const sold=new Date(s.sold_at).getTime(), proof=new Date(message.received_at).getTime();
    return Math.abs(sold-proof)<=12*3600*1000 && Math.abs(Number(s.amount)-Number(total.amount))<0.01;
  });
  if(closeExisting){
    await patch('messages',{id:`eq.${message.id}`},{
      auto_sale_status:'skipped',auto_sale_amount:total.amount,auto_sale_at:new Date().toISOString(),
      auto_sale_error:'La venta ya estaba registrada con el mismo importe'
    });
    return {created:false,reason:'Venta ya registrada',sale:closeExisting};
  }

  try{
    const result=await createSale({
      leadId:lead.id,
      amount:total.amount,
      currency:'ARS',
      paymentMethod:'comprobante_automatico',
      paymentExternalId:proofExternalId,
      soldAt:message.received_at||new Date().toISOString()
    });
    const now=new Date().toISOString();
    await patch('leads',{id:`eq.${lead.id}`},{
      payment_check_status:'paid',payment_checked_at:now,updated_at:now
    });
    await patch('messages',{id:`eq.${message.id}`},{
      auto_sale_status:'created',auto_sale_amount:total.amount,auto_sale_at:now,auto_sale_error:null
    });
    return {created:true,amount:total.amount,sale:result.sale,total_source:total.source};
  }catch(error){
    await patch('messages',{id:`eq.${message.id}`},{
      auto_sale_status:'error',auto_sale_error:error.message
    }).catch(()=>{});
    throw error;
  }
}
