import crypto from 'node:crypto';
import { sendJson,requireAdmin,readJsonBody } from '../lib/http.js';
import { select } from '../lib/supabase.js';
export default async function handler(req,res){
 if(!requireAdmin(req,res))return;
 if(req.method!=='POST')return sendJson(res,405,{error:'Método no permitido'});
 const appId=process.env.TIENDANUBE_APP_ID,master=process.env.CLIENT_SECRET_MASTER_KEY;
 if(!/^\d+$/.test(appId||'')||!process.env.TIENDANUBE_CLIENT_SECRET||!master)return sendJson(res,503,{error:'Credenciales de Tiendanube no disponibles en este entorno'});
 const clientId=String(readJsonBody(req).client_id||'');
 if(!/^[a-f\d-]{36}$/i.test(clientId))return sendJson(res,400,{error:'Elegí un cliente'});
 const clients=await select('clients','select=id&id=eq.'+encodeURIComponent(clientId)+'&limit=1');
 if(!clients?.length)return sendJson(res,404,{error:'El cliente no existe'});
 const nonce=crypto.randomBytes(24).toString('base64url'),payload=Buffer.from(JSON.stringify({client_id:clientId,nonce,expires:Date.now()+300000})).toString('base64url');
 const sign=crypto.createHmac('sha256',master).update(payload).digest('base64url');
 res.setHeader('Set-Cookie','tn_oauth_nonce='+nonce+'; Path=/api/tiendanube-callback; HttpOnly; Secure; SameSite=Lax; Max-Age=300');
 return sendJson(res,200,{url:'https://www.tiendanube.com/apps/'+appId+'/authorize?state='+encodeURIComponent(payload+'.'+sign)});
}