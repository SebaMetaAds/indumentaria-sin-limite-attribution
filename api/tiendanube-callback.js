import crypto from 'node:crypto';
import { saveTnConnection } from '../lib/tiendanube-connections.js';
function page(res,ok,msg){res.status(ok?200:400).setHeader('Content-Type','text/html; charset=utf-8');res.end('<!doctype html><html lang="es"><meta charset="utf-8"><title>Conexión Tiendanube</title><body style="font:16px system-ui;padding:40px;max-width:650px;margin:auto"><h2>'+(ok?'Tienda conectada':'No se pudo conectar')+'</h2><p>'+msg+'</p><p>Volvé a la pestaña del panel de agencia y actualizá Tiendanube.</p></body></html>')}
export default async function handler(req,res){
 res.setHeader('Set-Cookie','tn_oauth_nonce=; Path=/api/tiendanube-callback; HttpOnly; Secure; SameSite=Lax; Max-Age=0');
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