import { sendJson, requireAdmin, readJsonBody } from '../lib/http.js';
import { findClientById } from '../lib/clients.js';
import { patch } from '../lib/supabase.js';
import { getWhatsAppCoexistenceStatus, requestWhatsAppHistorySync } from '../lib/meta.js';

export default async function handler(req,res){
  if(!requireAdmin(req,res)) return;
  if(req.method!=='POST') return sendJson(res,405,{error:'Método no permitido'});

  try{
    const body=readJsonBody(req);
    const client=await findClientById(body?.client_id);
    if(!client) return sendJson(res,404,{error:'Cliente no encontrado'});

    const status=await getWhatsAppCoexistenceStatus(client);
    if(status?.is_on_biz_app !== true){
      return sendJson(res,400,{
        error:'El número no figura en modo coexistencia de WhatsApp Business App',
        coexistence:status
      });
    }

    const result=await requestWhatsAppHistorySync(client);
    await patch('clients',{id:`eq.${client.id}`},{
      history_sync_status:'requested',
      history_sync_request_id:result?.request_id||null,
      history_sync_requested_at:new Date().toISOString(),
      history_sync_progress:0,
      history_sync_phase:0,
      history_sync_error:null,
      updated_at:new Date().toISOString()
    });

    return sendJson(res,200,{
      ok:true,
      request_id:result?.request_id||null,
      coexistence:{
        is_on_biz_app:status?.is_on_biz_app,
        platform_type:status?.platform_type
      }
    });
  }catch(error){
    console.error('history-sync',error);
    return sendJson(res,500,{error:error.message});
  }
}
