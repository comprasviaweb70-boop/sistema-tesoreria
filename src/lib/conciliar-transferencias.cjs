require("dotenv").config();
const fs=require("fs"),path=require("path");
const argv=process.argv.slice(2);
const P={};
for(let i=0;i<argv.length;i++){if(argv[i]==="--cartola")P.cartola=argv[++i];if(argv[i]==="--desde")P.desde=argv[++i];if(argv[i]==="--hasta")P.hasta=argv[++i];}
if(!P.cartola){console.error("Uso:...--cartola<file>");process.exit(1);}
const BU=process.env.BSALE_WEB_USER,BP=process.env.BSALE_WEB_PASS;
const BAK=process.env.BSALE_API_KEY;
if(!BU||!BP){console.error("BSALE_USER/PASS");process.exit(1);}
if(!BAK){console.error("BSALE_API_KEY");process.exit(1);}
const IN=["emporio iciz","julian sanz","julian patricio sanz","onate perez","onate","yonel rene"];
const esI=d=>{const x=(d||"").toLowerCase();return IN.some(p=>x.includes(p));};
const CA=[{v:"35",n:"CAJA 1 N."},{v:"37",n:"CAJA 2 N."},{v:"9",n:"IRMA I."},{v:"30",n:"JACQUELINE Y."}];
const ST=path.join(process.cwd(),".bsale-session.json");
const cL=n=>"$"+Math.round(n).toLocaleString("es-CL");
const fD=d=>d.getUTCFullYear()+"-"+String(d.getUTCMonth()+1).padStart(2,"0")+"-"+String(d.getUTCDate()).padStart(2,"0");
const eSD=s=>new Date(Date.UTC(1899,11,30)+s*86400000);
const pDMY=s=>{const p=String(s).split("/");return p.length===3?p[2]+"-"+p[1].padStart(2,"0")+"-"+p[0].padStart(2,"0"):null;};

// CUTOFF BANCARIO
function cF(gt){
  const d=new Date(gt*1000);
  const cl=new Date(d.getTime()-3*3600000);
  const dw=cl.getUTCDay(),mn=cl.getUTCHours()*60+cl.getUTCMinutes();
  const nM=d2=>{const n=new Date(d2);while(n.getUTCDay()!==1)n.setUTCDate(n.getUTCDate()+1);return fD(n);};
  if(dw===5&&mn>840)return nM(cl);
  if(dw===6)return nM(cl);
  if(dw===0)return nM(cl);
  if(dw===1&&mn<=540)return fD(cl);
  if(mn>840)return fD(new Date(cl.getTime()+86400000));
  return fD(cl);
}

// PARSE CARTOLA
function pC(fp){
  const X=require("xlsx");
  const wb=X.readFile(fp),sh=wb.Sheets[wb.SheetNames[0]],rr=X.utils.sheet_to_json(sh,{header:1,raw:true});
  let hr=-1;for(let i=0;i<Math.min(10,rr.length);i++){if(rr[i]&&rr[i].some(c=>String(c||"").includes("Fecha"))){hr=i;break;}}
  if(hr===-1){console.error("No header");process.exit(1);}
  const h=rr[hr];let cf=-1,cd=-1,ca=-1;
  for(let i=0;i<h.length;i++){const x=String(h[i]||"").toLowerCase();if(x.includes("fecha"))cf=i;if(x.includes("descrip"))cd=i;if(x.includes("abono"))ca=i;}
  console.log("Cartola h="+hr+" f="+cf+" d="+cd+" a="+ca);
  const rs=[];let sk=0;
  for(let i=hr+1;i<rr.length;i++){
    const r=rr[i];if(!r)continue;let fe=r[cf];const de=String(r[cd]||""),ab=Number(r[ca])||0;
    if(!fe&&!de)continue;
    let fs=typeof fe==="number"?eSD(fe).toISOString().split("T")[0]:typeof fe==="string"?pDMY(fe):null;
    if(!fs)continue;
    if(de.includes("Traspaso De:")&&ab>0){
      const n=de.replace("Traspaso De: ","").trim();
      if(esI(n)){sk++;continue;}
      rs.push({fecha:fs,monto:Math.round(ab),detalle:n,source:"cartola"});
    }
  }
  console.log("  "+sk+" internas");return rs;
}

