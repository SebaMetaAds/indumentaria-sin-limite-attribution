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
 try{
  const r=await fetch("/api/health?tn=1&days="+encodeURIComponent(days)+"&client_id="+encodeURIComponent(client),{headers:{"x-admin-password":password},cache:"no-store"});
  if(!r.ok)throw Error("Error consultando Tiendanube");
  const tn=await r.json();
  if(seq!==requestSeq||window.__agencyFinanceData!==d)return;
  if(!tn.configured||!tn.stores?.length){summary.hidden=true;return}
  renderUnified(d,tn);
 }catch{
  if(seq!==requestSeq)return;
  summary.hidden=false;summary.replaceChildren();
  const msg=document.createElement("p");msg.className="agency-unified-warning";msg.textContent="No se pudo actualizar Tiendanube: se mantienen los valores originales del CRM para evitar mostrar cifras incompletas.";summary.append(msg);
 }
}
window.addEventListener("agency:finance-data",refresh);
if(window.__agencyFinanceData)refresh();
})();