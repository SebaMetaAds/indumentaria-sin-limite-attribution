import { insert, patch, select } from './supabase.js';
import { findClientByWebhook } from './clients.js';

function enc(v){ return encodeURIComponent(v); }

function ts(v){
  if(!v) return new Date().toISOString();
  const n=Number(v);
  return Number.isFinite(n) ? new Date(n*1000).toISOString() : new Date(v).toISOString();
}

function mediaMeta(m){
  const payload=m?.[m?.type];
  if(!payload||!['image','video','audio','document','sticker'].includes(m?.type)){
    return {media_id:null,media_mime_type:null,media_sha256:null,media_filename:null};
  }
  return {
    media_id:payload.id||null,
    media_mime_type:payload.mime_type||null,
    media_sha256:payload.sha256||null,
    media_filename:payload.filename||null
  };
}

function interactiveText(i){
  if(!i) return null;
  if(i?.button_reply?.title) return i.button_reply.title;
  if(i?.list_reply?.title){
    const description=i.list_reply.description ? ` — ${i.list_reply.description}` : '';
    return `${i.list_reply.title}${description}`;
  }
  if(i?.nfm_reply?.response_json) return 'Formulario respondido';
  const parts=[];
  if(i?.header?.text) parts.push(i.header.text);
  if(i?.body?.text) parts.push(i.body.text);
  if(i?.footer?.text) parts.push(i.footer.text);

  if(i?.type==='button' && Array.isArray(i?.action?.buttons)){
    const buttons=i.action.buttons.map(b=>b?.reply?.title).filter(Boolean);
    if(buttons.length) parts.push('Opciones: '+buttons.join(' · '));
  }

  if(i?.type==='list'){
    if(i?.action?.button) parts.push('Botón: '+i.action.button);
    const rows=(i?.action?.sections||[]).flatMap(s=>s?.rows||[]).map(r=>r?.title).filter(Boolean);
    if(rows.length) parts.push('Opciones: '+rows.slice(0,8).join(' · ')+(rows.length>8?'…':''));
  }

  if(['product','product_list','catalog_message'].includes(i?.type)) parts.push('Catálogo / producto enviado');
  if(i?.type==='flow') parts.push('Formulario / flujo enviado');
  if(!parts.length && i?.type) parts.push('Contenido interactivo: '+i.type);
  return parts.filter(Boolean).join('\n') || 'Contenido interactivo de WhatsApp';
}

function contentText(m){
  if(m?.text?.body) return m.text.body;
  if(m?.image?.caption) return m.image.caption;
  if(m?.video?.caption) return m.video.caption;
  if(m?.document?.caption) return m.document.caption;
  if(m?.button?.text) return m.button.text;
  if(m?.interactive) return interactiveText(m.interactive);
  if(m?.reaction?.emoji) return 'Reacción: ' + m.reaction.emoji;
  return null;
}

async function latestLead(phone, clientId){
  const rows=await select('leads', `select=*&client_id=eq.${enc(clientId)}&phone=eq.${enc(phone)}&order=last_message_at.desc&limit=1`);
  return rows?.[0]||null;
}

async function ensureHistoryLead(client, phone, messages){
  let lead=await latestLead(phone, client.id);
  const ordered=[...(messages||[])].sort((a,b)=>Number(a.timestamp||0)-Number(b.timestamp||0));
  const first=ordered[0], last=ordered[ordered.length-1];
  const firstAt=first?ts(first.timestamp):new Date().toISOString();
  const lastAt=last?ts(last.timestamp):firstAt;

  if(lead){
    const currentFirst=lead.first_message_at ? new Date(lead.first_message_at).getTime() : Infinity;
    const currentLast=lead.last_message_at ? new Date(lead.last_message_at).getTime() : 0;
    const patchBody={updated_at:new Date().toISOString()};
    if(new Date(firstAt).getTime()<currentFirst) patchBody.first_message_at=firstAt;
    if(new Date(lastAt).getTime()>currentLast){
      patchBody.last_message_at=lastAt;
      patchBody.last_message_text=contentText(last);
      patchBody.last_message_id=last?.id||lead.last_message_id;
    }
    const rows=await patch('leads',{id:`eq.${lead.id}`},patchBody);
    return rows?.[0]||lead;
  }

  const rows=await insert('leads',{
    client_id:client.id,
    phone,
    contact_name:null,
    source:'history_sync',
    first_message_at:firstAt,
    last_message_at:lastAt,
    last_message_text:contentText(last),
    last_message_id:last?.id||null
  });
  return rows?.[0]||null;
}

