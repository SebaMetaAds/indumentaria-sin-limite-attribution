(()=>{"use strict";
window.renderTiendanubeComparison=function(stores,container,formatMoney){
 const valid=(stores||[]).filter(s=>s.status==="connected");
 if(!valid.length)return;
 const root=document.createElement("section");root.className="tn-comparison";
 const head=document.createElement("div");head.className="tn-compare-head";
 const title=document.createElement("strong");title.textContent="Comparador de tiendas";
 const select=document.createElement("select");select.setAttribute("aria-label","Ordenar comparación");
 [["paid_revenue","Mayor facturación"],["paid_orders","Más pedidos pagados"],["average_paid_ticket","Mayor ticket promedio"],["cancel_rate","Mayor tasa de cancelación"]].forEach(([value,text])=>{const opt=document.createElement("option");opt.value=value;opt.textContent=text;select.append(opt)});
 head.append(title,select);
 const wrap=document.createElement("div");wrap.className="tn-comparison-scroll";
 const table=document.createElement("table");table.className="tn-comparison-table";
 const thead=document.createElement("thead"),tr=document.createElement("tr");["Tienda","Facturación pagada","Pedidos pagados","Ticket promedio","Cancelados","% cancelación"].forEach(t=>{const th=document.createElement("th");th.textContent=t;tr.append(th)});thead.append(tr);
 const body=document.createElement("tbody");table.append(thead,body);wrap.append(table);
 const note=document.createElement("p");note.className="tn-comparison-note";note.textContent="Comparación del mismo período seleccionado. Los importes de monedas diferentes no se suman ni convierten.";
 root.append(head,wrap,note);container.prepend(root);
 function draw(){body.replaceChildren();const rows=valid.map(s=>({...s,cancel_rate:Number(s.orders)>0?100*Number(s.cancelled_orders||0)/Number(s.orders):0}));const metric=select.value;rows.sort((a,b)=>Number(b[metric]||0)-Number(a[metric]||0));rows.forEach(s=>{const tr=document.createElement("tr");const cols=[s.name||"Tienda "+s.store_id,formatMoney(s.paid_revenue,s.currency),String(s.paid_orders||0),formatMoney(s.average_paid_ticket,s.currency),String(s.cancelled_orders||0),s.cancel_rate.toFixed(1)+"%"];cols.forEach(v=>{const td=document.createElement("td");td.textContent=v;tr.append(td)});body.append(tr)})}select.addEventListener("change",draw);draw();
};
})();