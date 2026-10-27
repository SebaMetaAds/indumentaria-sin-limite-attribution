import crypto from 'node:crypto';
import { requireAdmin,readJsonBody } from '../lib/http.js';

import {saveTnConnection} from '../lib/tiendanube-connections.js';
import {loadTnConnections,decryptTn} from '../lib/tiendanube-connections.js';
import { sendJson } from '../lib/http.js';
import { select } from '../lib/supabase.js';
import { listClients } from '../lib/clients.js';
import { getWhatsAppCoexistenceStatus } from '../lib/meta.js';

function page(res,ok,msg){res.status(ok?200:400).setHeader('Content-Type','text/html; charset=utf-8');res.end('<!doctype html><html lang="es"><meta charset="utf-8"><title>Conexión Tiendanube</title><body style="font:16px system-ui;padding:40px;max-width:650px;margin:auto"><h2>'+(ok?'Tienda conectada':'No se pudo conectar')+'</h2><p>'+msg+'</p><p>Volvé a la pestaña del panel de agencia y actualizá Tiendanube.</p></body></html>')}
const num=v=>Number(v)||0;
function config(){
  let stores=[];
  try{stores=JSON.parse(process.env.TIENDANUBE_STORES_JSON||'[]')}catch{throw new Error('TIENDANUBE_STORES_JSON debe ser un JSON válido')}
  if(!Array.isArray(stores))throw new Error('TIENDANUBE_STORES_JSON debe ser una lista');
  return stores.filter(x=>x&&/^[a-z0-9-]{3,80}$/i.test(String(x.client_id||''))&&/^\d+$/.test(String(x.store_id||''))&&typeof x.access_token==='string'&&x.access_token.length>8);
}
async function requestOrders(store,days){
  const now=new Date();
  const start=new Date(now.getTime()-(days-1)*86400000);
  const orders=[];
  const maxPages=20,perPage=200;
  for(let page=1;page<=maxPages;page++){
    const url=new URL('https://api.tiendanube.com/v1/'+store.store_id+'/orders');
    url.searchParams.set('per_page',String(perPage));
    url.searchParams.set('page',String(page));
    url.searchParams.set('created_at_min',start.toISOString());
    url.searchParams.set('created_at_max',now.toISOString());
    const response=await fetch(url,{headers:{Authorization:'Bearer '+store.access_token,'User-Agent':'Agencia Analytics (contacto@agencia.local)','Accept':'application/json'},signal:AbortSignal.timeout(12000)});
    if(!response.ok)throw new Error('Tiendanube respondió HTTP '+response.status);
    const batch=await response.json();
    if(!Array.isArray(batch))throw new Error('Respuesta de pedidos inválida');
    orders.push(...batch);
    if(batch.length<perPage)break;
    if(page===maxPages)throw new Error('Demasiados pedidos para este período; seleccioná menos días');
  }
  return orders;
}
function summarize(orders){
  const active=orders.filter(o=>o.status!=='cancelled'),paid=active.filter(o=>o.payment_status==='paid');
  const pending=active.filter(o=>['pending','authorized'].includes(o.payment_status));
  const paidTotal=paid.reduce((sum,o)=>sum+num(o.total),0);
  return {orders:orders.length,active_orders:active.length,cancelled_orders:orders.length-active.length,paid_orders:paid.length,pending_orders:pending.length,paid_revenue:paidTotal,average_paid_ticket:paid.length?paidTotal/paid.length:0,currency:paid[0]?.currency||active[0]?.currency||'ARS',is_partial:false};
}

