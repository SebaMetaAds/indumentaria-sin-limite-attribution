(()=>{"use strict";
const root=document.querySelector(".wrap .top .controls");if(!root||document.getElementById("agencyReportBtn"))return;
const button=document.createElement("button");button.id="agencyReportBtn";button.type="button";button.textContent="↓ Reporte por cliente";button.title="Descargar reporte individual del negocio";root.append(button);
const esc=v=>String(v??"—").replace(/[&<>"']/g,c=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[c]));
const ars=n=>new Intl.NumberFormat("es-AR",{style:"currency",currency:"ARS",maximumFractionDigits:0}).format(Number(n)||0);
const num=n=>new Intl.NumberFormat("es-AR").format(Number(n)||0);
const pct=n=>n==null?"No disponible":(Number(n)*100).toFixed(1)+"%";
const card=(name,value)=>'<div class="metric"><small>'+esc(name)+'</small><b>'+esc(value)+'</b></div>';
const line=(a,b)=>'<tr><th>'+esc(a)+'</th><td>'+esc(b)+'</td></tr>';
const rows=(items)=>'<table>'+items.map(([a,b])=>line(a,b)).join("")+'</table>';
function save(blob,name){const url=URL.createObjectURL(blob),a=document.createElement("a");a.href=url;a.download=name;document.body.append(a);a.click();a.remove();setTimeout(()=>URL.revokeObjectURL(url),5000)}
const css=`*{box-sizing:border-box}body{font:13px/1.55 system-ui,-apple-system,Arial;color:#25283c;margin:0;background:#f5f6fa}header{background:#1d2040;color:white;padding:38px 45px}header h1{font-size:26px;margin:0 0 6px}header p{opacity:.75;margin:0}main{max-width:1050px;margin:25px auto;padding:0 24px 55px}section{background:white;padding:24px;margin:18px 0;border:1px solid #e8e8f0;border-radius:15px;break-inside:avoid}h2{font-size:16px;color:#493995;margin:0 0 15px}.metrics{display:grid;grid-template-columns:repeat(3,1fr);gap:12px}.metric{border:1px solid #eae7f5;border-radius:10px;background:#f9f8fe;padding:15px;display:flex;flex-direction:column;gap:7px}.metric small{color:#6b6f83}.metric b{font-size:19px;color:#2f2755}table{width:100%;border-collapse:collapse}th,td{padding:9px 8px;border-bottom:1px solid #ececf2;text-align:left;vertical-align:top}th{width:46%;font-weight:500;color:#6d7084}.muted{color:#73798c}.note{padding:12px;background:#fff8e8;border-radius:9px;color:#715b2b}.buttons{text-align:right;margin:14px 30px}.buttons button{background:#5948b9;color:white;border:0;border-radius:9px;padding:11px 16px;cursor:pointer}footer{font-size:11px;color:#888;text-align:center;margin:20px}@page{size:A4;margin:13mm}@media print{body{background:#fff}header{print-color-adjust:exact;-webkit-print-color-adjust:exact}.buttons{display:none}main{padding:0;margin:0;max-width:none}section{border-color:#eee;padding:12px;margin:12px 0}.metrics{grid-template-columns:repeat(3,1fr)}.metric{break-inside:avoid}}`;
async function request(url,pwd){const r=await fetch(url,{headers:{"x-admin-password":pwd},cache:"no-store"});const obj=await r.json();if(!r.ok)throw Error(obj.error||"No se pudo consultar el reporte");return obj}
button.addEventListener("click",async()=>{
 const pwd=sessionStorage.getItem("agency_pwd");if(!pwd){alert("Ingresá primero al sistema.");return}
 const existing=document.getElementById("agencyReportDialog");existing?.remove();
 const box=document.createElement("div");box.id="agencyReportDialog";box.className="agency-report-dialog";
 const heading=document.createElement("strong");heading.textContent="Reporte individual de negocio";
 const select=document.createElement("select");select.setAttribute("aria-label","Seleccionar cliente");
 const period=document.createElement("select");period.setAttribute("aria-label","Seleccionar período");
 for(const n of [7,14,30,60,90]){const option=document.createElement("option");option.value=String(n);option.textContent="Últimos "+n+" días";period.append(option)}period.value="30";
 const clients=window.__agencyFinanceData?.clients||[];for(const c of clients){const o=document.createElement("option");o.value=c.id;o.textContent=c.name;select.append(o)}
 const go=document.createElement("button");go.textContent="Descargar informe";go.type="button";
 const close=document.createElement("button");close.textContent="Cerrar";close.type="button";close.onclick=()=>box.remove();
 const message=document.createElement("small");message.setAttribute("role","status");
 box.append(heading,select,period,go,close,message);root.after(box);
 go.onclick=async()=>{
  const clientId=select.value,days=Number(period.value);if(!clientId)return;
  go.disabled=true;message.textContent="Consultando datos del negocio…";
  try{
   const [dash,tn]=await Promise.all([request("/api/dashboard?client_id="+encodeURIComponent(clientId)+"&days="+days,pwd),request("/api/health?tn=1&client_id="+encodeURIComponent(clientId)+"&days="+days+"&compare=1",pwd)]);
   const client=(dash.by_client||[]).find(c=>String(c.id)===String(clientId)),info=(dash.clients||[]).find(c=>String(c.id)===String(clientId));
   if(!client)throw Error("No se encontró el cliente en la respuesta del servidor.");
   const stores=(tn.stores||[]).filter(s=>s.status==="connected"&&s.currency==="ARS");
   const hasTn=stores.length>0,totalTn=stores.reduce((a,s)=>a+Number(s.paid_revenue||0),0),paid=stores.reduce((a,s)=>a+Number(s.paid_orders||0),0),cancelled=stores.reduce((a,s)=>a+Number(s.cancelled_orders||0),0),pending=stores.reduce((a,s)=>a+Number(s.pending_orders||0),0),placed=stores.reduce((a,s)=>a+Number(s.orders||0),0);
   const revenue=hasTn?totalTn:Number(client.revenue||0),sales=hasTn?paid:Number(client.purchases||0);
   const name=client.name||info?.name||"Cliente",stamp=new Date().toLocaleString("es-AR"),safeFile=(name.normalize("NFD").replace(/[\u0300-\u036f]/g,"").replace(/[^a-zA-Z0-9_-]+/g,"-").slice(0,45)||"cliente");
   const m=[["Facturación del negocio",ars(revenue)],["Ventas",num(sales)],["Gasto Meta Ads",client.meta_spend_ready?ars(client.spend):"Sin conexión Meta Ads"],["Conversaciones",num(client.conversations)],["CPA CRM",client.cpa==null?"No disponible":ars(client.cpa)],["ROAS CRM",client.roas==null?"No disponible":Number(client.roas).toFixed(2)+"x"]];
   let html='<!doctype html><html lang="es"><head><meta charset="utf-8"><title>Reporte '+esc(name)+'</title><style>'+css+'</style></head><body><div class="buttons"><button onclick="window.print()">Imprimir / Guardar como PDF</button></div><header><h1>Reporte del negocio · '+esc(name)+'</h1><p>Período: últimos '+days+' días · Generado '+esc(stamp)+'</p></header><main>';
   html+='<section><h2>Resumen ejecutivo</h2><div class="metrics">'+m.map(x=>card(...x)).join("")+'</div><p class="muted">Facturación: '+(hasTn?"pedidos pagados de Tiendanube; no se suman nuevamente las ventas CRM":"ventas registradas en CRM; no hay tienda Tiendanube sincronizada")+'.</p></section>';
   html+='<section><h2>Publicidad y adquisición</h2>'+rows([["Inversión en anuncios",client.meta_spend_ready?ars(client.spend):"Sin datos de Meta Ads"],["Conversaciones",num(client.conversations)],["Compradores registrados CRM",num(client.purchases)],["Tasa de cierre CRM",pct(client.close_rate)],["Costo por adquisición CRM",client.cpa==null?"No disponible":ars(client.cpa)],["ROAS CRM",client.roas==null?"No disponible":Number(client.roas).toFixed(2)+"x"],["Configuración Meta Ads",client.meta_spend_ready?"Conectada":"No confirmada"],["WhatsApp",client.whatsapp_ready?"Conectado":"No confirmado"]])+'</section>';
   html+='<section><h2>Ventas y Tiendanube</h2>'+rows([["Fuente principal",hasTn?"Tiendanube":"CRM"],["Facturación del período",ars(revenue)],["Cantidad de ventas",num(sales)],["Pedidos Tiendanube totales",hasTn?num(placed):"No disponible"],["Pedidos pagados",hasTn?num(paid):"No disponible"],["Pedidos pendientes",hasTn?num(pending):"No disponible"],["Pedidos cancelados",hasTn?num(cancelled):"No disponible"],["Tasa de cancelación",hasTn&&placed?(100*cancelled/placed).toFixed(1)+"%":"No disponible"],["Ticket promedio",sales?ars(revenue/sales):"No disponible"]])+'</section>';
   if(stores.length){html+='<section><h2>Tiendas conectadas</h2>'+rows(stores.flatMap(s=>[["Tienda #"+s.store_id+" · facturación",ars(s.paid_revenue)],["Tienda #"+s.store_id+" · pedidos pagados",num(s.paid_orders)],["Tienda #"+s.store_id+" · período anterior",s.previous_paid_revenue==null?"No disponible":ars(s.previous_paid_revenue)]]))+'</section>'}
   if(tn.stores?.some(s=>s.status!=="connected"))html+='<section><p class="note">Atención: algunas tiendas tuvieron errores de sincronización; el total puede ser parcial.</p></section>';
   html+='<section><h2>Información del negocio</h2>'+rows([["Nombre",name],["Sitio web",info?.website_url||"No registrado"],["Instagram",info?.instagram_handle||"No registrado"],["Estado del servicio",info?.service_status||"No registrado"],["Objetivo comercial",info?.business_goal||"No registrado"],["Presupuesto mensual Meta Ads",info?.monthly_ad_budget?ars(info.monthly_ad_budget):"No registrado"],["Objetivo de facturación mensual",info?.monthly_revenue_goal?ars(info.monthly_revenue_goal):"No registrado"]])+'</section>';
   html+='<section><h2>Interpretación de los datos</h2><p class="muted">Las ventas y la facturación provenientes de Tiendanube se basan en pedidos pagados. Los resultados publicitarios (CPA, ROAS, cierre) corresponden al CRM y no se recalculan con el total omnicanal de la tienda. Los importes no son utilidad neta ni implican fondos acreditados. Información disponible únicamente para el período elegido.</p></section>';
   html+='</main><footer>Reporte de gestión · Generado desde el sistema de agencia</footer></body></html>';
   save(new Blob([html],{type:"text/html;charset=utf-8"}),"Reporte-"+safeFile+"-"+days+"dias.html");
   message.textContent="Descargado. Abrí el archivo y usá «Imprimir / Guardar como PDF» si querés compartirlo como PDF.";
  }catch(e){message.textContent="Error: "+(e.message||"No disponible")}finally{go.disabled=false}
 };
});
})();