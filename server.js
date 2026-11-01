// Luwingu Rider server. No packages needed: just Node.js 16+.  Run: node server.js
const http=require('http'),fs=require('fs'),path=require('path'),crypto=require('crypto'),os=require('os');
const PORT=process.env.PORT||3000, ADMIN_PASSWORD=process.env.ADMIN_PASSWORD||'admin123';
const DBF=path.join(process.env.DATA_DIR||__dirname,'data.json'), PUB=path.join(__dirname,'public');
if(process.env.DATA_DIR)fs.mkdirSync(process.env.DATA_DIR,{recursive:true});
let db={drivers:[],rides:[],photos:[]}; try{db=JSON.parse(fs.readFileSync(DBF))}catch{}
db.photos=db.photos||[]; // driver pictures: {id:'<driverId>-passport'|'-bike', image:'data:image/jpeg;base64,...'}
// Storage: PostgreSQL when DATABASE_URL is set, otherwise the data.json file.
let pg=null,snap={},busy=Promise.resolve();
const save=()=>pg?persist():fs.writeFileSync(DBF,JSON.stringify(db,null,1));
function persist(){busy=busy.then(async()=>{ // writes only the drivers/rides that changed
  const cur={},obj={},ops=[];
  for(const c of ['drivers','rides','photos'])for(const d of db[c]){cur[c+'/'+d.id]=JSON.stringify(d);obj[c+'/'+d.id]=d}
  for(const k in cur)if(snap[k]!==cur[k])ops.push(['set',k]);
  for(const k in snap)if(!(k in cur))ops.push(['del',k]);
  if(!ops.length)return;
  const c=await pg.connect();
  try{await c.query('BEGIN');
    for(const [t,k] of ops){const [tb,id]=k.split('/');t==='set'?await c.query('INSERT INTO '+tb+'(id,data) VALUES($1,$2) ON CONFLICT (id) DO UPDATE SET data=$2',[id,obj[k]]):await c.query('DELETE FROM '+tb+' WHERE id=$1',[id])}
    await c.query('COMMIT')}catch(e){await c.query('ROLLBACK');throw e}finally{c.release()}
  snap=cur}).catch(e=>console.error('Database save failed (will retry on next change):',e.message))}
async function loadDatabase(){
  if(!process.env.DATABASE_URL){console.log('No DATABASE_URL set: saving to data.json');return}
  const {Pool}=require('pg');let url=process.env.DATABASE_URL;
  const ssl=/sslmode=(require|verify)/.test(url)||process.env.PGSSL==='require';
  url=url.replace(/([?&])sslmode=[^&]*&?/,'$1').replace(/[?&]$/,'');
  pg=new Pool({connectionString:url,ssl:ssl?{rejectUnauthorized:false}:undefined});
  for(const t of ['drivers','rides','photos'])await pg.query('CREATE TABLE IF NOT EXISTS '+t+'(id text PRIMARY KEY,data jsonb NOT NULL)');
  const got={};for(const t of ['drivers','rides','photos'])got[t]=(await pg.query('SELECT data FROM '+t)).rows.map(r=>r.data);
  if(got.drivers.length||got.rides.length){db.drivers=got.drivers.sort((a,b)=>a.created-b.created);db.rides=got.rides.sort((a,b)=>a.created-b.created);db.photos=got.photos;
    for(const c of ['drivers','rides','photos'])for(const d of db[c])snap[c+'/'+d.id]=JSON.stringify(d)}
  else if(db.drivers.length||db.rides.length){console.log('Copying existing data.json into PostgreSQL...');await persist()}
  console.log('Connected to PostgreSQL.')}
const sessions={}, uid=()=>crypto.randomBytes(6).toString('hex');
const hash=(p,s)=>crypto.scryptSync(p,s,32).toString('hex');
const num=v=>{v=Number(v);return v&&isFinite(v)&&Math.abs(v)<=180?v:null};
const PER_KM=Number(process.env.FARE_PER_KM)||10; // kwacha per km
const hav=(a,b,c,d)=>{const r=Math.PI/180,x=Math.sin((c-a)*r/2)**2+Math.cos(a*r)*Math.cos(c*r)*Math.sin((d-b)*r/2)**2;return 12742*Math.asin(Math.sqrt(x))};
// Distance by road (OpenStreetMap routing). Falls back to straight-line if the service can't be reached.
async function roadKm(a,b,c,d){
  try{const r=await fetch('https://router.project-osrm.org/route/v1/driving/'+b+','+a+';'+d+','+c+'?overview=false',{signal:AbortSignal.timeout(6000)});
    const j=await r.json();if(j.routes&&j.routes[0])return {km:Math.round(j.routes[0].distance/100)/10,road:true}}catch{}
  return {km:Math.round(hav(a,b,c,d)*10)/10,road:false}}
