// Sidequests classic page. Plain JavaScript, no framework. Loaded by index.html.
// events.json is untrusted input (scraped from other sites): always esc() text and safeHref() links before using them in HTML.
const $=id=>document.getElementById(id);
const CHIPS=["art","classes","run club","comedy","food","music","networking","wellness","books"];
const COLORS=["blush","blue","peri","mustard","apricot"];
const BLOCKS=["blush","blue","peri","mustard"];
const QUICK=[["tonight","Tonight"],["weekend","This weekend"],["free","Free only"]];
const TZS={Chicago:"America/Chicago",NYC:"America/New_York"};
const VTZ={"America/Chicago":["CST","-0600","CDT","-0500"],"America/New_York":["EST","-0500","EDT","-0400"]};
const NAMES={luma:"Luma",eventbrite:"Eventbrite",partiful:"Partiful",pie:"Pie",do312:"Do312",donyc:"DoNYC",cpl:"Chicago Public Library",cpd:"Chicago Park District",coursehorse:"CourseHorse",ra:"Resident Advisor",ticketmaster:"Ticketmaster"};
const ICONS={
  heart:'<svg viewBox="0 0 24 24"><path d="M12 21s-7-4.4-9.3-9C1 8.6 3 5 6.5 5c2 0 3.5 1 5.5 3 2-2 3.5-3 5.5-3C21 5 23 8.6 21.3 12 19 16.6 12 21 12 21z"/></svg>',
  gcal:'<svg viewBox="0 0 24 24"><rect x="3.5" y="5" width="17" height="15.5" rx="2.5"/><path d="M3.5 10h17M8 3v4M16 3v4M12 12.5v5M9.5 15h5"/></svg>',
  cal:'<svg viewBox="0 0 24 24"><rect x="3.5" y="5" width="17" height="15.5" rx="2.5"/><path d="M3.5 10h17M8 3v4M16 3v4M12 12.5v5.5M9.5 16l2.5 2.5 2.5-2.5"/></svg>'};
const ls={
  get(k,d){try{const v=localStorage.getItem(k);return v==null?d:JSON.parse(v)}catch(e){return d}},
  set(k,v){try{localStorage.setItem(k,JSON.stringify(v))}catch(e){}}
};
const PER=20;
let events=[],byUrl=new Map(),groups=[],counts={},updated=null,city="Chicago",tab="all",page=1;
const quick={tonight:false,weekend:false,free:false};
try{const c=localStorage.getItem("city");if(TZS[c])city=c}catch(e){}
let saved=new Set((a=>Array.isArray(a)?a:[])(ls.get("saved",[])));
let fresh=new Set();
const tzOf=e=>TZS[e.city]||TZS.Chicago;
// Everything in events.json came from scraped third party sites, so it is untrusted: escape before it goes into HTML...
const esc=s=>String(s).replace(/[&<>"'`]/g,c=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;","`":"&#96;"}[c]));
// ...and only ever link to http(s) addresses (a javascript: link in an href runs when clicked).
const safeHref=u=>/^https?:\/\//i.test(String(u))?String(u):"#";
const dayKey=(d,tz)=>d.toLocaleDateString("en-CA",{timeZone:tz});
const live=e=>+new Date(e.start)+2*36e5>=Date.now();

function parts(d,tz){
  const o={};
  for(const p of new Intl.DateTimeFormat("en-CA",{timeZone:tz,year:"numeric",month:"2-digit",day:"2-digit",hour:"2-digit",minute:"2-digit",second:"2-digit",hourCycle:"h23"}).formatToParts(d))o[p.type]=p.value;
  return o;
}
const dayNum=(d,tz)=>{const p=parts(d,tz);return Date.UTC(p.year,p.month-1,p.day)/864e5};
const dow=n=>new Date(n*864e5).getUTCDay();
function inQuick(e){
  const tz=tzOf(e),d=new Date(e.start),now=new Date();
  if(quick.free&&!e.is_free)return false;
  if(quick.tonight||quick.weekend){
    if(!live(e))return false;
    const day=dayNum(d,tz),today=dayNum(now,tz),h=+parts(d,tz).hour;
    if(quick.tonight&&!(day===today&&h>=17))return false;
    if(quick.weekend){
      const w=dow(today),fri=w===0?today-2:w===6?today-1:w===5?today:today+(5-w);
      if(!(day>=fri&&day<=fri+2&&(day>fri||h>=17)))return false;
    }
  }
  return true;
}

