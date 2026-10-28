(()=>{"use strict";
const amount=n=>Number(n)||0;
const fmt=n=>new Intl.NumberFormat("es-AR",{style:"currency",currency:"ARS",maximumFractionDigits:0}).format(amount(n));
const nfmt=n=>new Intl.NumberFormat("es-AR").format(amount(n));
let requestSeq=0;
const section=document.getElementById("salesCenterSection");
const summary=document.createElement("div");summary.id="agencyUnifiedRevenue";summary.className="agency-unified-revenue";summary.hidden=true;
if(section){const head=section.querySelector(".section-head");if(head)head.after(summary);else section.prepend(summary)}
function renderUnified(d,tn){
 const success=(tn.stores||[]).filter(x=>x.status==="connected"&&x.currency==="ARS");
 const failures=(tn.stores||[]).filter(x=>x.status!=="connected");
 if(!success.length){summary.hidden=true;return}
 const connected=new Set(success.map(x=>String(x.client_id)));
 const crm=(d.by_client||[]).filter(c=>!connected.has(String(c.id)));
 const crmRevenue=crm.reduce((a,c)=>a+amount(c.revenue),0);
 const crmSales=crm.reduce((a,c)=>a+amount(c.purchases),0);
 const storeRevenue=success.reduce((a,s)=>a+amount(s.paid_revenue),0);
 const storeSales=success.reduce((a,s)=>a+amount(s.paid_orders),0);
 const cancelled=success.reduce((a,s)=>a+amount(s.cancelled_orders),0);
 const gross=crmRevenue+storeRevenue,orders=crmSales+storeSales;
 const label='Tiendanube pagada + ventas CRM sin tienda conectada';
 const home=document.getElementById("agencyHomeRevenueDetail");
 if(home){
  home.hidden=false;home.replaceChildren();
  const heading=document.createElement("strong");heading.textContent="Origen de la facturación";home.append(heading);
  const info=document.createElement("div");info.className="agency-home-revenue-items";
  for(const [caption,value] of [["Tiendanube · pedidos pagados",fmt(storeRevenue)],["CRM · clientes sin tienda conectada",fmt(crmRevenue)],["Total consolidado",fmt(gross)]]){const el=document.createElement("div");const a=document.createElement("small");a.textContent=caption;const b=document.createElement("b");b.textContent=value;el.append(a,b);info.append(el)}home.append(info);
  const stamp=document.createElement("small");stamp.className="agency-home-revenue-stamp";stamp.textContent="Actualizado "+new Date().toLocaleString("es-AR",{hour:"2-digit",minute:"2-digit",timeZone:"America/Argentina/Buenos_Aires"})+" hs · "+tn.days+" días";home.append(stamp);
  const byClient=document.createElement("section");byClient.className="agency-home-clients";
  const h=document.createElement("strong");h.textContent="Resultados por cliente";byClient.append(h);
  const rows=document.createElement("div");rows.className="agency-home-client-grid";
  const names=new Map((d.clients||[]).map(c=>[String(c.id),c.name]));
  const mapped=new Map();
  for(const store of success){const id=String(store.client_id),row=mapped.get(id)||{name:names.get(id)||store.name||"Tienda "+store.store_id,revenue:0,orders:0,previous:0,hasPrevious:false,source:"Tiendanube"};row.revenue+=amount(store.paid_revenue);row.orders+=amount(store.paid_orders);if(store.previous_paid_revenue!=null){row.previous+=amount(store.previous_paid_revenue);row.hasPrevious=true}mapped.set(id,row)}
  for(const c of crm){mapped.set(String(c.id),{name:c.name,revenue:amount(c.revenue),orders:amount(c.purchases),source:"CRM",hasPrevious:false})}
  const sorted=[...mapped.values()].sort((a,b)=>b.revenue-a.revenue);
  for(const row of sorted){const item=document.createElement("article");item.className="agency-home-client-item";
   const name=document.createElement("strong");name.textContent=row.name;const source=document.createElement("small");source.textContent=row.source;
   const total=document.createElement("b");total.textContent=fmt(row.revenue);
   const ordersText=document.createElement("span");ordersText.textContent=nfmt(row.orders)+" ventas";
   const trend=document.createElement("small");trend.className="agency-home-client-trend";
   trend.textContent=!row.hasPrevious?"Sin comparación disponible":row.previous===0?(row.revenue>0?"Sin base anterior":"Sin variación"):((row.revenue-row.previous)/row.previous*100>=0?"+":"")+((row.revenue-row.previous)/row.previous*100).toFixed(1)+"% vs. período anterior";
   item.append(name,source,total,ordersText,trend);rows.append(item)}
  if(!sorted.length){const none=document.createElement("p");none.textContent="Todavía no hay resultados para este período.";rows.append(none)}
  byClient.append(rows);home.append(byClient);
  const alerts=document.createElement("section");alerts.className="agency-home-alerts";
  const alertTitle=document.createElement("strong");alertTitle.textContent="Señales para revisar";alerts.append(alertTitle);
  const suggestions=[];
  const best=success.slice().sort((a,b)=>amount(b.paid_revenue)-amount(a.paid_revenue))[0];
  if(best)suggestions.push(["Mayor facturación",names.get(String(best.client_id))||best.name||"Tienda "+best.store_id,fmt(best.paid_revenue)+" en "+tn.days+" días","info"]);
  for(const store of success){
   const name=names.get(String(store.client_id))||store.name||"Tienda "+store.store_id;
   const rate=amount(store.orders)>0?100*amount(store.cancelled_orders)/amount(store.orders):0;
   if(amount(store.orders)>=10&&rate>=10)suggestions.push(["Cancelaciones elevadas",name,rate.toFixed(1)+"% de pedidos cancelados ("+store.cancelled_orders+"/"+store.orders+")","warning"]);
   const previous=store.previous_paid_revenue;
   if(previous!=null&&amount(previous)>0){const change=100*(amount(store.paid_revenue)-amount(previous))/amount(previous);if(change<=-15)suggestions.push(["Caída de facturación",name,change.toFixed(1)+"% frente al período anterior","warning"])}
  }
  if(!suggestions.length)suggestions.push(["Sin alertas destacadas","Tiendanube","No se detectaron cancelaciones elevadas ni caídas significativas con las reglas actuales.","info"]);
  const list=document.createElement("div");list.className="agency-home-alert-list";
  for(const [type,name,details,level] of suggestions.slice(0,8)){const card=document.createElement("div");card.className="agency-home-alert "+level;const a=document.createElement("small");a.textContent=type;const b=document.createElement("b");b.textContent=name;const c=document.createElement("span");c.textContent=details;card.append(a,b,c);list.append(card)}
  alerts.append(list);home.append(alerts);
 }

 const rev=document.getElementById("revenue"),revNote=document.getElementById("revenueNote"),purchases=document.getElementById("purchases");
 if(rev)rev.textContent=fmt(gross);
 if(revNote)revNote.textContent=label;
 if(purchases)purchases.textContent=nfmt(orders);
 summary.hidden=false;
 summary.replaceChildren();
 const heading=document.createElement("div");heading.className="agency-unified-heading";const title=document.createElement("strong");title.textContent="Facturación consolidada del período ("+tn.days+" días)";const subtitle=document.createElement("small");subtitle.textContent="No se duplican ventas CRM de clientes con Tiendanube conectada";heading.append(title,subtitle);summary.append(heading);
 const stats=[["Facturación total",fmt(gross)],["Facturación Tiendanube",fmt(storeRevenue)],["Ventas pagadas Tiendanube",nfmt(storeSales)],["Cancelaciones Tiendanube",nfmt(cancelled)]];
 const grid=document.createElement("div");grid.className="agency-unified-grid";
 for(const [name,value] of stats){const item=document.createElement("div");const a=document.createElement("span");a.textContent=name;const b=document.createElement("strong");b.textContent=value;item.append(a,b);grid.append(item)}summary.append(grid);
 const note=document.createElement("p");note.className="agency-unified-note";note.textContent="Incluye pedidos pagados de Tiendanube y ventas CRM de clientes que no tienen esa tienda sincronizada. No representa ganancia neta. CPA y ROAS publicitarios siguen calculados con la atribución original del CRM.";summary.append(note);
 if(failures.length){const warning=document.createElement("p");warning.className="agency-unified-warning";warning.textContent="Atención: "+failures.length+" tienda(s) sin datos actualizados. No se incluyeron en el total.";summary.append(warning)}
}
async function refresh(){
 const d=window.__agencyFinanceData;if(!d)return;
 const seq=++requestSeq,days=document.getElementById("days")?.value||"30",client=document.getElementById("clientFilter")?.value||"all",password=sessionStorage.getItem("agency_pwd");if(!password)return;
 if(Number(days)>90){document.getElementById("agencyHomeRevenueDetail")?.setAttribute("hidden","");summary.hidden=false;summary.textContent="El resumen consolidado con Tiendanube admite hasta 90 días. Elegí 7, 14, 30 o 90 días para evitar mezclar períodos distintos.";return;}
 try{
  const r=await fetch("/api/health?tn=1&compare=1&days="+encodeURIComponent(days)+"&client_id="+encodeURIComponent(client),{headers:{"x-admin-password":password},cache:"no-store"});
  if(!r.ok)throw Error("Error consultando Tiendanube");
  const tn=await r.json();
  if(seq!==requestSeq||window.__agencyFinanceData!==d)return;
  if(!tn.configured||!tn.stores?.length){summary.hidden=true;document.getElementById("agencyHomeRevenueDetail")?.setAttribute("hidden","");return}
  renderUnified(d,tn);
 }catch{
  if(seq!==requestSeq)return;
  document.getElementById("agencyHomeRevenueDetail")?.setAttribute("hidden","");
  summary.hidden=false;summary.replaceChildren();
  const msg=document.createElement("p");msg.className="agency-unified-warning";msg.textContent="No se pudo actualizar Tiendanube: se mantienen los valores originales del CRM para evitar mostrar cifras incompletas.";summary.append(msg);
 }
}
window.addEventListener("agency:finance-data",refresh);
if(window.__agencyFinanceData)refresh();
})();