async function quote(a,b,c,d){const q=await roadKm(a,b,c,d);return {km:q.km,road:q.road,fare:Math.round(q.km*PER_KM),perKm:PER_KM}}
// Phone notifications (Web Push). Needs the web-push package. Keys: VAPID_PUBLIC_KEY / VAPID_PRIVATE_KEY, or a vapid.json file made on first run.
let wp=null,vapid=null;
try{wp=require('web-push');
  if(process.env.VAPID_PUBLIC_KEY&&process.env.VAPID_PRIVATE_KEY)vapid={publicKey:process.env.VAPID_PUBLIC_KEY,privateKey:process.env.VAPID_PRIVATE_KEY};
  const vf=path.join(process.env.DATA_DIR||__dirname,'vapid.json');
  if(!vapid){try{vapid=JSON.parse(fs.readFileSync(vf))}catch{vapid=wp.generateVAPIDKeys();
    try{fs.writeFileSync(vf,JSON.stringify(vapid));console.log('Created push keys. If your host forgets files, set these as VAPID_PUBLIC_KEY and VAPID_PRIVATE_KEY:\n  '+vapid.publicKey+'\n  '+vapid.privateKey)}catch{}}}
  wp.setVapidDetails(process.env.VAPID_SUBJECT||'mailto:admin@example.com',vapid.publicKey,vapid.privateKey)}catch{wp=null}
function pushNew(r){ // tell approved drivers in the ride's district (devices that turned notifications on)
  if(!wp)return;const body=r.pickup+' to '+r.dropoff+(r.fare!=null?' | K'+r.fare:'');
  for(const d of db.drivers){if(d.status!=='approved'||!d.push||!d.push.length||!sameDistrict(r,d.id))continue;
    for(const sub of d.push.slice())wp.sendNotification(sub,JSON.stringify({title:'New ride request',body,url:'/driver'})).catch(e=>{
      if(e.statusCode===404||e.statusCode===410){d.push=d.push.filter(q=>q.endpoint!==sub.endpoint);save()}})}}