// NEW pills: compare against the list stored at the previous visit. A visit within 30 minutes
// of the stored one keeps that baseline so the pills survive a reload.
function markNew(){
  const s=ls.get("visit",null),now=Date.now(),cur=events.map(e=>e.url);
  if(s&&Array.isArray(s.urls)){
    if(now-s.t<30*6e4){fresh=new Set(s.fresh||[]);return}
    const prev=new Set(s.urls);
    fresh=new Set(cur.filter(u=>!prev.has(u)));
  }
  ls.set("visit",{t:now,urls:cur,fresh:[...fresh]});
}

const v=Date.now();
Promise.all([fetch("events.json?v="+v).then(r=>r.json()),fetch("synonyms.json?v="+v).then(r=>r.json())]).then(([d,s])=>{
  // keep only well formed records, so one bad entry cannot break the page
  events=(Array.isArray(d.events)?d.events:[]).filter(e=>e&&typeof e.title==="string"&&typeof e.url==="string"&&/^https?:\/\/\S+$/i.test(e.url)&&typeof e.start==="string"&&!isNaN(Date.parse(e.start)));
  groups=buildGroups(s);counts=d.counts;updated=new Date(d.last_updated);
  byUrl=new Map(events.map(e=>[e.url,e]));
  markNew();
  buildCities();
  render();
}).catch(e=>$("status").textContent="Failed to load events: "+e);

$("chips").innerHTML=CHIPS.map((c,i)=>`<button class="chip" data-q="${c}" style="background:var(--${COLORS[i%COLORS.length]})">${c}</button>`).join("");
$("chips").addEventListener("click",e=>{
  const b=e.target.closest(".chip");if(!b)return;
  $("q").value=$("q").value.trim().toLowerCase()===b.dataset.q?"":b.dataset.q;page=1;render();
});
$("quick").innerHTML=QUICK.map(([k,l])=>`<button class="qc" data-k="${k}">${l}</button>`).join("");
$("quick").addEventListener("click",e=>{
  const b=e.target.closest(".qc");if(!b)return;
  quick[b.dataset.k]=!quick[b.dataset.k];page=1;render();
});
document.querySelector(".tabs").addEventListener("click",e=>{
  const b=e.target.closest(".tab");if(!b)return;
  tab=b.dataset.t;page=1;render();
});
function buildCities(){
  const list=Object.keys(counts).filter(c=>TZS[c]);
  if(!list.includes(city))city=list[0]||"Chicago";
  $("cities").hidden=list.length<2;
  $("cities").innerHTML=list.map(c=>`<button class="city" data-c="${c}" aria-pressed="false">${c}</button>`).join("");
}
$("cities").addEventListener("click",e=>{
  const b=e.target.closest(".city");if(!b)return;
  city=b.dataset.c;try{localStorage.setItem("city",city)}catch(e){}page=1;render();
});
$("status").addEventListener("click",()=>{const o=$("srcs").hidden;$("srcs").hidden=!o;$("status").setAttribute("aria-expanded",o)});
$("q").addEventListener("input",()=>{page=1;render()});
$("hide").addEventListener("change",()=>{page=1;render()});
$("pager").addEventListener("click",e=>{
  const b=e.target.closest("button");if(!b||b.disabled)return;
  page+=b.dataset.d==="next"?1:-1;render();
  $("list").scrollIntoView({behavior:"smooth",block:"start"});
});
$("list").addEventListener("click",e=>{
  const b=e.target.closest("[data-act]");if(!b)return;
  const ev=byUrl.get(b.closest(".card").dataset.u);if(!ev)return;
  if(b.dataset.act==="cal")return download(ev);
  if(b.dataset.act==="gcal")return window.open(gcalUrl(ev),"_blank","noopener,noreferrer");
  saved.has(ev.url)?saved.delete(ev.url):saved.add(ev.url);
  ls.set("saved",[...saved]);
  tab==="saved"?render():(b.classList.toggle("on",saved.has(ev.url)),count());
});