// API BSALE generationDate
async function fG(la){
  const u=la.filter(b=>b.dc);console.log("\nAPI genDate: "+u.length+"...");
  const m={};
  for(let i=0;i<u.length;i+=10){
    await Promise.all(u.slice(i,i+10).map(async b=>{
      try{
        const r=await fetch("https://api.bsale.io/v1/documents/"+b.dc+".json",{headers:{"access_token":BAK}});
        if(!r.ok)return;
        const j=await r.json(),gt=j.generationDate,fc=cF(gt);
        const d=new Date(gt*1000),cl=new Date(d.getTime()-3*3600000);
        const hh=cl.toISOString().split("T")[1].substring(0,5);
        const ds=["Dom","Lun","Mar","Mie","Jue","Vie","Sab"][cl.getUTCDay()];
        m[b.dc]={gt,hh,ds,fc};
        console.log("  #"+b.dn+"("+b.dc+") "+b.rf+" => "+ds+" "+hh+" => "+fc);
      }catch(e){}
    }));
  }
  return m;
}
// SCRAPER
async function scr(de,ha){
  const {chromium}=require("playwright-core");
  console.log("\nScrapeando "+de+" a "+ha+"...");
  const ff=[];let d=new Date(de+"T00:00:00Z"),hh=new Date(ha+"T00:00:00Z");
  while(d<=hh){ff.push(fD(d));d.setUTCDate(d.getUTCDate()+1);}
  console.log("  Dias:"+ff.length+" Cajas:"+CA.length);
  const br=await chromium.launch({headless:true,args:["--disable-blink-features=AutomationControlled"]});
  const ctx=fs.existsSync(ST)?await br.newContext({storageState:ST}):await br.newContext();
  const pg=await ctx.newPage();pg.setDefaultTimeout(15000);
  await pg.goto("https://app.bsale.cl/mobile/close",{waitUntil:"domcontentloaded",timeout:20000});await pg.waitForTimeout(2000);
  if(pg.url().includes("login")){
    console.log("Login...");
    await pg.locator('input[type="text"],input[type="email"]').first().fill(BU);
    await pg.locator('input[type="password"]').first().fill(BP);await pg.locator('input[type="password"]').first().press("Enter");
    let ok=false;for(let i=0;i<25;i++){await pg.waitForTimeout(1000);const u=pg.url();if((u.includes("app.bsale.cl")||u.includes("landing.bsale.cl"))&&!u.includes("login")){ok=true;break;}}
    if(!ok){console.error("Login fail");await br.close();process.exit(1);}
    await ctx.storageState({path:ST});console.log("Login OK");
  }else console.log("Sesion OK");
  const ck=await ctx.cookies();
  await ctx.addCookies(ck.map(c=>({name:c.name,value:c.value,domain:".bsale.cl",path:c.path||"/",httpOnly:c.httpOnly,secure:c.secure,sameSite:"Lax"})));
  const td=[];
  for(const f of ff){
    const p=f.split("-"),fd=p[2]+"/"+p[1]+"/"+p[0];let dc=0;
    for(const c of CA){
      try{
        await pg.goto("https://app2.bsale.cl/mobile/close",{waitUntil:"domcontentloaded",timeout:20000});await pg.waitForTimeout(2000);
        await pg.evaluate(x=>{const inp=document.getElementById("fecha_reporte");if(inp){const s=Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype,"value").set;s.call(inp,x);inp.dispatchEvent(new Event("input",{bubbles:true}));}},fd);
        await pg.waitForTimeout(2000);
        await pg.evaluate(v=>{const sel=document.getElementById("id_vendedor_cierre");if(sel){sel.value=v;sel.dispatchEvent(new Event("change",{bubbles:true}));}},c.v);
        await pg.waitForTimeout(4000);
        const tb=pg.locator("button",{hasText:"TRANSFERENCIA BANCARIA"});
        if(await tb.count()===0)continue;
        await tb.first().click();await pg.waitForTimeout(3000);
        const items=await pg.evaluate(()=>Array.from(document.querySelectorAll("#dsr_docs_detail li.hpc-item")).map(li=>{
          const lb=li.querySelector("label")?.textContent||"";
          const nm=lb.match(/N\u00ba\s*(\d+)/),mm=lb.match(/\$\s*([\d.]+)/);
          const cb=li.querySelector("button[data-code]");
          return{numero:nm?nm[1]:"",monto:mm?parseInt(mm[1].replace(/\./g,"")):0,dataCode:cb?cb.getAttribute("data-code"):null};
        }));
        for(const i of items){td.push({fecha:f,monto:i.monto,dn:i.numero,dc:i.dataCode,cajero:c.n,source:"bsale",rf:f});dc++;}
      }catch(e){}
    }
    if(dc>0)console.log("  "+f+": "+dc);
  }
  await br.close();
  const gm=await fG(td);
  for(const b of td){if(b.dc&&gm[b.dc]){b.fc=gm[b.dc].fc;b.hh=gm[b.dc].hh;}else b.fc=b.fecha;}
  console.log("\n  Total:"+td.length);
  const ch=td.filter(t=>t.fc!==t.fecha);if(ch.length)console.log("  Cutoff:"+ch.length);
  return td;
}