const DIST_OK=/^[A-Za-z' -]{2,40}$/; // a district name, e.g. Kasama
const sameDistrict=(r,did)=>{const d=db.drivers.find(x=>x.id===did);return !r.district||!d||!d.district||r.district===d.district}; // rides/drivers without a district are visible to all
const PAY={airtel:'Airtel Money',mtn:'MTN MoMo',zamtel:'Zamtel Money',cash:'Cash on arrival'};
// District lookup on OpenStreetMap (Nominatim). Cached, and limited to 1 request per second as their policy asks.
const geoCache={};let geoLast=0;
async function geocode(name){
  if(geoCache[name])return geoCache[name];
  const wait=Math.max(0,geoLast+1100-Date.now());geoLast=Date.now()+wait;await new Promise(r=>setTimeout(r,wait));
  try{const r=await fetch('https://nominatim.openstreetmap.org/search?format=json&limit=1&countrycodes=zm&q='+encodeURIComponent(name+' District, Zambia'),{headers:{'User-Agent':'LuwinguRider/1.0 (ride request app)','Accept-Language':'en'},signal:AbortSignal.timeout(8000)});
    const j=await r.json();if(j[0]&&j[0].boundingbox){const b=j[0].boundingbox.map(Number);return geoCache[name]={bounds:[[b[0],b[2]],[b[1],b[3]]]}}}catch{}
  return null}
const clean=(v,n=100)=>String(v||'').trim().slice(0,n);
const MIME={'.html':'text/html','.css':'text/css','.js':'text/javascript'};
const okPhoto=s=>typeof s==='string'&&s.length<450000&&/^data:image\/jpeg;base64,[A-Za-z0-9+\/=]+$/.test(s); // small JPEGs, shrunk in the browser
const pub=d=>({photos:!!d.photos,id:d.id,name:d.name,phone:d.phone,vehicle:d.vehicle,plate:d.plate,district:d.district,status:d.status,created:d.created});
const rideView=r=>{const d=db.drivers.find(x=>x.id===r.driverId);return {...r,driver:d?{name:d.name,phone:d.phone,vehicle:d.vehicle,plate:d.plate,photos:!!d.photos}:null}};
const send=(res,code,obj)=>{res.writeHead(code,{'Content-Type':'application/json'});res.end(JSON.stringify(obj))};
const auth=(req,role)=>{const s=sessions[(req.headers.authorization||'').replace('Bearer ','')];return s&&s.role===role?s:null};
const body=req=>new Promise(r=>{let b='';req.on('data',c=>{b+=c;if(b.length>2e6)req.destroy()});req.on('end',()=>{try{r(JSON.parse(b||'{}'))}catch{r({})}})});

async function api(req,res,p){
  const m=req.method, b=m==='POST'?await body(req):{}; let x;
  if(m==='GET'&&p==='/api/fare'){const s=new URL(req.url,'http://x').searchParams,v=['pLat','pLng','dLat','dLng'].map(k=>num(s.get(k)));
    if(v.some(z=>z==null)) return send(res,400,{error:'Missing map pins.'});return send(res,200,await quote(...v))}
  if(m==='GET'&&p==='/api/geocode'){const n=new URL(req.url,'http://x').searchParams.get('name')||'';
    if(!/^[A-Za-z' -]{2,40}$/.test(n)) return send(res,400,{error:'Bad name.'});
    const g=await geocode(n);if(!g) return send(res,404,{error:'Not found.'});
    res.writeHead(200,{'Content-Type':'application/json','Cache-Control':'public, max-age=86400'});return res.end(JSON.stringify(g))}
  if(m==='GET'&&p==='/api/config') return send(res,200,{perKm:PER_KM});
  if(m==='POST'&&p==='/api/rides'){ // passenger requests a ride
    const r={id:uid(),name:clean(b.name),phone:clean(b.phone,20),pickup:clean(b.pickup,150),dropoff:clean(b.dropoff,150),pLat:num(b.pLat),pLng:num(b.pLng),dLat:num(b.dLat),dLng:num(b.dLng),payment:PAY[clean(b.payment,10)]?clean(b.payment,10):'',district:DIST_OK.test(clean(b.district,40))?clean(b.district,40):'',status:'pending',driverId:null,created:Date.now()};
    if(!r.name||!r.phone||!r.pickup||!r.dropoff) return send(res,400,{error:'Fill in all fields.'});
    if(!r.payment) return send(res,400,{error:'Choose how you will pay.'});
    if(r.pLat!=null&&r.dLat!=null){const q=await quote(r.pLat,r.pLng,r.dLat,r.dLng);r.km=q.km;r.fare=q.fare;r.road=q.road}
    db.rides.push(r);save();pushNew(r);return send(res,200,rideView(r));
  }
  if(m==='GET'&&(x=p.match(/^\/api\/rides\/(\w+)\/photo\/(passport|bike)$/))){ // passenger sees the driver's pictures only while the driver is on the way
    const r=db.rides.find(q=>q.id===x[1]);const ph=r&&r.status==='accepted'&&r.driverId&&db.photos.find(q=>q.id===r.driverId+'-'+x[2]);
    return ph?send(res,200,{image:ph.image}):send(res,404,{error:'No picture.'})}
  if((x=p.match(/^\/api\/rides\/(\w+)(\/cancel)?$/))){
    const r=db.rides.find(q=>q.id===x[1]); if(!r) return send(res,404,{error:'Ride not found.'});
    if(x[2]&&m==='POST'){ if(r.status==='pending'||r.status==='accepted'){r.status='cancelled';save()} }
    return send(res,200,rideView(r));
  }
  if(m==='GET'&&p==='/api/push/key') return wp?send(res,200,{key:vapid.publicKey}):send(res,503,{error:'Phone notifications are not set up on this server.'});
  if(m==='POST'&&p==='/api/driver/register'){
    const d={id:uid(),name:clean(b.name),phone:clean(b.phone,20),vehicle:clean(b.vehicle),plate:clean(b.plate,20),license:clean(b.license,40),district:clean(b.district,40),status:'pending',salt:uid(),created:Date.now()};
    if(!d.name||!d.phone||!d.vehicle||!d.plate||!d.license||clean(b.password,100).length<6) return send(res,400,{error:'Fill in all fields. Password needs 6+ characters.'});
    if(!DIST_OK.test(d.district)) return send(res,400,{error:'Choose your district.'});
    if(!okPhoto(b.passport)||!okPhoto(b.bike)) return send(res,400,{error:'Add both pictures: your passport-size photo and your motorbike.'});
    if(db.drivers.some(q=>q.phone===d.phone)) return send(res,400,{error:'This phone number is already registered.'});
    d.hash=hash(clean(b.password,100),d.salt);d.photos=true;db.drivers.push(d);db.photos.push({id:d.id+'-passport',image:b.passport},{id:d.id+'-bike',image:b.bike});save();return send(res,200,{ok:true});
  }
  if(m==='POST'&&p==='/api/driver/login'){
    const d=db.drivers.find(q=>q.phone===clean(b.phone,20));
    if(!d||hash(clean(b.password,100),d.salt)!==d.hash) return send(res,401,{error:'Wrong phone or password.'});
    if(d.status!=='approved') return send(res,403,{error:d.status==='pending'?'Your registration is waiting for admin approval.':'Your registration was rejected.'});
    const t=uid()+uid();sessions[t]={role:'driver',id:d.id};return send(res,200,{token:t,name:d.name});
  }
  if(p.startsWith('/api/driver/')){
    const s=auth(req,'driver'); if(!s) return send(res,401,{error:'Please log in.'});
    if(m==='POST'&&(p==='/api/driver/push'||p==='/api/driver/push/off')){
      const d=db.drivers.find(q=>q.id===s.id),sub=p==='/api/driver/push'?b.subscription:b;
      if(!d||!sub||typeof sub.endpoint!=='string') return send(res,400,{error:'Bad subscription.'});
      d.push=(d.push||[]).filter(q=>q.endpoint!==sub.endpoint);
      if(p==='/api/driver/push'){if(!sub.keys) return send(res,400,{error:'Bad subscription.'});d.push.push({endpoint:sub.endpoint,keys:{p256dh:String(sub.keys.p256dh),auth:String(sub.keys.auth)}});d.push=d.push.slice(-5)}
      save();return send(res,200,{ok:true})}
    if(m==='GET'&&p==='/api/driver/rides') return send(res,200,{
      open:db.rides.filter(r=>r.status==='pending'&&sameDistrict(r,s.id)).reverse(),district:(db.drivers.find(x=>x.id===s.id)||{}).district||'',
      mine:db.rides.filter(r=>r.driverId===s.id&&r.status==='accepted').reverse(),
      done:db.rides.filter(r=>r.driverId===s.id&&r.status==='completed').length});
    if((x=p.match(/^\/api\/driver\/rides\/(\w+)\/(accept|complete)$/))&&m==='POST'){
      const r=db.rides.find(q=>q.id===x[1]); if(!r) return send(res,404,{error:'Ride not found.'});
      if(x[2]==='accept'){ if(!sameDistrict(r,s.id)) return send(res,403,{error:'This ride is in another district.'}); if(r.status!=='pending') return send(res,409,{error:'Another driver already took this ride.'}); r.status='accepted';r.driverId=s.id}
      else if(r.driverId===s.id&&r.status==='accepted') r.status='completed';
      save();return send(res,200,{ok:true});
    }
  }
  if(m==='POST'&&p==='/api/admin/login'){
    if(b.password!==ADMIN_PASSWORD) return send(res,401,{error:'Wrong admin password.'});
    const t=uid()+uid();sessions[t]={role:'admin'};return send(res,200,{token:t});
  }
  if(p.startsWith('/api/admin/')){
    if(!auth(req,'admin')) return send(res,401,{error:'Please log in.'});
    if(m==='GET'&&(x=p.match(/^\/api\/admin\/drivers\/(\w+)\/photo\/(passport|bike)$/))){const ph=db.photos.find(q=>q.id===x[1]+'-'+x[2]);return ph?send(res,200,{image:ph.image}):send(res,404,{error:'No picture.'})}
    if(m==='GET'&&p==='/api/admin/data') return send(res,200,{drivers:db.drivers.map(pub).map(d=>({...d,license:db.drivers.find(q=>q.id===d.id).license})),rides:db.rides.slice().reverse().map(rideView)});
    if((x=p.match(/^\/api\/admin\/drivers\/(\w+)\/(approve|reject|delete)$/))&&m==='POST'){
      const d=db.drivers.find(q=>q.id===x[1]); if(!d) return send(res,404,{error:'Driver not found.'});
      if(x[2]==='delete'){db.drivers=db.drivers.filter(q=>q!==d);db.photos=db.photos.filter(q=>!q.id.startsWith(d.id+'-'))} else d.status=x[2]==='approve'?'approved':'rejected';
      save();return send(res,200,{ok:true});
    }
  }
  send(res,404,{error:'Not found.'});
}

const handler=(req,res)=>{
  const p=decodeURIComponent(req.url.split('?')[0]);
  if(p.startsWith('/api/')) return api(req,res,p).catch(e=>send(res,500,{error:'Server error.'}));
  const pages={'/':'index.html','/driver':'driver.html','/admin':'admin.html'};
  const f=path.join(PUB,pages[p]||p);
  if(!f.startsWith(PUB)||!fs.existsSync(f)||fs.statSync(f).isDirectory()){res.writeHead(404);return res.end('Not found')}
  res.writeHead(200,{'Content-Type':MIME[path.extname(f)]||'application/octet-stream'});fs.createReadStream(f).pipe(res);
};
const boot=()=>http.createServer(handler).listen(PORT,'0.0.0.0',()=>{
  console.log('\nLuwingu Rider is running.\n  This laptop:   http://localhost:'+PORT);
  for(const l of Object.values(os.networkInterfaces()).flat()) if(l.family==='IPv4'&&!l.internal) console.log('  Other phones/laptops on the same Wi-Fi:  http://'+l.address+':'+PORT);
  console.log('  Drivers: /driver    Admin: /admin  (password: '+ADMIN_PASSWORD+')\n');
});
loadDatabase().then(boot).catch(e=>{console.error('Could not start:',e.message);process.exit(1)});