// ---- calendar file (generated in the browser) ----
const ical=t=>String(t||"").replace(/[\;,]/g,"\\$&").replace(/\r?\n/g,"\\n");
const fold=l=>{let o="";while(l.length>74){o+=l.slice(0,74)+"\r\n ";l=l.slice(74)}return o+l};
const stamp=(d,tz)=>{const p=parts(d,tz);return p.year+p.month+p.day+"T"+p.hour+p.minute+p.second};
const hash=s=>{let x=0;for(const c of s)x=(x*31+c.charCodeAt(0))|0;return(x>>>0).toString(36)};
function gcalUrl(e){
  const s=new Date(e.start),en=new Date(+s+2*36e5),z=d=>stamp(d,"UTC")+"Z";
  return "https://calendar.google.com/calendar/render?action=TEMPLATE"+
    "&text="+encodeURIComponent(e.title)+"&dates="+z(s)+"/"+z(en)+
    "&details="+encodeURIComponent(e.url)+"&location="+encodeURIComponent(e.venue||"");
}
function download(e){
  const tz=tzOf(e),[sn,so,dn,dof]=VTZ[tz],s=new Date(e.start),en=new Date(+s+2*36e5);
  const lines=["BEGIN:VCALENDAR","VERSION:2.0","PRODID:-//sidequests//EN","CALSCALE:GREGORIAN",
    "BEGIN:VTIMEZONE","TZID:"+tz,
    "BEGIN:DAYLIGHT","TZOFFSETFROM:"+so,"TZOFFSETTO:"+dof,"TZNAME:"+dn,"DTSTART:19700308T020000","RRULE:FREQ=YEARLY;BYMONTH=3;BYDAY=2SU","END:DAYLIGHT",
    "BEGIN:STANDARD","TZOFFSETFROM:"+dof,"TZOFFSETTO:"+so,"TZNAME:"+sn,"DTSTART:19701101T020000","RRULE:FREQ=YEARLY;BYMONTH=11;BYDAY=1SU","END:STANDARD",
    "END:VTIMEZONE","BEGIN:VEVENT","UID:"+hash(e.url)+"@sidequests","DTSTAMP:"+stamp(new Date(),"UTC")+"Z",
    `DTSTART;TZID=${tz}:${stamp(s,tz)}`,`DTEND;TZID=${tz}:${stamp(en,tz)}`,
    "SUMMARY:"+ical(e.title),"LOCATION:"+ical(e.venue),"URL:"+safeHref(e.url).replace(/[\r\n]/g,""),"DESCRIPTION:"+ical(e.url),"END:VEVENT","END:VCALENDAR"];
  const a=document.createElement("a");
  a.href=URL.createObjectURL(new Blob([lines.map(fold).join("\r\n")+"\r\n"],{type:"text/calendar;charset=utf-8"}));
  a.download=(e.title.toLowerCase().replace(/[^a-z0-9]+/g,"-").replace(/^-|-$/g,"").slice(0,40)||"event")+".ics";
  document.body.appendChild(a);a.click();a.remove();
  setTimeout(()=>URL.revokeObjectURL(a.href),1000);
}

