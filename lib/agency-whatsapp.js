function graphVersion(){ return process.env.META_GRAPH_VERSION || 'v25.0'; }

export function agencyWhatsAppConfigured(){
  return Boolean(
    process.env.AGENCY_WA_PHONE_NUMBER_ID &&
    process.env.AGENCY_WA_ACCESS_TOKEN &&
    process.env.AGENCY_RENEWAL_TEMPLATE_NAME
  );
}

export async function sendRenewalReminder({to, clientName, renewalDate}){
  if(!agencyWhatsAppConfigured()) return {skipped:true,reason:'WhatsApp de agencia no configurado'};

  const phoneId=process.env.AGENCY_WA_PHONE_NUMBER_ID;
  const token=process.env.AGENCY_WA_ACCESS_TOKEN;
  const templateName=process.env.AGENCY_RENEWAL_TEMPLATE_NAME;
  const language=process.env.AGENCY_RENEWAL_TEMPLATE_LANGUAGE || 'es_AR';

  const res=await fetch(`https://graph.facebook.com/${graphVersion()}/${phoneId}/messages`,{
    method:'POST',
    headers:{Authorization:`Bearer ${token}`,'Content-Type':'application/json'},
    body:JSON.stringify({
      messaging_product:'whatsapp',
      to:String(to).replace(/\D/g,''),
      type:'template',
      template:{
        name:templateName,
        language:{code:language},
        components:[{
          type:'body',
          parameters:[
            {type:'text',text:clientName||'Cliente'},
            {type:'text',text:renewalDate}
          ]
        }]
      }
    })
  });
  const data=await res.json().catch(()=>({}));
  if(!res.ok) throw new Error(`WhatsApp reminder ${res.status}: ${JSON.stringify(data)}`);
  return data;
}
