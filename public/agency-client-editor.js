(()=>{"use strict";
const root=document.querySelector(".wrap .top .controls");if(!root||document.getElementById("agencyEditClientBtn"))return;
const btn=document.createElement("button");btn.id="agencyEditClientBtn";btn.type="button";btn.textContent="✎ Editar ficha de cliente";root.append(btn);
const fields=[["name","Nombre del negocio","text"],["website_url","Sitio web","url"],["instagram_handle","Instagram","text"],["primary_contact_name","Contacto principal","text"],["billing_phone","Teléfono de contacto","text"],["whatsapp_number","WhatsApp","text"],["monthly_ad_budget","Presupuesto mensual de Meta Ads ($)","number"],["monthly_revenue_goal","Objetivo mensual de facturación ($)","number"],["contribution_margin_pct","Margen de contribución (%)","number"],["business_goal","Objetivos comerciales","textarea"],["internal_notes","Notas internas de la agencia","textarea"]];
btn.addEventListener("click",async()=>{
 const pwd=sessionStorage.getItem("agency_pwd");if(!pwd)return alert("Ingresá primero al panel");
 let panel=document.getElementById("agencyClientEditForm");panel?.remove();panel=document.createElement("section");panel.id="agencyClientEditForm";panel.className="agency-client-edit";
 const title=document.createElement("strong");title.textContent="Editar ficha del cliente";
 const selector=document.createElement("select");selector.setAttribute("aria-label","Cliente");
 const list=(window.__agencyFinanceData?.clients||[]);list.forEach(c=>{const op=document.createElement("option");op.value=c.id;op.textContent=c.name;selector.append(op)});
 if(!list.length)return alert("Actualizá el panel antes de editar clientes.");
 const form=document.createElement("div");form.className="agency-client-edit-grid";
 const inputs={};for(const [key,label,type] of fields){const block=document.createElement("label"),caption=document.createElement("span");caption.textContent=label;const input=type==="textarea"?document.createElement("textarea"):document.createElement("input");if(type!=="textarea")input.type=type;if(key==="contribution_margin_pct"){input.min="0.01";input.max="100";input.step="0.01";input.placeholder="Ej.: 30 (ROAS equilibrio 3,33x)"}if(type==="number"&&key!=="contribution_margin_pct"){input.min="0";input.step="0.01"}block.append(caption,input);form.append(block);inputs[key]=input}
 const note=document.createElement("p");note.className="agency-client-edit-note";note.textContent="Margen de contribución: porcentaje de ventas disponible para pagar publicidad después de costos variables (producto, logística, comisiones, impuestos variables, etc.). ROAS de equilibrio = 100 ÷ margen %. No uses margen de recargo.";
 const save=document.createElement("button");save.type="button";save.textContent="Guardar cambios";const cancel=document.createElement("button");cancel.type="button";cancel.textContent="Cerrar";cancel.onclick=()=>panel.remove();
 const status=document.createElement("small");status.setAttribute("role","status");
 function populate(){const c=list.find(x=>String(x.id)===selector.value)||{};for(const [key] of fields)inputs[key].value=c[key]??""}
 selector.addEventListener("change",populate);populate();
 save.onclick=async()=>{const id=selector.value;const payload={id};for(const [key,,type] of fields){const raw=inputs[key].value.trim();payload[key]=raw===""?null:type==="number"?Number(raw):raw}if(payload.contribution_margin_pct!==null&&(!(payload.contribution_margin_pct>0)||payload.contribution_margin_pct>100)){status.textContent="Ingresá un margen mayor a 0 y hasta 100%.";return}save.disabled=true;status.textContent="Guardando…";try{const r=await fetch("/api/clients",{method:"PATCH",headers:{"Content-Type":"application/json","x-admin-password":pwd},body:JSON.stringify(payload)}),d=await r.json();if(!r.ok)throw Error(d.error||"No se pudieron guardar los cambios");Object.assign(list.find(c=>String(c.id)===id)||{},d.client||{});status.textContent="Ficha actualizada correctamente. Actualizá los datos del panel para reflejar los cambios."}catch(e){status.textContent=e.message||"Error al guardar"}finally{save.disabled=false}};
 panel.append(title,selector,form,note,save,cancel,status);root.after(panel);
});
})();