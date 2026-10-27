import { sendJson, requireAdmin } from '../lib/http.js';
import {loadTnConnections,decryptTn} from '../lib/tiendanube-connections.js';
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
export default async function handler(req,res){
  if(!requireAdmin(req,res))return;
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
