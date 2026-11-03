(()=>{"use strict";
const target=document.getElementById("tnContent");if(!target)return;
function chart(store){
 const daily=store.daily_paid||[];if(!daily.length)return null;
 const panel=document.createElement("div");panel.className="tn-daily-chart";
 const heading=document.createElement("strong");heading.textContent="Facturación pagada por día";
 const subtitle=document.createElement("small");subtitle.textContent="Pedidos pagados agrupados por fecha de creación (Argentina).";
 const scroller=document.createElement("div");scroller.className="tn-daily-scroll";
 const canvas=document.createElement("div");canvas.className="tn-daily-bars";
 const min=new Date(daily[0].date+"T12:00:00Z"),max=new Date(daily[daily.length-1].date+"T12:00:00Z");
 const values=new Map(daily.map(x=>[x.date,x]));const bars=[];
 const maxValue=Math.max(1,...daily.map(x=>Number(x.revenue||0)));
 for(let d=new Date(min);d<=max&&bars.length<93;d.setUTCDate(d.getUTCDate()+1)){const key=d.toISOString().slice(0,10),entry=values.get(key)||{revenue:0,orders:0};
 const col=document.createElement("div");col.className="tn-daily-column";
 const bar=document.createElement("div");bar.className="tn-daily-bar";bar.style.height=Math.max(2,Number(entry.revenue||0)/maxValue*135)+"px";bar.title=key+" · "+new Intl.NumberFormat("es-AR",{style:"currency",currency:store.currency||"ARS",maximumFractionDigits:0}).format(entry.revenue)+" · "+entry.orders+" pedidos pagados";
 const label=document.createElement("span");label.textContent=key.slice(8,10);col.append(bar,label);canvas.append(col);bars.push(col)}
 scroller.append(canvas);panel.append(heading,subtitle,scroller);return panel
}
const original=window.__tnChartRender;
window.__tnChartRender=chart;
})();