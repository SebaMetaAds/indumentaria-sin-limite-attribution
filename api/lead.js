import { sendJson, readJsonBody, requireAdmin } from '../lib/http.js';
import { patch, select } from '../lib/supabase.js';

function enc(v){ return encodeURIComponent(v); }
const STAGES=new Set(['new','contacted','quoted','follow_up','won','lost']);

export default async function handler(req,res){
  if(!requireAdmin(req,res)) return;
  if(req.method!=='PATCH') return sendJson(res,405,{error:'Método no permitido'});

  try{
    const body=readJsonBody(req);
    const id=body.id || body.lead_id;
    if(!id) return sendJson(res,400,{error:'lead id requerido'});

    const rows=await select('leads',`select=*&id=eq.${enc(id)}&limit=1`);
    const lead=rows?.[0];
    if(!lead) return sendJson(res,404,{error:'Conversación no encontrada'});

    const payload={updated_at:new Date().toISOString()};
    if(Object.prototype.hasOwnProperty.call(body,'pipeline_stage')){
      if(!STAGES.has(body.pipeline_stage)) return sendJson(res,400,{error:'Etapa inválida'});
      payload.pipeline_stage=body.pipeline_stage;
      payload.pipeline_updated_at=new Date().toISOString();
      payload.status=body.pipeline_stage==='won' ? 'won' : body.pipeline_stage==='lost' ? 'lost' : 'open';
      if(body.pipeline_stage==='won' || body.pipeline_stage==='lost') payload.follow_up_at=null;
      if(body.pipeline_stage!=='lost') payload.loss_reason=null;
    }
    if(Object.prototype.hasOwnProperty.call(body,'follow_up_at')){
      payload.follow_up_at=body.follow_up_at ? new Date(body.follow_up_at).toISOString() : null;
      if(payload.follow_up_at && !Object.prototype.hasOwnProperty.call(body,'pipeline_stage')){
        payload.pipeline_stage='follow_up';
        payload.pipeline_updated_at=new Date().toISOString();
        payload.status='open';
      }
    }
    if(Object.prototype.hasOwnProperty.call(body,'follow_up_note')) payload.follow_up_note=body.follow_up_note||null;
    if(Object.prototype.hasOwnProperty.call(body,'loss_reason')) payload.loss_reason=body.loss_reason||null;
    if(Object.prototype.hasOwnProperty.call(body,'assigned_to')) payload.assigned_to=body.assigned_to||null;

    const updated=await patch('leads',{id:`eq.${id}`},payload);
    return sendJson(res,200,{lead:updated?.[0]||lead});
  }catch(error){
    console.error('lead patch',error);
    return sendJson(res,400,{error:error.message});
  }
}
