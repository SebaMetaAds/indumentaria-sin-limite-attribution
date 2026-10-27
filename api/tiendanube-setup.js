import { sendJson, requireAdmin } from '../lib/http.js';
export default function handler(req,res){
  if(!requireAdmin(req,res))return;
  if(req.method!=='GET')return sendJson(res,405,{error:'Método no permitido'});
  const id=process.env.TIENDANUBE_APP_ID;
  const secret=process.env.TIENDANUBE_CLIENT_SECRET;
  const encryption=process.env.CLIENT_SECRET_MASTER_KEY;
  const checks={app_id_configured:id==='48985',client_secret_configured:Boolean(secret),encryption_key_configured:Boolean(encryption)};
  return sendJson(res,200,{ready:Object.values(checks).every(Boolean),checks,callback_path:'/api/tiendanube-callback',message:Object.values(checks).every(Boolean)?'Credenciales disponibles; falta activar OAuth y almacenamiento seguro.':'Revisá las variables de entorno para Preview en Vercel.'});
}
