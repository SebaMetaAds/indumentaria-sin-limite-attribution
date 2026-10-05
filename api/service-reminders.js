import { sendJson, requireAdmin } from '../lib/http.js';
import { insert, patch, select } from '../lib/supabase.js';
import { agencyWhatsAppConfigured, sendRenewalReminder } from '../lib/agency-whatsapp.js';
import { analyzeConversation } from '../lib/ai-analysis.js';
import { transcribeWhatsAppAudio } from '../lib/transcription.js';
import { findClientById } from '../lib/clients.js';
import { detectPaymentSignal } from '../lib/payment-signals.js';

function enc(v){return encodeURIComponent(v);}

function localDate(){
  const parts=new Intl.DateTimeFormat('en-CA',{
    timeZone:'America/Argentina/Buenos_Aires',
    year:'numeric',month:'2-digit',day:'2-digit'
  }).formatToParts(new Date());
  const map=Object.fromEntries(parts.map(p=>[p.type,p.value]));
  return `${map.year}-${map.month}-${map.day}`;
}

function diffDays(from,to){
  const a=new Date(from+'T12:00:00Z');
  const b=new Date(to+'T12:00:00Z');
  return Math.round((b-a)/86400000);
}

function authorized(req){
  const cron=process.env.CRON_SECRET;
  if(cron && req.headers.authorization===`Bearer ${cron}`) return true;
  return false;
}

