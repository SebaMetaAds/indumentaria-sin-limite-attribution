import { detectPaymentSignal } from './payment-signals.js';

function norm(v){return String(v||'').normalize('NFD').replace(/[\u0300-\u036f]/g,'').toLowerCase();}
const COMPLETE_SIGNALS=new Set([
  'te_transferi','te_transfiero','ya_pague','comprobante','transferencia_realizada',
  'te_pague','ya_transferi','pago_realizado','abone','hice_transferencia',
  'transferencia_hecha','mande_comprobante','pago_hecho'
]);

export function detectPaymentProof({direction='inbound',message_type,media_filename,message_text,lead}){
  if(direction!=='inbound') return null;
  if(!['image','document'].includes(message_type)) return null;

  const name=norm(media_filename);
  const strong=['comprobante','ticket','recibo','transferencia','pago'].find(x=>name.includes(x));
  if(strong) return {reason:'Nombre de archivo compatible con comprobante',confidence:'high'};

  const signal=detectPaymentSignal(message_text);
  if(signal && COMPLETE_SIGNALS.has(signal.type)){
    return {reason:'El archivo llegó acompañado de una señal clara de pago',confidence:'high'};
  }

  if(lead?.payment_signal_detected_at){
    const age=Date.now()-new Date(lead.payment_signal_detected_at).getTime();
    if(age>=0 && age<=2*3600*1000 && COMPLETE_SIGNALS.has(lead.payment_signal_type)){
      return {reason:'Archivo recibido después de una confirmación de transferencia/pago',confidence:'high'};
    }
    if(age>=0 && age<=45*60*1000 && ['alias','sena'].includes(lead.payment_signal_type)){
      return {reason:'Archivo recibido poco después de compartir datos para el pago',confidence:'medium'};
    }
  }

  return null;
}
