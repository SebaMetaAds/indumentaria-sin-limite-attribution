(()=>{"use strict";
const crm=document.getElementById("leadsSection");if(!crm||document.getElementById("agencyPriorityPanel"))return;
const panel=document.createElement("section");panel.id="agencyPriorityPanel";panel.className="agency-priority-panel";panel.setAttribute("aria-label","Prioridades comerciales");
panel.innerHTML='<div class="agency-priority-heading"><div><strong>⚡ Prioridades comerciales</strong><p>Contactos que podrían necesitar seguimiento según la actividad registrada.</p></div><span id="agencyPriorityCount">—</span></div><div class="agency-priority-list" id="agencyPriorityList"><p>Cargando conversaciones…</p></div>';
const summary=document.getElementById("agencyCrmSummary");if(summary)summary.after(panel);else crm.querySelector(".section-head")?.after(panel);
const list=document.getElementById("agencyPriorityList"),count=document.getElementById("agencyPriorityCount");
function dateMs(v){const n=Date.parse(v||"");return Number.isFinite(n)?n:0}
function update(){const leads=window.__agencyCrmSnapshot;if(!Array.isArray(leads))return;const now=Date.now(),items=[];
for(const l of leads){const stage=l.pipeline_stage||l.status||"new";if(stage==="won"||stage==="lost"||l.status==="won"||l.status==="lost")continue;const last=dateMs(l.last_message_at||l.first_message_at||l.created_at);const due=dateMs(l.follow_up_at);let score=0,reason="";
if(due&&due<=now){score=100;reason="Seguimiento vencido"}
else if(Number(l.ai_score||0)>=70){score=80;reason="Oportunidad con IA alta"}
else if(last&&now-last>48*3600000){score=60;reason="Sin actividad hace más de 48 h"}
if(score)items.push({l,score,reason,last});}
items.sort((a,b)=>b.score-a.score||a.last-b.last);count.textContent=items.length+" para revisar";list.replaceChildren();
if(!items.length){const p=document.createElement("p");p.className="agency-priority-empty";p.textContent="No se encontraron prioridades con las reglas actuales.";list.appendChild(p);return}
for(const item of items.slice(0,6)){const row=document.createElement("div");row.className="agency-priority-row";const details=document.createElement("div");const name=document.createElement("strong");name.textContent=item.l.contact_name||item.l.phone||"Contacto";const meta=document.createElement("small");meta.textContent=(item.l.client_name||"Cliente")+" · "+item.reason;details.append(name,meta);const action=document.createElement("button");action.type="button";action.textContent="Ver chat";action.onclick=()=>{if(typeof window.openChat==="function")window.openChat(item.l.id)};row.append(details,action);list.append(row)}
if(items.length>6){const p=document.createElement("p");p.className="agency-priority-more";p.textContent="Y "+(items.length-6)+" conversaciones adicionales. Usá los filtros del CRM para verlas.";list.append(p)}
}
window.addEventListener("agency:crm-data",update);update();
})();