// stemming: strip common endings so "runners", "running" and "run" match
function stem(w){
  let x=w,cut=false;
  for(const suf of["ing","ers","er","es","s"])
    if(x.length>suf.length+2&&x.endsWith(suf)&&!(suf==="s"&&x.endsWith("ss"))){x=x.slice(0,-suf.length);cut=suf!=="s"&&suf!=="es";break}
  if(cut&&/([^aeioulsz])\1$/.test(x))x=x.slice(0,-1);
  if(x.length>3&&x.endsWith("e"))x=x.slice(0,-1);
  return x;
}
const toks=t=>(String(t).toLowerCase().match(/[a-z0-9]+/g)||[]).map(stem);
const key=t=>toks(t).join(" ");
function buildGroups(raw){return raw.map(g=>({words:g,keys:new Set(g.map(key))}))}
// typing any word or phrase in a group matches the whole group
function terms(q){
  const k=key(q);if(!k)return{keys:[],shown:[]};
  const keys=new Set([k]),shown=[];
  for(const g of groups)if(g.keys.has(k))g.words.forEach(w=>{const wk=key(w);if(wk!==k&&!keys.has(wk)){keys.add(wk);shown.push(w)}});
  return{keys:[...keys],shown};
}
const hay=e=>e._h||(e._h=" "+toks(e.title+" "+e.description).join(" ")+" ");
const venueName=s=>((s||"").split(",").map(p=>p.trim()).filter(Boolean))[0]||"";
function header(d,tz){
  const k=dayKey(d,tz),now=new Date();
  if(k===dayKey(now,tz))return"Today";
  if(k===dayKey(new Date(+now+864e5),tz))return"Tomorrow";
  return d.toLocaleDateString("en-US",{timeZone:tz,weekday:"short",month:"short",day:"numeric"});
}
function pills(e){
  const p=[];
  if(fresh.has(e.url))p.push('<span class="pill new">NEW</span>');
  if(e.waitlist)p.push('<span class="pill wait">WAITLIST</span>');
  else if(e.sold_out)p.push('<span class="pill sold">SOLD OUT</span>');
  if(e.is_free)p.push(`<span class="pill free">${e.price_source==="c"?"~FREE":"FREE"}</span>`);
  else if(/click for \$/i.test(e.price_text||""))p.push(`<span class="pill click">${esc(e.price_text)}</span>`);
  else if(e.price_text)p.push(`<span class="pill">${esc(e.price_text)}</span>`);
  if(e.original_price_text)p.push(`<span class="pill"><s>${esc(e.original_price_text)}</s></span>`);
  if(e.age_min)p.push(`<span class="pill age">${e.age_min}+</span>`);
  if(e.few_left&&!e.sold_out)p.push('<span class="pill few">few left</span>');
  if(e.interested_count>0){const n=e.interested_count;p.push(`<span class="pill">🔥 ${n>=1000?(n/1000).toFixed(1).replace(/\.0$/,"")+"k":n}</span>`)}
  return p.length?`<div class="pills">${p.join("")}</div>`:"";
}
const savedList=()=>events.filter(e=>saved.has(e.url)&&live(e));
function count(){$("sc").textContent=savedList().length}
function render(){
  document.querySelectorAll(".city").forEach(c=>{const on=c.dataset.c===city;c.classList.toggle("on",on);c.setAttribute("aria-pressed",on);c.textContent=(on?"✓ ":"")+c.dataset.c});
  document.querySelectorAll(".tab").forEach(t=>t.classList.toggle("on",t.dataset.t===tab));
  document.querySelectorAll(".qc").forEach(c=>c.classList.toggle("on",quick[c.dataset.k]));
  count();
  const per={};for(const e of events)if(e.city===city)per[e.source]=(per[e.source]||0)+1;
  const srcs=Object.entries(per).sort((a,b)=>b[1]-a[1]),total=srcs.reduce((n,[,v])=>n+v,0);
  const m=updated?Math.max(0,Math.round((Date.now()-updated)/6e4)):0;
  const ago=m<60?(m<1?"just now":m+"m ago"):m<1440?Math.round(m/60)+"h ago":Math.round(m/1440)+"d ago";
  $("status").textContent=total+" events · "+srcs.length+" sources · updated "+ago;
  $("srcs").innerHTML=srcs.map(([k,v])=>`<span class="badge ${esc(k)}">${esc(NAMES[k]||k)} ${v}</span>`).join("");
  const q=$("q").value,tm=terms(q),ts=tm.keys,hide=$("hide").checked;
  document.querySelectorAll(".chip").forEach(c=>c.classList.toggle("on",c.dataset.q===q.trim().toLowerCase()));
  $("terms").textContent=tab==="all"&&tm.shown.length?"also matching: "+tm.shown.join(", "):"";
  const list=(tab==="saved"?savedList():events.filter(e=>e.city===city&&!(hide&&e.sold_out)&&inQuick(e)&&(!ts.length||ts.some(t=>hay(e).includes(" "+t+" ")))))
    .sort((a,b)=>new Date(a.start)-new Date(b.start));
  const pages=Math.max(1,Math.ceil(list.length/PER));page=Math.min(page,pages);
  $("pager").hidden=pages<2;
  $("pager").innerHTML=`<button data-d="prev"${page<2?" disabled":""}>Prev</button><span>Page ${page} of ${pages}</span><button data-d="next"${page>=pages?" disabled":""}>Next</button>`;
  if(!list.length){$("list").innerHTML='<div class="empty">'+(tab==="saved"?"Nothing saved yet. Tap the heart on an event.":"No matches. Try a broader word.")+'</div>';return}
  let html="",last="",n=-1;
  for(const e of list.slice((page-1)*PER,page*PER)){
    const d=new Date(e.start),tz=tzOf(e),hd=header(d,tz);
    if(hd!==last){if(last)html+="</section>";n++;html+=`<section class="day" style="--c:var(--${BLOCKS[n%BLOCKS.length]})"><h2>${esc(hd)}</h2>`;last=hd}
    const t=d.toLocaleTimeString("en-US",{timeZone:tz,hour:"numeric",minute:"2-digit"});
    const vn=venueName(e.venue);
    html+=`<div class="card${e.sold_out?" soldout":""}" data-u="${esc(e.url)}"><a class="main" href="${esc(safeHref(e.url))}" target="_blank" rel="noopener noreferrer"><div class="time">${t}</div><div class="body"><div class="title">${esc(e.title)}</div><div class="row">${vn?`<span class="venue">${esc(vn)}</span>`:""}<span class="badge ${esc(e.source)}">${esc(NAMES[e.source]||e.source)}</span></div>${pills(e)}</div></a><div class="acts"><button class="ic${saved.has(e.url)?" on":""}" data-act="save" aria-label="save event" title="Save">${ICONS.heart}</button><button class="ic" data-act="gcal" aria-label="add to Google Calendar" title="Add to Google Calendar">${ICONS.gcal}</button><button class="ic" data-act="cal" aria-label="download calendar file for Apple Calendar" title="Download .ics (Apple Calendar)">${ICONS.cal}</button></div></div>`;
  }
  $("list").innerHTML=html+"</section>";
}
