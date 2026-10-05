import { sendJson, readJsonBody, requireAdmin } from '../lib/http.js';
import { insert, patch, select } from '../lib/supabase.js';
import { findClientById } from '../lib/clients.js';

function enc(v){ return encodeURIComponent(v); }

function isoDate(value){
  if(!value) return null;
  const d=new Date(String(value).length===10 ? value+'T12:00:00Z' : value);
  if(Number.isNaN(d.getTime())) return null;
  return d.toISOString().slice(0,10);
}

function addMonths(dateStr, months){
  const src=new Date(dateStr+'T12:00:00Z');
  const day=src.getUTCDate();
  const target=new Date(Date.UTC(src.getUTCFullYear(), src.getUTCMonth()+Number(months||1), 1, 12));
  const lastDay=new Date(Date.UTC(target.getUTCFullYear(), target.getUTCMonth()+1, 0, 12)).getUTCDate();
  target.setUTCDate(Math.min(day,lastDay));
  return target.toISOString().slice(0,10);
}

export default async function handler(req,res){
  if(!requireAdmin(req,res)) return;

  try{
    if(req.method==='GET'){
      const mode=req.query?.mode||'payments';
      const clientId=req.query?.client_id;
      if(mode==='tasks'){
        let q='select=*&order=created_at.desc&limit=500';
        if(clientId) q += `&client_id=eq.${enc(clientId)}`;
        const rows=await select('agency_tasks',q);
        return sendJson(res,200,{tasks:rows||[]});
      }
      if(!clientId) return sendJson(res,400,{error:'client_id requerido'});
      const rows=await select('client_service_payments',
        `select=*&client_id=eq.${enc(clientId)}&order=paid_at.desc&limit=100`);
      return sendJson(res,200,{payments:rows||[]});
    }

    const body=readJsonBody(req);
    const clientId=body.client_id || body.clientId;

    if(req.method==='PATCH' && body.action==='task_update'){
      if(!body.task_id) return sendJson(res,400,{error:'task_id requerido'});
      const taskPayload={updated_at:new Date().toISOString()};
      for(const key of ['title','description','assigned_to','priority','status']){
        if(Object.prototype.hasOwnProperty.call(body,key)) taskPayload[key]=body[key]||null;
      }
      if(Object.prototype.hasOwnProperty.call(body,'client_id')) taskPayload.client_id=body.client_id||null;
      if(Object.prototype.hasOwnProperty.call(body,'due_at')){
        taskPayload.due_at=body.due_at ? new Date(body.due_at).toISOString() : null;
      }
      if(body.status==='done') taskPayload.completed_at=new Date().toISOString();
      if(body.status==='open') taskPayload.completed_at=null;
      const taskRows=await patch('agency_tasks',{id:`eq.${body.task_id}`},taskPayload);
      return sendJson(res,200,{task:taskRows?.[0]||null});
    }

    if(req.method==='POST' && body.action==='task_create'){
      if(!body.title?.trim()) return sendJson(res,400,{error:'Título requerido'});
      const taskRows=await insert('agency_tasks',{
        client_id:body.client_id||null,
        title:body.title.trim(),
        description:body.description||null,
        assigned_to:body.assigned_to||null,
        priority:body.priority||'normal',
        status:'open',
        due_at:body.due_at ? new Date(body.due_at).toISOString() : null
      });
      return sendJson(res,201,{task:taskRows?.[0]||null});
    }

    if(!clientId) return sendJson(res,400,{error:'client_id requerido'});
    const client=await findClientById(clientId);
    if(!client) return sendJson(res,404,{error:'Cliente no encontrado'});

    if(req.method==='PATCH'){
      const allowed=[
        'service_start_date','renewal_date','renewal_period_months','billing_phone',
        'service_fee','service_notes','service_status','reminder_enabled','reminder_days_before'
      ];
      const payload={updated_at:new Date().toISOString()};
      for(const key of allowed){
        if(Object.prototype.hasOwnProperty.call(body,key)){
          let value=body[key];
          if(value==='') value=null;
          if(key==='service_fee' && value!==null) value=Number(value);
          if(['renewal_period_months','reminder_days_before'].includes(key) && value!==null) value=Number(value);
          payload[key]=value;
        }
      }
      const rows=await patch('clients',{id:`eq.${clientId}`},payload);
      return sendJson(res,200,{client:rows?.[0]||client});
    }

    if(req.method==='POST'){
      const action=body.action||'payment';
      if(action!=='payment') return sendJson(res,400,{error:'Acción no soportada'});

      const paidAt=body.paid_at ? new Date(body.paid_at).toISOString() : new Date().toISOString();
      const paidDate=paidAt.slice(0,10);
      const months=Number(client.renewal_period_months||1);
      const currentRenewal=isoDate(client.renewal_date);
      const baseDate=currentRenewal && currentRenewal>=paidDate ? currentRenewal : paidDate;
      const nextRenewal=isoDate(body.next_renewal_date) || addMonths(baseDate,months);
      const rawAmount=body.amount==null||body.amount==='' ? client.service_fee : body.amount;
      const amount=rawAmount==null||rawAmount==='' ? null : Number(rawAmount);

      const paymentRows=await insert('client_service_payments',{
        client_id:clientId,
        paid_at:paidAt,
        amount:Number.isFinite(amount)?amount:null,
        currency:client.currency||'ARS',
        method:body.method||null,
        notes:body.notes||null,
        renewal_date_before:currentRenewal,
        renewal_date_after:nextRenewal
      });

      const clientRows=await patch('clients',{id:`eq.${clientId}`},{
        last_payment_at:paidAt,
        renewal_date:nextRenewal,
        service_status:'active',
        reminder_last_sent_for:null,
        updated_at:new Date().toISOString()
      });

      return sendJson(res,200,{
        payment:paymentRows?.[0]||null,
        client:clientRows?.[0]||client,
        next_renewal_date:nextRenewal
      });
    }

    return sendJson(res,405,{error:'Método no permitido'});
  }catch(error){
    console.error('service',error);
    return sendJson(res,400,{error:error.message});
  }
}
