import { sendJson, requireAdmin } from '../lib/http.js';
import { insert, patch, select } from '../lib/supabase.js';
import { agencyWhatsAppConfigured, sendRenewalReminder } from '../lib/agency-whatsapp.js';

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

    return sendJson(res,200,{ok:true,date:today,sender_configured:configured,results});
  }catch(error){
    console.error('service-reminders',error);
    return sendJson(res,500,{error:error.message});
  }
}
