(()=>{"use strict";const target=document.getElementById("salesCenterSection")||document.getElementById("servicesSection");if(!target||document.getElementById("tiendanubeModule"))return;
const panel=document.createElement("section");panel.id="tiendanubeModule";panel.className="tiendanube-module";panel.innerHTML='<div class="tn-head"><div><strong>🛍️ Tiendanube · Pedidos y facturación</strong><p>Estadísticas de las tiendas autorizadas de tus clientes.</p></div><button type="button" id="tnRefresh">Actualizar tiendas</button></div><div id="tnContent" class="tn-content">Cargando estadísticas…</div><p class="tn-foot">Facturación = valor de pedidos con pago marcado como pagado por Tiendanube. No es ganancia ni implica dinero acreditado.</p>';const head=target.querySelector(".section-head");if(head)head.after(panel);else target.prepend(panel);
const content=document.getElementById("tnContent"),button=document.getElementById("tnRefresh");
const connect=document.createElement("button");connect.type="button";connect.textContent="Conectar tienda";connect.className="tn-connect";button.parentElement.insertBefore(connect,button);
connect.addEventListener("click",async()=>{
 const password=sessionStorage.getItem("agency_pwd");if(!password)return alert("Primero ingresá al panel");
 try{
 const response=await fetch("/api/clients",{headers:{"x-admin-password":password}});
 if(!response.ok)throw Error("No se pudo consultar los clientes");
 const clients=(await response.json()).clients||[];
 if(!clients.length)throw Error("Primero registrá un cliente en tu agencia");
 const current=document.getElementById("clientFilter")?.value;
 const chosen=clients.length===1?clients[0]:null;
 const clientId=chosen?.id||(current&&current!=="all"&&clients.some(c=>c.id===current)?current:null);
 if(!clientId){const selector=document.createElement("select");selector.className="tn-client-select";selector.innerHTML='<option value="">Seleccioná un cliente</option>';clients.forEach(c=>{const opt=document.createElement("option");opt.value=c.id;opt.textContent=c.name;selector.appendChild(opt)});const modal=document.createElement("div");modal.className="tn-connect-box";const heading=document.createElement("strong");heading.textContent="Vincular Tiendanube a un cliente";const go=document.createElement("button");go.type="button";go.textContent="Continuar con Tiendanube";const close=document.createElement("button");close.type="button";close.textContent="Cancelar";modal.append(heading,selector,go,close);panel.append(modal);close.onclick=()=>modal.remove();go.onclick=()=>{const id=selector.value;modal.remove();if(id)startConnect(id)};return}
 await startConnect(clientId)
 }catch(e){alert(e.message||"No se pudo iniciar la conexión")}
});
async function startConnect(clientId){
 const password=sessionStorage.getItem("agency_pwd");
 const response=await fetch("/api/health?tn=1",{method:"POST",headers:{"x-admin-password":password,"Content-Type":"application/json"},body:JSON.stringify({client_id:clientId})});
 const result=await response.json();
 if(!response.ok)throw Error(result.error||"No se pudo conectar");
 window.location.assign(result.url)
}

const period=document.createElement("select");period.id="tnPeriod";period.className="tn-order-filter";period.setAttribute("aria-label","Período de Tiendanube");[["7","7 días"],["14","14 días"],["30","30 días"],["60","60 días"],["90","90 días"]].forEach(([v,t])=>{const opt=document.createElement("option");opt.value=v;opt.textContent=t;period.append(opt)});period.value="30";button.parentElement.insertBefore(period,button);
period.addEventListener("change",()=>refresh());
const money=(v,c)=>new Intl.NumberFormat("es-AR",{style:"currency",currency:c&&/^[A-Z]{3}$/.test(c)?c:"ARS",maximumFractionDigits:0}).format(Number(v||0));
async function refresh(){
 button.disabled=true;button.textContent="Actualizando…";content.textContent="Consultando tiendas conectadas…";
 try{
  const password=sessionStorage.getItem("agency_pwd");if(!password){content.textContent="Ingresá al panel para ver las tiendas.";return}
  const days=period.value||"30",client=document.getElementById("clientFilter")?.value||"all";
  const response=await fetch("/api/health?tn=1&compare=1&days="+encodeURIComponent(days)+"&client_id="+encodeURIComponent(client),{headers:{"x-admin-password":password}});
  const data=await response.json();
  if(!response.ok)throw new Error(data.error||"No se pudo consultar Tiendanube");
  content.replaceChildren();
  if(!data.configured){const p=document.createElement("p");p.className="tn-empty";p.textContent="Todavía no hay tiendas vinculadas. Usá «Conectar tienda» para autorizar una Tiendanube.";content.appendChild(p);return}
  for(const store of data.stores){
    const card=document.createElement("article");card.className="tn-store";
    const title=document.createElement("strong");title.textContent=store.name;
    const sub=document.createElement("small");sub.textContent="Tienda #"+store.store_id+" · "+(store.status==="connected"?"Sincronización consultada":"Error al sincronizar");
    card.append(title,sub);
    if(store.status!=="connected"){const err=document.createElement("p");err.textContent=store.error||"No se pudo cargar";card.append(err)}
    else{const grid=document.createElement("div");grid.className="tn-grid";for(const [name,value] of [["Pedidos",store.orders],["Pagados",store.paid_orders],["Pendientes",store.pending_orders],["Cancelados",store.cancelled_orders],["% cancelaciones",store.orders?((store.cancelled_orders/store.orders)*100).toFixed(1)+"%":"0%"],["Facturación pagada",money(store.paid_revenue,store.currency)],["Período anterior",store.previous_paid_revenue==null?"—":money(store.previous_paid_revenue,store.currency)],["Variación facturación",store.previous_paid_revenue==null?"—":store.previous_paid_revenue>0?(((store.paid_revenue-store.previous_paid_revenue)/store.previous_paid_revenue)*100).toFixed(1)+"%":store.paid_revenue>0?"Sin base anterior":"0%"],["Ticket promedio",money(store.average_paid_ticket,store.currency)]]){const metric=document.createElement("div");const label=document.createElement("span");label.textContent=name;const v=document.createElement("b");v.textContent=value;metric.append(label,v);grid.append(metric)}card.append(grid)}
    if(store.status==="connected"&&typeof window.__tnChartRender==="function"){const chart=window.__tnChartRender(store);if(chart)card.append(chart)}
    content.append(card)
  }
 }catch(e){content.textContent="No se pudieron cargar las tiendas: "+String(e.message||"Error")}finally{button.disabled=false;button.textContent="Actualizar tiendas"}
}
button.addEventListener("click",refresh);window.addEventListener("agency:finance-data",refresh);if(sessionStorage.getItem("agency_pwd"))refresh();
})();