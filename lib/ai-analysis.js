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

export async function analyzeConversation({ lead, messages }) {
  const usable = (messages || [])
    .filter(m => m.message_text)
    .slice(-120)
    .map(m => {
      const who = m.direction === 'outbound' ? 'NEGOCIO' : 'CLIENTE';
      return `${who}: ${cleanText(m.message_text, 800)}`;
    });

  if (!usable.length) throw new Error('No hay texto suficiente para analizar');

  const transcript = usable.join('\n').slice(-30000);
  const context = [
    lead?.meta_campaign_name ? `Campaña: ${cleanText(lead.meta_campaign_name)}` : '',
    lead?.meta_ad_name ? `Anuncio: ${cleanText(lead.meta_ad_name)}` : '',
    lead?.referral_headline ? `Referencia: ${cleanText(lead.referral_headline)}` : '',
    lead?.status ? `Estado actual: ${cleanText(lead.status)}` : ''
  ].filter(Boolean).join('\n');

  const { text } = await generateText({
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
