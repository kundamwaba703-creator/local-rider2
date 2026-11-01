async function api(url,data,token){
  const o={headers:{'Content-Type':'application/json'}};
  if(token)o.headers.Authorization='Bearer '+token;
  if(data!==undefined){o.method='POST';o.body=JSON.stringify(data)}
  const r=await fetch(url,o);const j=await r.json().catch(()=>({}));
  if(!r.ok)throw Object.assign(new Error(j.error||'Something went wrong.'),{status:r.status});return j;
}
const $=s=>document.querySelector(s);
function el(tag,text,cls){const e=document.createElement(tag);if(text!==undefined)e.textContent=text;if(cls)e.className=cls;return e}
const when=t=>new Date(t).toLocaleString([], {dateStyle:'short',timeStyle:'short'});
const PAYL={airtel:'Airtel Money',mtn:'MTN MoMo',zamtel:'Zamtel Money',cash:'Cash on arrival'};
// Map base layers: Default (OpenStreetMap streets) or Satellite (Esri imagery). The choice is remembered on this device.
function baseMap(map){
  const osm=L.tileLayer('https://tile.openstreetmap.org/{z}/{x}/{y}.png',{maxZoom:19,attribution:'&copy; OpenStreetMap contributors'});
  const sat=L.tileLayer('https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}',{maxZoom:19,maxNativeZoom:17,attribution:'Tiles &copy; Esri'});
  let m='default';try{m=localStorage.getItem('lrMapMode')||m}catch{}
  (m==='satellite'?sat:osm).addTo(map);
  L.control.layers({'Default':osm,'Satellite':sat},null,{position:'topright',collapsed:false}).addTo(map);
  map.on('baselayerchange',e=>{try{localStorage.setItem('lrMapMode',e.name==='Satellite'?'satellite':'default')}catch{}});
}
