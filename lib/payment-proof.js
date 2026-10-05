import { detectPaymentSignal } from './payment-signals.js';

function norm(v){return String(v||'').normalize('NFD').replace(/[\u0300-\u036f]/g,'').toLowerCase();}
export function detectPaymentProof({message_type,media_filename,message_text,lead}){
  if(!['image','document'].includes(message_type)) return null;
  const name=norm(media_filename), text=norm(message_text);
  const strong=['comprobante','ticket','recibo','transferencia','pago'].find(x=>name.includes(x));
  if(strong) return {reason:'Archivo compatible con comprobante'};
  if(detectPaymentSignal(message_text)) return {reason:'El mensaje adjunto contiene una señal de pago'};
  if(lead?.payment_check_status==='pending' && lead?.payment_signal_detected_at){
    const age=Math.abs(Date.now()-new Date(lead.payment_signal_detected_at).getTime());
    if(age<=24*3600*1000) return {reason:'Archivo enviado cerca de una conversación de pago'};
  }
  return null;
}
