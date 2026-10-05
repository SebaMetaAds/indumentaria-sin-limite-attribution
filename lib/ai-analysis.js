import { generateText } from 'ai';

const MODEL = process.env.AI_ANALYSIS_MODEL || 'openai/gpt-6-luna';

function cleanText(value, max = 500) {
  return String(value || '').replace(/\s+/g, ' ').trim().slice(0, max);
}

function extractJson(text) {
  const raw = String(text || '').trim()
    .replace(/^\`\`\`json\s*/i, '')
    .replace(/^\`\`\`/, '')
    .replace(/\`\`\`$/, '')
    .trim();
  try { return JSON.parse(raw); } catch {}
  const start = raw.indexOf('{');
  const end = raw.lastIndexOf('}');
  if (start >= 0 && end > start) return JSON.parse(raw.slice(start, end + 1));
  throw new Error('La IA no devolvió JSON válido');
}

function list(value, max = 8) {
  if (!Array.isArray(value)) return [];
  return value.map(v => cleanText(v, 120)).filter(Boolean).slice(0, max);
}

function includesAny(text, terms) {
  return terms.some(term => text.includes(term));
}

function fallbackAnalysis({ lead, messages }) {
  const textMessages=(messages||[]).filter(m=>m.message_text||m.transcript_text).slice(-120);
  const customer=textMessages.filter(m=>m.direction!=='outbound');
  const customerText=customer.map(m=>cleanText(m.message_text||m.transcript_text,800)).join(' ').toLowerCase();
  const latestCustomer=customer.slice(-3).map(m=>cleanText(m.message_text||m.transcript_text,280)).filter(Boolean);
  const last=textMessages[textMessages.length-1];

  const purchaseTerms=['quiero','me llevo','comprar','lo compro','reservar','seña','pasame el alias','pásame el alias','como pago','cómo pago','donde pago','dónde pago'];
  const decisionTerms=['precio','cuanto sale','cuánto sale','talle','tamaño','stock','envio','envío','retiro','efectivo','transferencia','cuotas','pago al recibir','entrega'];
  const positiveTerms=['buenisimo','buenísimo','perfecto','genial','dale','me sirve','joya','gracias'];
  const negativeTerms=['caro','muy caro','no puedo','problema','demora','tarda','mal','reclamo','no me sirve','cancelar'];

  let score=10;
  if(includesAny(customerText,purchaseTerms)) score+=45;
  const matchedDecision=decisionTerms.filter(x=>customerText.includes(x)).length;
  score+=Math.min(35,matchedDecision*8);
  if(/[?¿]/.test(customerText)) score+=5;
  if(/\b(3[5-9]|4[0-9]|5[0-2])\b/.test(customerText)) score+=5;
  if(last?.direction!=='outbound') score+=5;
  score=Math.max(0,Math.min(100,score));

  const objections=[];
  if(includesAny(customerText,['caro','muy caro','precio alto','descuento','rebaja'])) objections.push('Precio');
  if(includesAny(customerText,['envio','envío','demora','tarda','entrega'])) objections.push('Envío / tiempos');
  if(includesAny(customerText,['no hay','sin stock','stock','talle','tamaño'])) objections.push('Stock / talle');
  if(includesAny(customerText,['no puedo pagar','cuotas','transferencia','efectivo','pago al recibir'])) objections.push('Forma de pago');

  const products=[];
  if(lead?.meta_ad_name) products.push(cleanText(lead.meta_ad_name,120));
  else if(lead?.referral_headline) products.push(cleanText(lead.referral_headline,120));

  const sentiment=includesAny(customerText,negativeTerms)?'negative':includesAny(customerText,positiveTerms)?'positive':'neutral';
  const intent=score>=70?'high':score>=40?'medium':'low';
  let nextAction='Hacer seguimiento comercial y buscar una pregunta concreta que acerque al cierre.';
  if(includesAny(customerText,['caro','muy caro','descuento','rebaja'])) nextAction='Resolver la objeción de precio con valor, beneficio u opción concreta y cerrar con una pregunta.';
  else if(includesAny(customerText,['talle','tamaño','stock'])) nextAction='Confirmar stock/talle exacto y cerrar con una propuesta concreta de compra.';
  else if(includesAny(customerText,['envio','envío','entrega','retiro'])) nextAction='Confirmar modalidad y plazo de entrega, y pedir confirmación para avanzar con la compra.';
  else if(includesAny(customerText,['pago','transferencia','efectivo','cuotas','alias'])) nextAction='Responder la forma de pago y dar el paso exacto para finalizar la compra.';
  else if(last?.direction!=='outbound') nextAction='Responder cuanto antes: el cliente dejó el último mensaje y está esperando al negocio.';
  else if(score>=70) nextAction='Retomar el chat con una pregunta de cierre directa y facilitar el siguiente paso de compra.';

  const summary=latestCustomer.length
    ? 'El cliente comentó: '+latestCustomer.join(' · ')
    : 'Conversación comercial sin suficiente detalle textual para resumir.';

  return {
    summary:cleanText(summary,1200),
    intent,
    score,
    products:[...new Set(products)].slice(0,8),
    objections:[...new Set(objections)].slice(0,8),
    next_action:nextAction,
    sentiment,
    requires_attention:Boolean(score>=40 && lead?.status!=='won' && lead?.pipeline_stage!=='won'),
    model:'local-rules-v1',
    message_count:textMessages.length
  };
}

export async function analyzeConversation({ lead, messages }) {
  const usable = (messages || [])
    .filter(m => m.message_text || m.transcript_text)
    .slice(-120)
    .map(m => {
      const who = m.direction === 'outbound' ? 'NEGOCIO' : 'CLIENTE';
      const content = m.message_text || (m.transcript_text ? '[AUDIO TRANSCRIPTO] ' + m.transcript_text : '');
      return `${who}: ${cleanText(content, 800)}`;
    });

  if (!usable.length) throw new Error('No hay texto suficiente para analizar');

  const transcript = usable.join('\n').slice(-30000);
  const context = [
    lead?.meta_campaign_name ? `Campaña: ${cleanText(lead.meta_campaign_name)}` : '',
    lead?.meta_ad_name ? `Anuncio: ${cleanText(lead.meta_ad_name)}` : '',
    lead?.referral_headline ? `Referencia: ${cleanText(lead.referral_headline)}` : '',
    lead?.status ? `Estado actual: ${cleanText(lead.status)}` : ''
  ].filter(Boolean).join('\n');

  let text;
  try {
    const result = await generateText({
      model: MODEL,
      system: `Sos un analista comercial de una agencia de performance marketing.
Analizá conversaciones de WhatsApp entre un negocio y un potencial comprador.
No inventes información. Usá únicamente lo que aparece en la conversación.
Tu objetivo es detectar intención de compra, productos, objeciones y la mejor próxima acción comercial.
Respondé EXCLUSIVAMENTE un objeto JSON válido, sin markdown ni texto adicional.`,
      prompt: `CONTEXTO
${context || 'Sin contexto adicional'}

CONVERSACIÓN
${transcript}

Devolvé exactamente estas claves:
{
  "summary": "resumen comercial breve en español, máximo 3 oraciones",
  "intent": "low|medium|high",
  "score": 0,
  "products": ["productos o servicios consultados"],
  "objections": ["objeciones o frenos reales detectados"],
  "next_action": "acción concreta recomendada para cerrar o avanzar",
  "sentiment": "positive|neutral|negative",
  "requires_attention": true
}

Criterio score:
0-30 curiosidad/baja intención;
31-69 interés real pero faltan señales;
70-100 intención alta, pedido concreto, precio/envío/pago/talle/stock o decisión cercana.
requires_attention=true cuando hay intención media/alta sin cierre, objeción sin resolver, cliente esperando respuesta o una oportunidad clara de seguimiento.`,
      maxOutputTokens: 900,
      reasoning: 'minimal'
    });
    text=result.text;
  } catch (error) {
    console.warn('AI Gateway unavailable, using local commercial analysis:', error.message);
    return fallbackAnalysis({lead,messages});
  }

  const parsed = extractJson(text);
  const intent = ['low','medium','high'].includes(parsed.intent) ? parsed.intent : 'medium';
  const sentiment = ['positive','neutral','negative'].includes(parsed.sentiment) ? parsed.sentiment : 'neutral';
  const score = Math.max(0, Math.min(100, Number(parsed.score) || 0));

  return {
    summary: cleanText(parsed.summary, 1200) || 'Sin resumen disponible',
    intent,
    score,
    products: list(parsed.products),
    objections: list(parsed.objections),
    next_action: cleanText(parsed.next_action, 800) || 'Revisar conversación y definir próximo contacto.',
    sentiment,
    requires_attention: Boolean(parsed.requires_attention),
    model: MODEL,
    message_count: usable.length
  };
}
