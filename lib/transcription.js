import { experimental_transcribe as transcribe } from 'ai';
import { gateway } from '@ai-sdk/gateway';
import { fetchWhatsAppMedia } from './meta.js';

const MODEL=process.env.AI_TRANSCRIPTION_MODEL||'fish-audio/transcribe-1';
export async function transcribeWhatsAppAudio(message,client){
  if(!message?.media_id) throw new Error('El audio no tiene media_id');
  const media=await fetchWhatsAppMedia(message.media_id,client);
  const result=await transcribe({model:gateway.transcriptionModel(MODEL),audio:media.buffer});
  return {text:String(result.text||'').trim(),model:MODEL};
}
