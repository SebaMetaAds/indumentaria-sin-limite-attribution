(()=>{"use strict";
const sections=[["Inicio",null],["Ventas","salesCenterSection"],["Resumen diario","todaySection"],["Pagos","paymentsSection"],["Tareas","tasksSection"],["Equipo","teamSection"],["Servicios","servicesSection"],["Pipeline","pipelineSection"],["Meta Ads","adsSection"],["Leads y WhatsApp","leadsSection"]];
const $=id=>document.getElementById(id);
const prefsKey="agency_ui_v2";
let prefs={theme:"light",compact:false,animations:true};
try{const v=JSON.parse(localStorage.getItem(prefsKey)||"{}");if(v&&typeof v==="object")prefs={...prefs,...v}}catch{}
const save=()=>{try{localStorage.setItem(prefsKey,JSON.stringify(prefs))}catch{}};
function theme(){document.body.classList.toggle("agency-dark",prefs.theme==="dark");document.body.classList.toggle("agency-compact",prefs.compact);document.body.classList.toggle("agency-no-motion",!prefs.animations)}
function button(label,handler,title){const el=document.createElement("button");el.type="button";el.className="agency-action-btn";el.textContent=label;if(title)el.title=title;el.addEventListener("click",handler);return el}
const toolbar=document.createElement("div");toolbar.className="agency-quick-toolbar";toolbar.setAttribute("aria-label","Herramientas de navegación");
const search=button("⌕ Buscar",()=>openPalette(),"Buscar secciones (Ctrl+K)");
const themeBtn=button("◐ Tema",()=>{prefs.theme=prefs.theme==="dark"?"light":"dark";save();theme()},"Alternar modo oscuro");
const compactBtn=button("⊟ Compacto",()=>{prefs.compact=!prefs.compact;save();theme()},"Reducir espacios");
const animateBtn=button("✦ Movimiento",()=>{prefs.animations=!prefs.animations;save();theme()},"Activar o desactivar animaciones");
const reloadBtn=button("↻ Datos",()=>{const refresh=$("refresh");if(refresh)refresh.click()},"Actualizar datos mediante el botón original");
toolbar.append(search,themeBtn,compactBtn,animateBtn,reloadBtn);
const top=document.querySelector(".top");if(top)top.after(toolbar);else document.querySelector(".wrap")?.prepend(toolbar);
const palette=document.createElement("div");palette.className="agency-palette hide";palette.innerHTML='<div class="agency-palette-dialog" role="dialog" aria-modal="true" aria-label="Ir a una sección"><div class="agency-palette-title">Ir a una sección <button type="button" id="agencyPaletteClose" aria-label="Cerrar">×</button></div><input type="search" id="agencyPaletteInput" aria-label="Buscar sección" placeholder="Escribí Meta Ads, WhatsApp, ventas..." autocomplete="off"><div id="agencyPaletteList" class="agency-palette-list"></div><small>Enter para abrir · Esc para cerrar</small></div>';document.body.appendChild(palette);
const input=$("agencyPaletteInput"),list=$("agencyPaletteList");let active=0,options=[];
function navigate(id){closePalette();if(!id){window.scrollTo({top:0,behavior:"smooth"});return}const target=$(id);if(target)target.scrollIntoView({block:"start",behavior:matchMedia("(prefers-reduced-motion: reduce)").matches?"auto":"smooth"})}
function renderList(){const q=input.value.trim().toLocaleLowerCase("es");options=sections.filter(([label,id])=>(!id||$(id))&&label.toLocaleLowerCase("es").includes(q));active=Math.min(active,Math.max(0,options.length-1));list.replaceChildren();options.forEach(([label,id],idx)=>{const row=button(label,()=>navigate(id));row.className="agency-palette-option"+(idx===active?" selected":"");list.appendChild(row)});if(!options.length){const empty=document.createElement("p");empty.textContent="No encontramos esa sección.";list.appendChild(empty)}}
function openPalette(){palette.classList.remove("hide");input.value="";active=0;renderList();input.focus()}
function closePalette(){palette.classList.add("hide")}
$("agencyPaletteClose").addEventListener("click",closePalette);
palette.addEventListener("click",e=>{if(e.target===palette)closePalette()});
input.addEventListener("input",()=>{active=0;renderList()});
input.addEventListener("keydown",e=>{if(e.key==="ArrowDown"||e.key==="ArrowUp"){e.preventDefault();active=(active+(e.key==="ArrowDown"?1:-1)+options.length)%Math.max(1,options.length);renderList()}if(e.key==="Enter"&&options[active]){e.preventDefault();navigate(options[active][1])}});
document.addEventListener("keydown",e=>{const el=document.activeElement;const editing=el&&["INPUT","TEXTAREA","SELECT"].includes(el.tagName);if((e.ctrlKey||e.metaKey)&&e.key.toLowerCase()==="k"){e.preventDefault();openPalette()}else if(e.key==="/"&&!editing&&!e.ctrlKey&&!e.metaKey){e.preventDefault();openPalette()}else if(e.key==="Escape")closePalette()});
const clientSelect=$("clientFilter"),daySelect=$("days");
for(const el of [clientSelect,daySelect])if(el){el.addEventListener("change",()=>{const stamp=$("agencyRangeStamp");if(stamp)stamp.textContent="Filtros actualizados · "+new Date().toLocaleTimeString("es-AR",{hour:"2-digit",minute:"2-digit"})})}
const stamp=document.createElement("span");stamp.id="agencyRangeStamp";stamp.className="agency-range-stamp";stamp.textContent="Usá Ctrl+K para navegar rápido";toolbar.appendChild(stamp);
const observer=typeof IntersectionObserver==="function"?new IntersectionObserver(entries=>{for(const item of entries)if(item.isIntersecting)item.target.classList.add("agency-seen")},{threshold:.03}):null;
if(observer)document.querySelectorAll(".section").forEach(el=>observer.observe(el));
theme();
})();