export default async function handler(req,res){
  if(req.method!=='GET' && req.method!=='POST') return sendJson(res,405,{error:'Método no permitido'});

  const cronAuth=authorized(req);
  if(!cronAuth && !requireAdmin(req,res)) return;

  try{
    const today=localDate();
    const clients=await select('clients','select=*&status=eq.active&service_status=eq.active&reminder_enabled=eq.true&renewal_date=not.is.null');
    const configured=agencyWhatsAppConfigured();
    const results=[];

    for(const client of clients||[]){
      const days=diffDays(today,client.renewal_date);
      if(days!==Number(client.reminder_days_before??1)) continue;

      const phone=(client.billing_phone||client.whatsapp_number||'').replace(/\D/g,'');
      if(!phone){
        results.push({client_id:client.id,status:'skipped',reason:'Sin teléfono de cobro'});
        continue;
      }

      const existing=await select('client_service_reminders',
        `select=*&client_id=eq.${enc(client.id)}&renewal_date=eq.${enc(client.renewal_date)}&channel=eq.whatsapp&limit=1`);
      if(existing?.[0]?.status==='sent'){
        results.push({client_id:client.id,status:'already_sent'});
        continue;
      }

      if(!configured){
        results.push({client_id:client.id,status:'ready',reason:'Falta conectar WhatsApp de agencia'});
        continue;
      }

      try{
        const response=await sendRenewalReminder({
          to:phone,
          clientName:client.name,
          renewalDate:new Date(client.renewal_date+'T12:00:00').toLocaleDateString('es-AR')
        });
        await insert('client_service_reminders',{
          client_id:client.id,renewal_date:client.renewal_date,channel:'whatsapp',
          status:'sent',sent_at:new Date().toISOString(),error:null
        },{onConflict:'client_id,renewal_date,channel',resolution:'merge-duplicates'});
        await patch('clients',{id:`eq.${client.id}`},{
          reminder_last_sent_for:client.renewal_date,updated_at:new Date().toISOString()
        });
        results.push({client_id:client.id,status:'sent',response});
      }catch(error){
        await insert('client_service_reminders',{
          client_id:client.id,renewal_date:client.renewal_date,channel:'whatsapp',
          status:'error',error:error.message
        },{onConflict:'client_id,renewal_date,channel',resolution:'merge-duplicates'});
        results.push({client_id:client.id,status:'error',error:error.message});
      }
    }

    const audioCandidates=await select('messages',
      'select=*&message_type=eq.audio&media_id=not.is.null&transcript_status=eq.none&order=received_at.desc&limit=5');
    const transcriptionResults=[];
    for(const message of audioCandidates||[]){
      try{
        const client=await findClientById(message.client_id);
        if(!client) throw new Error('Cliente no encontrado');
        await patch('messages',{id:`eq.${message.id}`},{transcript_status:'pending',transcript_error:null});
        const transcript=await transcribeWhatsAppAudio(message,client);
        const now=new Date().toISOString();
        await patch('messages',{id:`eq.${message.id}`},{
          transcript_text:transcript.text,transcript_status:'done',transcript_model:transcript.model,transcript_at:now,transcript_error:null
        });
        const signal=detectPaymentSignal(transcript.text);
        if(signal){
          const leadRows=await select('leads',`select=*&id=eq.${enc(message.lead_id)}&limit=1`);
          const lead=leadRows?.[0];
          if(lead) await patch('leads',{id:`eq.${lead.id}`},{
            payment_signal_detected_at:message.received_at,payment_signal_type:signal.type,
            payment_signal_text:signal.text,payment_signal_message_id:message.message_id,
            payment_check_status:lead.payment_check_status==='paid'?'paid':'pending',
            payment_checked_at:lead.payment_check_status==='paid'?lead.payment_checked_at||null:null,
            updated_at:now
          });
        }
        transcriptionResults.push({message_id:message.id,status:'done'});
      }catch(error){
        const unavailable=/payment|billing|credit|card|quota/i.test(error.message);
        await patch('messages',{id:`eq.${message.id}`},{
          transcript_status:unavailable?'unavailable':'error',transcript_error:error.message,transcript_at:new Date().toISOString()
        }).catch(()=>{});
        transcriptionResults.push({message_id:message.id,status:unavailable?'unavailable':'error'});
      }
    }

    const cutoff=Date.now()-(14*86400000);
    const openLeads=await select('leads','select=*&status=eq.open&order=last_message_at.desc&limit=40');
    const aiCandidates=(openLeads||[])
      .filter(lead=>{
        const last=lead.last_message_at ? new Date(lead.last_message_at).getTime() : 0;
        const analyzed=lead.ai_analyzed_at ? new Date(lead.ai_analyzed_at).getTime() : 0;
        return last>=cutoff && (!analyzed || analyzed<last);
      })
      .slice(0,8);

    const aiResults=await Promise.all(aiCandidates.map(async lead=>{
      try{
        const messages=await select('messages',
          `select=direction,message_type,message_text,transcript_text,received_at&lead_id=eq.${enc(lead.id)}&order=received_at.asc&limit=300`);
        const textCount=(messages||[]).filter(m=>(m.message_text||m.transcript_text)&&String(m.message_text||m.transcript_text).trim()).length;
        if(textCount<3) return {lead_id:lead.id,status:'skipped',reason:'Poco texto'};

        const analysis=await analyzeConversation({lead,messages});
        const now=new Date().toISOString();
        await patch('leads',{id:`eq.${lead.id}`},{
          ai_summary:analysis.summary,
          ai_intent:analysis.intent,
          ai_score:analysis.score,
          ai_products:analysis.products,
          ai_objections:analysis.objections,
          ai_next_action:analysis.next_action,
          ai_sentiment:analysis.sentiment,
          ai_requires_attention:analysis.requires_attention,
          ai_analyzed_at:now,
          ai_model:analysis.model,
          ai_message_count:analysis.message_count,
          updated_at:now
        });
        return {lead_id:lead.id,status:'analyzed',score:analysis.score,intent:analysis.intent};
      }catch(error){
        console.error('daily ai analysis',{lead_id:lead.id,error:error.message});
        return {lead_id:lead.id,status:'error',error:error.message};
      }
    }));

    return sendJson(res,200,{
      ok:true,
      date:today,
      sender_configured:configured,
      results,
      transcription:{
        candidates:(audioCandidates||[]).length,
        completed:transcriptionResults.filter(x=>x.status==='done').length,
        results:transcriptionResults
      },
      ai_analysis:{
        candidates:aiCandidates.length,
        analyzed:aiResults.filter(x=>x.status==='analyzed').length,
        results:aiResults
      }
    });
  }catch(error){
    console.error('service-reminders',error);
    return sendJson(res,500,{error:error.message});
  }
}