async function handleTiendaNube(req,res){
  if(req.method==='GET'&&String(req.query?.callback||'')==='1'){
 res.setHeader('Set-Cookie','tn_oauth_nonce=; Path=/api/health; HttpOnly; Secure; SameSite=Lax; Max-Age=0');
 try{
 const code=String(req.query?.code||''),state=String(req.query?.state||'');
 const [payload,sig,...extra]=state.split('.');
 if(!code||code.length>1024||!payload||!sig||extra.length)throw Error('Autorización incompleta');
 const master=process.env.CLIENT_SECRET_MASTER_KEY,appId=process.env.TIENDANUBE_APP_ID,secret=process.env.TIENDANUBE_CLIENT_SECRET;
 if(!master||!appId||!secret)throw Error('Faltan variables de configuración');
 const signature=crypto.createHmac('sha256',master).update(payload).digest('base64url');
 if(signature.length!==sig.length||!crypto.timingSafeEqual(Buffer.from(signature),Buffer.from(sig)))throw Error('Estado de autorización inválido');
 const data=JSON.parse(Buffer.from(payload,'base64url').toString('utf8'));
 const cookie=String(req.headers.cookie||'').split(';').map(x=>x.trim()).find(x=>x.startsWith('tn_oauth_nonce='))?.split('=')[1];
 if(!cookie||cookie!==data.nonce||Date.now()>data.expires||!/^[a-f\d-]{36}$/i.test(data.client_id))throw Error('La autorización venció o no coincide con la sesión');
 const result=await fetch('https://www.tiendanube.com/apps/authorize/token',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({client_id:appId,client_secret:secret,grant_type:'authorization_code',code}),signal:AbortSignal.timeout(12000)});
 if(!result.ok)throw Error('Tiendanube rechazó la autorización ('+result.status+')');
 const token=await result.json();const store=String(token.user_id||token.store_id||'');
 if(!/^\d+$/.test(store)||!token.access_token)throw Error('Respuesta de Tiendanube incompleta');
 await saveTnConnection({clientId:data.client_id,storeId:store,scope:token.scope,token:token.access_token});
 return page(res,true,'La tienda '+store+' quedó vinculada al cliente seleccionado.');
 }catch(e){return page(res,false,'Verificá la instalación y volvé a intentar. '+String(e.message||''))}
  }
  if(!requireAdmin(req,res))return;
  if(req.method==='POST'){
 const appId=process.env.TIENDANUBE_APP_ID,master=process.env.CLIENT_SECRET_MASTER_KEY;
 if(!/^\d+$/.test(appId||'')||!process.env.TIENDANUBE_CLIENT_SECRET||!master)return sendJson(res,503,{error:'Credenciales de Tiendanube no disponibles en este entorno'});
 const clientId=String(readJsonBody(req).client_id||'');
 if(!/^[a-f\d-]{36}$/i.test(clientId))return sendJson(res,400,{error:'Elegí un cliente'});
 const clients=await select('clients','select=id&id=eq.'+encodeURIComponent(clientId)+'&limit=1');
 if(!clients?.length)return sendJson(res,404,{error:'El cliente no existe'});
 const nonce=crypto.randomBytes(24).toString('base64url'),payload=Buffer.from(JSON.stringify({client_id:clientId,nonce,expires:Date.now()+300000})).toString('base64url');
 const sign=crypto.createHmac('sha256',master).update(payload).digest('base64url');
 res.setHeader('Set-Cookie','tn_oauth_nonce='+nonce+'; Path=/api/health; HttpOnly; Secure; SameSite=Lax; Max-Age=300');
 return sendJson(res,200,{url:'https://www.tiendanube.com/apps/'+appId+'/authorize?state='+encodeURIComponent(payload+'.'+sign)});
  }
  if(req.method!=='GET')return sendJson(res,405,{error:'Método no permitido'});
  try{
    const days=Math.max(1,Math.min(30,Number(req.query?.days)||7));
    const clientId=String(req.query?.client_id||'all');
    const dbStores=await loadTnConnections(clientId);
    const stores=dbStores.length?dbStores.map(s=>({client_id:s.client_id,store_id:s.store_id,name:'Tienda '+s.store_id,access_token:decryptTn(s.access_token_enc)})):config().filter(s=>clientId==='all'||s.client_id===clientId);
    const selected=stores.slice(0,12);
    const results=await Promise.all(selected.map(async s=>{
      try{const orders=await requestOrders(s,days);return {client_id:s.client_id,store_id:String(s.store_id),name:String(s.name||'Tiendanube'),status:'connected',...summarize(orders)}}
      catch(e){return {client_id:s.client_id,store_id:String(s.store_id),name:String(s.name||'Tiendanube'),status:'error',error:String(e.message||'Error consultando tienda')}}
    }));
    return sendJson(res,200,{configured:stores.length>0,days,stores:results});
  }catch(e){return sendJson(res,500,{error:e.message||'Error al consultar Tiendanube'})}
}

export default async function handler(req, res) {
  if(req.query?.tn==='1'||req.query?.callback==='1')return handleTiendaNube(req,res);
  if (req.method !== 'GET') return sendJson(res, 405, { ok: false });
  try {
    const [clients, leads, sales, messages, clientRows] = await Promise.all([
      select('clients', 'select=id&limit=2'),
      select('leads', 'select=id,client_id&limit=1'),
      select('sales', 'select=id,client_id&limit=1'),
      select('messages', 'select=id,client_id,lead_id&limit=1'),
      listClients({ activeOnly: true })
    ]);
    let whatsapp_platform = null;
    const primary = clientRows?.find(c => c.slug === 'indumentaria-sin-limite') || clientRows?.[0];
    if (primary?.phone_number_id) {
      try {
        const s = await getWhatsAppCoexistenceStatus(primary);
        whatsapp_platform = {
          is_on_biz_app: s?.is_on_biz_app ?? null,
          platform_type: s?.platform_type ?? null
        };
      } catch (e) {
        whatsapp_platform = { error: e.message };
      }
    }
    return sendJson(res, 200, {
      ok: true,
      database: true,
      multi_client: true,
      clients_access: Array.isArray(clients),
      clients_count_sample: Array.isArray(clients) ? clients.length : 0,
      leads_access: Array.isArray(leads),
      sales_access: Array.isArray(sales),
      messages_access: Array.isArray(messages),
      whatsapp_platform
    });
  } catch (error) {
    console.error('health', error);
    return sendJson(res, 500, { ok: false, database: false, multi_client: false });
  }
}
