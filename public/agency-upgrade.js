(()=>{"use strict";
if(document.querySelector(".agency-sidebar"))return;
const items=[["Inicio","⌂","home"],["Ventas","▤","salesCenterSection"],["Tiendanube","▣","tiendanubeTab"],["Resumen diario","◷","todaySection"],["Pagos","◇","paymentsSection"],["Tareas","☑","tasksSection"],["Equipo","♙","teamSection"],["Servicios","▣","servicesSection"],["Pipeline","⇄","pipelineSection"],["Meta Ads","▥","adsSection"],["Leads y WhatsApp","◉","leadsSection"]];
const side=document.createElement("aside");side.className="agency-sidebar";side.setAttribute("aria-label","Navegación del panel");
const logo=document.createElement("div");logo.className="agency-logo";logo.innerHTML='<span class="agency-logo-icon">A</span><span>AGENCIA<br><small style="font-weight:400;color:#aab5cb">Panel de gestión</small></span>';side.appendChild(logo);
const label=document.createElement("div");label.className="agency-nav-label";label.textContent="SECCIONES";side.appendChild(label);
const nav=document.createElement("nav");nav.className="agency-nav";const controls=new Map();
const backdrop=document.createElement("div");backdrop.className="agency-backdrop";
const close=()=>{side.classList.remove("open");backdrop.classList.remove("open")};
let selected="home";
function activate(id,updateHash=true){
 const existing=document.getElementById(id);if(id!=="home"&&!existing)return;
 selected=id;document.body.dataset.agencyTab=id;
 document.querySelectorAll(".wrap > .section").forEach(el=>{el.classList.toggle("agency-tab-visible",el.id===id)});
 const cards=document.querySelector(".wrap > .cards");if(cards)cards.hidden=id!=="home";
 const home=document.getElementById("agencyHomeIntro");if(home)home.hidden=id!=="home";
 controls.forEach((button,key)=>{const on=key===id;button.classList.toggle("active",on);button.setAttribute("aria-current",on?"page":"false")});
 if(updateHash)history.replaceState(null,"",id==="home"?"#inicio":"#"+id);
 window.scrollTo({top:0,behavior:"instant"});close();
}
window.agencyOpenTab=activate;
items.forEach(([title,symbol,id])=>{const btn=document.createElement("button");btn.type="button";btn.className="agency-nav-button";btn.innerHTML='<span class="agency-symbol"></span>';btn.firstChild.textContent=symbol;btn.append(document.createTextNode(title));btn.addEventListener("click",()=>activate(id));nav.append(btn);controls.set(id,btn)});side.append(nav);
const footer=document.createElement("div");footer.className="agency-sidebar-footer";footer.textContent="Panel organizado por secciones";side.append(footer);
const toggle=document.createElement("button");toggle.className="agency-menu-toggle";toggle.textContent="☰ Menú";toggle.type="button";toggle.setAttribute("aria-label","Abrir navegación");toggle.onclick=()=>{side.classList.toggle("open");backdrop.classList.toggle("open")};backdrop.onclick=close;
document.addEventListener("keydown",e=>{if(e.key==="Escape")close()});
document.body.classList.add("agency-enhanced","agency-tabs-enabled");document.body.append(side,backdrop,toggle);
function init(){
 const wrap=document.querySelector(".wrap"),cards=wrap?.querySelector(".cards");if(!wrap)return;
 const intro=document.createElement("section");intro.id="agencyHomeIntro";intro.className="agency-home-intro";intro.innerHTML='<h2>Resumen general</h2><p>Indicadores principales de tu agencia. Elegí una sección del menú para gestionar ventas, campañas, clientes o Tiendanube.</p>';if(cards)cards.before(intro);
 const tn=document.getElementById("tiendanubeModule");if(tn){const tab=document.createElement("div");tab.id="tiendanubeTab";tab.className="section agency-tiendanube-tab";const anchor=document.getElementById("salesCenterSection");anchor?.after(tab);tab.append(tn)}
 const go=window.focusSection;window.focusSection=function(id){if(document.getElementById(id)){activate(id);return}if(typeof go==="function")go(id)};
 const hash=decodeURIComponent(location.hash.slice(1));activate(items.some(x=>x[2]===hash)?hash:"home",false);
}
if(document.readyState==="loading")document.addEventListener("DOMContentLoaded",init,{once:true});else init();
})();