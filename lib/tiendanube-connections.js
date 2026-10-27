import crypto from 'node:crypto';
import { insert, select } from './supabase.js';
const enc=encodeURIComponent;
function secretKey(){const s=process.env.CLIENT_SECRET_MASTER_KEY;if(!s)throw new Error('Falta clave de cifrado');return crypto.createHash('sha256').update(s).digest()}
export function encryptTn(token){const iv=crypto.randomBytes(12),c=crypto.createCipheriv('aes-256-gcm',secretKey(),iv),buf=Buffer.concat([c.update(token,'utf8'),c.final()]);return [iv,c.getAuthTag(),buf].map(x=>x.toString('base64url')).join('.')}
export function decryptTn(encoded){const [iv,tag,buf]=String(encoded).split('.').map(x=>Buffer.from(x,'base64url')),c=crypto.createDecipheriv('aes-256-gcm',secretKey(),iv);c.setAuthTag(tag);return Buffer.concat([c.update(buf),c.final()]).toString('utf8')}
export async function saveTnConnection({clientId,storeId,scope,token}){return insert('tiendanube_connections',{client_id:clientId,store_id:String(storeId),app_id:String(process.env.TIENDANUBE_APP_ID),scope:scope||'',access_token_enc:encryptTn(token),updated_at:new Date().toISOString()},{onConflict:'client_id',resolution:'merge-duplicates'})}
export async function loadTnConnections(clientId){const filter=clientId==='all'?'':'&client_id=eq.'+enc(clientId);return select('tiendanube_connections','select=client_id,store_id,scope,access_token_enc,connected_at'+filter+'&limit=100')}