async function insertHistoryMessages(client, lead, threadId, messages){
  let count=0;
  for(const m of messages||[]){
    if(!m?.id) continue;
    const direction=String(m.from||'')===String(threadId) ? 'inbound' : 'outbound';
    const text=contentText(m);
    const at=ts(m.timestamp);
    const rows=await insert('messages',{
      client_id:client.id,
      lead_id:lead.id,
      message_id:m.id,
      direction,
      message_type:m.type||null,
      message_text:text,
      ...mediaMeta(m),
      received_at:at
    },{onConflict:'client_id,message_id',resolution:'ignore-duplicates'});
    if(rows?.length && /\balias\b/i.test(String(text||''))){
      await patch('leads',{id:`eq.${lead.id}`},{
        alias_detected_at:at,
        payment_check_status:'pending',
        payment_checked_at:null,
        updated_at:new Date().toISOString()
      });
    }
    if(rows?.length) count++;
  }
  return count;
}

export async function processHistoryWebhook(entry, value){
  const client=await findClientByWebhook({
    wabaId:entry?.id||null,
    phoneNumberId:value?.metadata?.phone_number_id||null
  });
  if(!client) throw new Error('No se pudo identificar el cliente del history webhook');

  let inserted=0, threads=0, maxProgress=null, phase=null, syncError=null;

  for(const chunk of value?.history||[]){
    if(chunk?.errors?.length){
      syncError=chunk.errors.map(e=>e.message||e.title||String(e.code)).join(' | ');
      continue;
    }
    const meta=chunk?.metadata||{};
    if(meta.progress!=null) maxProgress=Math.max(maxProgress??0,Number(meta.progress)||0);
    if(meta.phase!=null) phase=Number(meta.phase);

    for(const thread of chunk?.threads||[]){
      const phone=thread?.id;
      if(!phone) continue;
      const lead=await ensureHistoryLead(client,phone,thread.messages||[]);
      if(!lead) continue;
      threads++;
      inserted+=await insertHistoryMessages(client,lead,phone,thread.messages||[]);
    }
  }

  const status=syncError?'error':(maxProgress===100&&phase===2?'completed':'syncing');
  const update={
    history_sync_status:status,
    history_sync_progress:maxProgress,
    history_sync_phase:phase,
    history_sync_error:syncError,
    updated_at:new Date().toISOString()
  };
  if(status==='completed') update.history_sync_completed_at=new Date().toISOString();
  await patch('clients',{id:`eq.${client.id}`},update);

  return {client_id:client.id,threads,messages:inserted,progress:maxProgress,phase,status,error:syncError};
}

export async function processMessageEchoes(entry, value){
  const client=await findClientByWebhook({
    wabaId:entry?.id||null,
    phoneNumberId:value?.metadata?.phone_number_id||null
  });
  if(!client) throw new Error('No se pudo identificar el cliente del echo webhook');

  let inserted=0;
  for(const m of value?.message_echoes||[]){
    const phone=m?.to||null;
    if(!phone||!m?.id) continue;
    let lead=await latestLead(phone,client.id);
    const at=ts(m.timestamp);
    if(!lead){
      const rows=await insert('leads',{
        client_id:client.id,phone,source:'business_outbound',
        first_message_at:at,last_message_at:at,last_message_text:contentText(m),last_message_id:m.id
      });
      lead=rows?.[0]||null;
    }else{
      await patch('leads',{id:`eq.${lead.id}`},{
        last_message_at:at,last_message_text:contentText(m),last_message_id:m.id,updated_at:new Date().toISOString()
      });
    }
    if(!lead) continue;
    const text=contentText(m);
    const rows=await insert('messages',{
      client_id:client.id,lead_id:lead.id,message_id:m.id,direction:'outbound',
      message_type:m.type||null,message_text:text,...mediaMeta(m),received_at:at
    },{onConflict:'client_id,message_id',resolution:'ignore-duplicates'});
    if(rows?.length && /\balias\b/i.test(String(text||''))){
      await patch('leads',{id:`eq.${lead.id}`},{
        alias_detected_at:at,
        payment_check_status:'pending',
        payment_checked_at:null,
        updated_at:new Date().toISOString()
      });
    }
    if(rows?.length) inserted++;
  }
  return {client_id:client.id,messages:inserted};
}

export async function processStateSync(entry,value){
  const client=await findClientByWebhook({
    wabaId:entry?.id||null,
    phoneNumberId:value?.metadata?.phone_number_id||null
  });
  if(!client) throw new Error('No se pudo identificar el cliente del state sync webhook');

  let updated=0;
  for(const item of value?.state_sync||[]){
    if(item?.type!=='contact') continue;
    const phone=item?.contact?.phone_number;
    const name=item?.contact?.full_name||item?.contact?.first_name||null;
    if(!phone||!name) continue;
    const lead=await latestLead(phone,client.id);
    if(!lead||lead.contact_name) continue;
    const rows=await patch('leads',{id:`eq.${lead.id}`},{contact_name:name,updated_at:new Date().toISOString()});
    if(rows?.length) updated++;
  }
  return {client_id:client.id,updated};
}
