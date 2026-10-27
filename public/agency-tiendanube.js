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

const money=(v,c)=>new Intl.NumberFormat("es-AR",{style:"currency",currency:c&&/^[A-Z]{3}$/.test(c)?c:"ARS",maximumFractionDigits:0}).format(Number(v||0));
async function refresh(){
 button.disabled=true;button.textContent="Actualizando…";content.textContent="Consultando tiendas conectadas…";
 try{
  const password=sessionStorage.getItem("agency_pwd");if(!password){content.textContent="Ingresá al panel para ver las tiendas.";return}
  const days=document.getElementById("days")?.value||"7",client=document.getElementById("clientFilter")?.value||"all";
  const response=await fetch("/api/health?tn=1&days="+encodeURIComponent(days)+"&client_id="+encodeURIComponent(client),{headers:{"x-admin-password":password}});
  const data=await response.json();
  if(!response.ok)throw new Error(data.error||"No se pudo consultar Tiendanube");
  content.replaceChildren();
  if(!data.configured){const p=document.createElement("p");p.className="tn-empty";p.textContent="No hay tiendas conectadas todavía. Configurá TIENDANUBE_STORES_JSON en las variables de Vercel con el ID de tienda, token de solo lectura y cliente asociado.";content.appendChild(p);return}
  for(const store of data.stores){
    const card=document.createElement("article");card.className="tn-store";
    const title=document.createElement("strong");title.textContent=store.name;
    const sub=document.createElement("small");sub.textContent="Tienda #"+store.store_id+" · "+(store.status==="connected"?"Sincronización consultada":"Error al sincronizar");
    card.append(title,sub);
    if(store.status!=="connected"){const err=document.createElement("p");err.textContent=store.error||"No se pudo cargar";card.append(err)}
    else{const grid=document.createElement("div");grid.className="tn-grid";for(const [name,value] of [["Pedidos",store.orders],["Pagados",store.paid_orders],["Pendientes",store.pending_orders],["Cancelados",store.cancelled_orders],["Facturación pagada",money(store.paid_revenue,store.currency)],["Ticket promedio",money(store.average_paid_ticket,store.currency)]]){const metric=document.createElement("div");const label=document.createElement("span");label.textContent=name;const v=document.createElement("b");v.textContent=value;metric.append(label,v);grid.append(metric)}card.append(grid)}
    if(Array.isArray(store.recent_orders)&&store.recent_orders.length){
      const wrap=document.createElement("div");wrap.className="tn-orders-wrap";
      const heading=document.createElement("strong");heading.textContent="Últimos pedidos ("+store.recent_orders.length+")";
      const search=document.createElement("input");search.type="search";search.placeholder="Buscar pedido o comprador";search.className="tn-order-search";
      const status=document.createElement("select");status.className="tn-order-filter";
      [["all","Todos los estados"],["paid","Pagados"],["pending","Pendientes"],["cancelled","Cancelados"]].forEach(([v,t])=>{const op=document.createElement("option");op.value=v;op.textContent=t;status.append(op)});
      const scroller=document.createElement("div");scroller.className="tn-orders-scroll";const table=document.createElement("table");table.className="tn-orders-table";
      const thead=document.createElement("thead"),tr=document.createElement("tr");
      ["Pedido","Comprador","Fecha","Pago","Total","Detalles"].forEach(t=>{const th=document.createElement("th");th.textContent=t;tr.append(th)});thead.append(tr);
      const body=document.createElement("tbody");table.append(thead,body);scroller.append(table);
      function renderOrders(){
        body.replaceChildren();const q=search.value.toLowerCase().trim();
        const orders=store.recent_orders.filter(o=>(status.value==="all"||(status.value==="cancelled"?o.status==="cancelled":o.payment_status===status.value))&&(!q||[o.number,o.customer_name].some(v=>String(v||"").toLowerCase().includes(q))));
        for(const o of orders){const line=document.createElement("tr");const date=o.date?new Date(o.date).toLocaleDateString("es-AR",{timeZone:"America/Argentina/Buenos_Aires"}):"—";for(const v of ["#"+o.number,o.customer_name,date,o.payment_status,money(o.total,o.currency)]){const td=document.createElement("td");td.textContent=v;line.append(td)}
        const action=document.createElement("td"),btn=document.createElement("button");btn.type="button";btn.textContent="Ver";btn.className="tn-order-detail";btn.onclick=()=>{const existing=line.nextElementSibling;if(existing?.classList.contains("tn-order-expanded")){existing.remove();return}const expanded=document.createElement("tr");expanded.className="tn-order-expanded";const cell=document.createElement("td");cell.colSpan=6;const products=(o.items||[]).map(p=>p.quantity+" × "+p.name+" ("+money(p.price,o.currency)+")").join(" · ");cell.textContent="Estado: "+o.status+" · Envío: "+o.shipping_status+" · Productos: "+(products||"Sin detalle disponible");expanded.append(cell);line.after(expanded)};action.append(btn);line.append(action);body.append(line)}
        if(!orders.length){const line=document.createElement("tr"),td=document.createElement("td");td.colSpan=6;td.textContent="No se encontraron pedidos.";line.append(td);body.append(line)}
      }
      search.addEventListener("input",renderOrders);status.addEventListener("change",renderOrders);
      wrap.append(heading,search,status,scroller);card.append(wrap);renderOrders();
    }
    content.append(card)
  }
 }catch(e){content.textContent="No se pudieron cargar las tiendas: "+String(e.message||"Error")}finally{button.disabled=false;button.textContent="Actualizar tiendas"}
}
button.addEventListener("click",refresh);window.addEventListener("agency:finance-data",refresh);if(sessionStorage.getItem("agency_pwd"))refresh();
})();