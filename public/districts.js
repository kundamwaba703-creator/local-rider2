// District picker for the passenger and driver maps.
// Luwingu entries have fixed map positions. Every other district of Zambia is looked up on OpenStreetMap
// (through the server, /api/geocode) when chosen, so it needs internet.
const FIXED=[
  {name:'Luwingu Town (Boma)',lat:-10.2621,lng:29.9271,zoom:14},
  {name:'Whole Luwingu District',lat:-10.8333,lng:30.0,zoom:9}
];
const PROVINCES={
  'Central':['Chibombo','Chisamba','Chitambo','Kabwe','Kapiri Mposhi','Luano','Mkushi','Mumbwa','Ngabwe','Serenje','Shibuyunji'],
  'Copperbelt':['Chililabombwe','Chingola','Kalulushi','Kitwe','Luanshya','Lufwanyama','Masaiti','Mpongwe','Mufulira','Ndola'],
  'Eastern':['Chadiza','Chama','Chasefu','Chipangali','Chipata','Kasenengwa','Katete','Lumezi','Lundazi','Lusangazi','Mambwe','Nyimba','Petauke','Sinda','Vubwi'],
  'Luapula':['Chembe','Chiengi','Chifunabuli','Chipili','Kawambwa','Lunga','Mansa','Milenge','Mwansabombwe','Mwense','Nchelenge','Samfya'],
  'Lusaka':['Chilanga','Chongwe','Kafue','Luangwa','Lusaka','Rufunsa'],
  'Muchinga':['Chinsali','Isoka','Kanchibiya','Lavushimanda','Mafinga','Mpika','Nakonde',"Shiwang'andu"],
  'Northern':['Chilubi','Kaputa','Kasama','Lunte','Lupososhi','Mbala','Mporokoso','Mpulungu','Mungwi','Nsama','Senga Hill'],
  'North-Western':['Chavuma','Ikelenge','Kabompo','Kasempa','Kalumbila','Manyinga','Mufumbwe','Mushindamo','Mwinilunga','Solwezi','Zambezi'],
  'Southern':['Chikankata','Chirundu','Choma','Gwembe','Itezhi-Tezhi','Kalomo','Kazungula','Livingstone','Mazabuka','Monze','Namwala','Pemba','Siavonga','Sinazongwe','Zimba'],
  'Western':['Kalabo','Kaoma','Limulunga','Luampa','Lukulu','Mitete','Mongu','Mulobezi','Mwandi','Nalolo','Nkeyema','Senanga','Sesheke',"Shang'ombo",'Sikongo','Sioma']
};
function districtPicker(select,map){
  const group=(label,opts)=>{const g=document.createElement('optgroup');g.label=label;opts.forEach(o=>g.append(o));select.append(g)};
  group('Luwingu',FIXED.map((d,i)=>new Option(d.name,'f'+i)));
  for(const p in PROVINCES)group(p+' Province',PROVINCES[p].map(n=>new Option(n,'d:'+n)));
  let v='f0';try{v=localStorage.getItem('lrDistrict')||v}catch{}
  select.value=v;if(select.value!==v)select.value='f0';
  let seq=0;const note=document.getElementById('dnote');
  const go=async()=>{
    const v=select.value,t=++seq;try{localStorage.setItem('lrDistrict',v)}catch{}
    if(note)note.textContent='';
    if(v[0]==='f'){const d=FIXED[+v.slice(1)];map.setView([d.lat,d.lng],d.zoom);return}
    const name=v.slice(2);
    try{const g=await fetch('/api/geocode?name='+encodeURIComponent(name)).then(r=>r.ok?r.json():Promise.reject());
      if(t===seq)map.fitBounds(g.bounds,{maxZoom:15})}
    catch{if(t===seq&&note)note.textContent='Could not find '+name+' on the map. You can still tap the map.'}
  };
  select.onchange=go;go();
}

// Used by passengers (ride district) and drivers (registration). Luwingu Town and Whole Luwingu District both count as "Luwingu".
function districtName(v){return v?(v[0]==='f'?'Luwingu':v.slice(2)):''}
function districtList(select){
  select.append(new Option('Choose your district...',''));
  const group=(label,names)=>{const g=document.createElement('optgroup');g.label=label;names.forEach(n=>g.append(new Option(n,n)));select.append(g)};
  group('Luwingu',['Luwingu']);for(const p in PROVINCES)group(p+' Province',PROVINCES[p]);
}