// MATCH
function mh(cT,bT){
  const br=bT.map(t=>({...t,mt:false})),cm=cT.map(t=>({...t,mt:false,bs:null}));
  for(const ct of cm){for(const bt of br){if(bt.mt||ct.monto!==bt.monto||bt.fc!==ct.fecha)continue;ct.mt=true;ct.bs=bt;bt.mt=true;break;}}
  return{mt:cm.filter(t=>t.mt),cs:cm.filter(t=>!t.mt),bs:br.filter(t=>!t.mt)};
}

// REPORT
function rep(r,cT,bT){
  const{mt,cs,bs}=r;const s=a=>a.reduce((s,t)=>s+t.monto,0);
  console.log("\n=== CONCILIACION (cutoff) ===");
  console.log("  Cartola: "+cT.length+" "+cL(s(cT)));
  console.log("  BSale:   "+bT.length+" "+cL(s(bT)));
  console.log("  OK:      "+mt.length+" "+cL(s(mt)));
  console.log("  C sin B: "+cs.length+" "+cL(s(cs)));
  console.log("  B sin C: "+bs.length+" "+cL(s(bs)));
  if(cs.length){console.log("\nCARTOLA SIN BSALE:");[...cs].sort((a,b)=>a.fecha.localeCompare(b.fecha)).forEach(t=>console.log("  "+t.fecha+" "+cL(t.monto).padStart(14)+" "+t.detalle));}
  if(bs.length){console.log("\nBSALE SIN CARTOLA:");[...bs].sort((a,b)=>a.fecha.localeCompare(b.fecha)).forEach(t=>console.log("  "+t.fecha+"->"+(t.fc!==t.fecha?t.fc:"")+" "+(t.hh||"--:--")+" "+cL(t.monto).padStart(14)+" #"+t.dn+" "+t.cajero));}
  const fix=mt.filter(x=>x.bs&&x.bs.fc!==x.bs.fecha);
  if(fix.length){console.log("\nFIXED por cutoff: "+fix.length);fix.forEach(x=>{const b=x.bs;console.log("  "+x.fecha+" "+b.fecha+"->"+b.fc+" "+(b.hh||"--:--")+" "+cL(x.monto).padStart(14)+" #"+b.dn+" "+b.cajero);});}
}

// MAIN
(async()=>{try{
  console.log("\nLeyendo cartola: "+P.cartola);
  const cT=pC(P.cartola);
  console.log("  "+cT.length+" transfers "+cL(cT.reduce((s,t)=>s+t.monto,0)));
  let d=P.desde,h=P.hasta;if(!d||!h){const fs=cT.map(t=>t.fecha).sort();d=d||fs[0];h=h||fs[fs.length-1];}
  const cF=cT.filter(t=>t.fecha>=d&&t.fecha<=h);
  console.log("  Rango: "+d+" a "+h+" ("+cF.length+")");
  // Scrape 3 days before to catch weekend cutoff
  const sd=new Date(d+"T00:00:00Z");sd.setUTCDate(sd.getUTCDate()-3);
  const sD=sd.toISOString().split("T")[0];
  console.log("  Scraping BSale "+sD+" a "+h);
  const bT=await scr(sD,h);
  console.log("\nConciliando...");
  rep(mh(cF,bT),cF,bT);
  process.exit(0);
}catch(e){console.error("ERROR:",e?.message||e);if(e?.stack)console.error(e.stack);process.exit(1);}})();
