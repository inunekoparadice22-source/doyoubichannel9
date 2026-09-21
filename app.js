const $ = (s) => document.querySelector(s);
const views = ["loadingView","errorView","startView","prelimView","prelimDoneView","mainIntroView","mainView","finalistsView","finalView","resultView"].map(id=>$("#"+id));
const STORAGE_KEY = "ikemendaisuki:flow:v1";
const ORIGINAL_DATA_URL = "https://raw.githubusercontent.com/hima-mitei/sukigao9/main/data/members.json";
const GROUP_NAMES = {
  "20th-century":"20th Century","news":"NEWS","super-eight":"SUPER EIGHT","hey-say-jump":"Hey! Say! JUMP",
  "kis-my-ft2":"Kis-My-Ft2","timelesz":"timelesz","abc-z":"A.B.C-Z","west":"WEST.","king-prince":"King & Prince",
  "sixtones":"SixTONES","snow-man":"Snow Man","travis-japan":"Travis Japan","naniwa-danshi":"なにわ男子","ae-group":"Aぇ! group","4u":"ふぉ〜ゆ〜",
  "acees":"ACEes","key-to-lit":"KEY TO LIT","b-zai":"B&ZAI","howzit":"Howzit","ambitious":"AmBitious","boys-be":"Boys be"
};
let allMembers = [], memberMap = new Map(), state = null;

function showOnly(view){ views.forEach(v=>v.classList.add("hidden")); view.classList.remove("hidden"); }
function randInt(max){ const a=new Uint32Array(1); crypto.getRandomValues(a); return a[0]%max; }
function shuffle(arr){ const a=[...arr]; for(let i=a.length-1;i>0;i--){ const j=randInt(i+1); [a[i],a[j]]=[a[j],a[i]]; } return a; }
function chunk(arr,size){ const out=[]; for(let i=0;i<arr.length;i+=size) out.push(arr.slice(i,i+size)); return out; }
function balancedGroups(arr,maxSize=6){
  const a=[...arr];
  if(a.length<=maxSize) return [a];
  const groupCount=Math.ceil(a.length/maxSize);
  const base=Math.floor(a.length/groupCount);
  const extra=a.length%groupCount;
  const out=[]; let at=0;
  for(let i=0;i<groupCount;i++){
    const size=base+(i<extra?1:0);
    out.push(a.slice(at,at+size)); at+=size;
  }
  return out;
}
function groupName(m){ return m.group || GROUP_NAMES[m.groupId] || (m.groupId ? m.groupId : "個人"); }
function save(){ if(!state) return; state.updatedAt=new Date().toISOString(); localStorage.setItem(STORAGE_KEY,JSON.stringify(state)); }
function load(){ try{return JSON.parse(localStorage.getItem(STORAGE_KEY)||"null");}catch{return null} }
function clearState(){ localStorage.removeItem(STORAGE_KEY); state=null; }
function localPhotoPath(m){ return m.localPhoto || `./assets/photos/${m.id}.jpg`; }
function imageCandidates(m){
  const arr=[];
  // localPhoto を明示した場合は最優先。通常は公開プロフィール画像を使い、
  // 外部画像が切れた場合だけ assets/photos/<id>.jpg をフォールバックにする。
  if(m.localPhoto) arr.push(m.localPhoto);
  if(m.imageUrl) arr.push(m.imageUrl);
  if(m.portrait?.imageUrl) arr.push(m.portrait.imageUrl);
  if(m.category!=="starto"&&!m.localPhoto) arr.push(localPhotoPath(m));
  return [...new Set(arr.filter(Boolean))];
}
function wireImage(img, fallback, member){
  const urls=imageCandidates(member); let i=0;
  img.referrerPolicy="no-referrer";
  img.loading="lazy";
  img.decoding="async";
  const tryNext=()=>{
    if(i>=urls.length){ img.style.display="none"; fallback.style.display="grid"; return; }
    img.src=urls[i++]; img.alt=member.name; img.style.display="block"; fallback.style.display="none";
  };
  img.onerror=tryNext; tryNext();
}

async function loadData(){
  let original=[]; let originalError=null;
  try{
    const r=await fetch(ORIGINAL_DATA_URL,{cache:"no-store"});
    if(!r.ok) throw new Error(`STARTO元データ HTTP ${r.status}`);
    const d=await r.json();
    original=(d.members||[]).filter(m=>m.eligible!==false&&m.enabled!==false).map(m=>({...m,category:"starto",group:GROUP_NAMES[m.groupId]||null}));
  }catch(e){ originalError=e; }
  const er=await fetch("./data/extra-members.json",{cache:"no-store"});
  if(!er.ok) throw new Error(`追加メンバー HTTP ${er.status}`);
  const extraDoc=await er.json();
  const extra=extraDoc.members||[];
  allMembers=[...original,...extra];
  memberMap=new Map(allMembers.map(m=>[m.id,m]));
  if(originalError) console.warn(originalError);
  return {originalCount:original.length,extraCount:extra.length,originalError};
}

function selectedFilterIds(){
  const useStarto=$("#filterStarto").checked, useUngrouped=$("#filterUngrouped").checked, useActors=$("#filterActors").checked;
  return allMembers.filter(m=>m.category==="starto"?useStarto:m.category==="junior_ungrouped"?useUngrouped:m.category==="actor"?useActors:false).map(m=>m.id);
}
function updateStartCounts(){
  const cStarto=allMembers.filter(m=>m.category==="starto").length;
  const cUng=allMembers.filter(m=>m.category==="junior_ungrouped").length;
  const cAct=allMembers.filter(m=>m.category==="actor").length;
  $("#countStarto").textContent=`(${cStarto}人)`; $("#countUngrouped").textContent=`(${cUng}人)`; $("#countActors").textContent=`(${cAct}人)`;
  const n=selectedFilterIds().length; $("#memberCount").textContent=n; $("#prelimScreensPreview").textContent=`約${Math.ceil(n/8)}画面`;
  $("#startBtn").disabled=n<9;
}
function renderStart(){
  updateStartCounts();
  const s=load();
  $("#startBtn").classList.toggle("hidden",!!s);
  $("#resumeBtn").classList.toggle("hidden",!s);
  $("#restartBtn").classList.toggle("hidden",!s);
  if(s){
    let label="前回の続きから";
    if(s.stage==="prelim") label=`前回の続きから（予選 ${Math.min(s.prelim.index+1,s.prelim.groups.length)}/${s.prelim.groups.length}）`;
    if(s.stage==="main") label=`本選 ROUND ${s.main.round}/3 から続ける`;
    if(s.stage==="final") label="決勝の続きから";
    if(s.stage==="result") label="結果を見る";
    $("#resumeBtn").textContent=label;
  }
  const missing=allMembers.filter(m=>m.category!=="starto"&&!m.imageUrl&&!m.localPhoto).length;
  const hasBase=allMembers.some(m=>m.category==="starto");
  const warnings=[];
  if(!hasBase) warnings.push("STARTO元データの読み込みに失敗しています。通信状態を確認して再読み込みしてください。");
  if(missing) warnings.push(`追加メンバー${missing}人の写真参照が未設定です。`);
  $("#photoWarning").classList.toggle("hidden",warnings.length===0);
  if(warnings.length) $("#photoWarning").textContent=warnings.join(" ");
  showOnly($("#startView"));
}

function freshState(){
  const ids=selectedFilterIds();
  return {
    version:1, createdAt:new Date().toISOString(), stage:"prelim", poolIds:ids,
    prelim:{groups:chunk(shuffle(ids),8),index:0,selections:{}},
    main:null, finalists:null, final:null, result:null
  };
}
function startNew(){ clearState(); state=freshState(); save(); renderPrelim(); }
function resume(){ state=load()||freshState(); if(state.stage==="prelim")renderPrelim(); else if(state.stage==="prelimDone")renderPrelimDone(); else if(state.stage==="mainIntro")showOnly($("#mainIntroView")); else if(state.stage==="main")renderMain(); else if(state.stage==="finalists")renderFinalists(); else if(state.stage==="final")renderFinal(); else if(state.stage==="result")renderResult(); else renderStart(); }

function makeCard(member,{selected=false,rank=0,onClick=null}={}){
  const frag=$("#cardTemplate").content.cloneNode(true); const card=frag.querySelector(".card");
  frag.querySelector(".name").textContent=member.name; frag.querySelector(".group").textContent=groupName(member);
  wireImage(frag.querySelector(".photo"),frag.querySelector(".photo-fallback"),member);
  if(selected) card.classList.add("selected");
  if(rank){ const medal=frag.querySelector(".medal"); medal.classList.remove("hidden"); medal.textContent=rank===1?"🥇 1位":"🥈 2位"; card.classList.add(rank===1?"first":"second"); }
  if(onClick) card.addEventListener("click",onClick); else card.disabled=true;
  return frag;
}
function preview(container,ids,limit=18){
  container.innerHTML="";
  ids.slice(0,limit).forEach(id=>{ const m=memberMap.get(id); if(!m)return; const d=document.createElement("div");d.className="mini-avatar"; const sq=document.createElement("div");sq.className="sq";const img=document.createElement("img");const fb=document.createElement("div");fb.style.cssText="width:100%;height:100%;display:grid;place-items:center;font-size:9px;color:#a98998";fb.textContent="NO PHOTO";sq.append(img,fb);wireImage(img,fb,m);const sp=document.createElement("span");sp.textContent=m.name;d.append(sq,sp);container.append(d); });
}

function renderPrelim(){
  state.stage="prelim"; save(); showOnly($("#prelimView"));
  const p=state.prelim, ids=p.groups[p.index]||[], sel=new Set(p.selections[String(p.index)]||[]);
  const grid=$("#prelimGrid"); grid.innerHTML="";
  ids.forEach(id=>{ const m=memberMap.get(id); if(!m)return; grid.append(makeCard(m,{selected:sel.has(id),onClick:()=>{ const now=new Set(p.selections[String(p.index)]||[]); if(now.has(id)) now.delete(id); else if(now.size<3) now.add(id); p.selections[String(p.index)]=[...now]; save(); renderPrelim(); }})); });
  $("#prelimProgress").textContent=`${p.index+1} / ${p.groups.length}`;
  $("#prelimBar").style.width=`${((p.index+1)/p.groups.length)*100}%`;
  $("#prelimSelected").textContent=`${sel.size} / 3`;
  $("#prelimBack").disabled=p.index===0;
  $("#prelimNext").textContent=p.index===p.groups.length-1?"予選を終える →":"次へ →";
}
function prelimNext(){ const p=state.prelim; if(p.index<p.groups.length-1){p.index++;save();scrollTo(0,0);renderPrelim();return;} state.stage="prelimDone";save();renderPrelimDone(); }
function prelimBack(){ if(state.prelim.index>0){state.prelim.index--;save();renderPrelim();scrollTo(0,0);} }
function survivorIds(){ return [...new Set(Object.values(state.prelim.selections).flat())]; }
function renderPrelimDone(){
  const ids=survivorIds(); $("#survivorCount").textContent=ids.length; preview($("#survivorPreview"),ids);
  if(ids.length<9){ $("#prelimDoneText").textContent="9人未満なので、予選に戻ってもう少し残してね。"; $("#toMain").disabled=true; }
  else if(ids.length<=18){ $("#prelimDoneText").textContent="18人以下なので、このまま決勝へ進めます。"; $("#toMain").disabled=false; $("#toMain").textContent="👑 決勝へ"; }
  else { $("#prelimDoneText").textContent="ここから候補同士を3ROUND比較します。"; $("#toMain").disabled=false; $("#toMain").textContent="🔥 本選へ"; }
  showOnly($("#prelimDoneView"));
}
function goFromPrelimDone(){ const ids=survivorIds(); if(ids.length<=18){state.finalists=ids;state.stage="finalists";save();renderFinalists();}else{state.stage="mainIntro";save();showOnly($("#mainIntroView"));} }

function freshMain(ids){
  const tie={}; ids.forEach(id=>tie[id]=Math.random());
  return {round:1,index:0,groups:balancedGroups(shuffle(ids),6),choices:{},scores:Object.fromEntries(ids.map(id=>[id,{points:0,firsts:0,seconds:0}])),tie};
}
function startMain(){ state.main=freshMain(survivorIds());state.stage="main";save();renderMain(); }
function currentMainChoice(){ return state.main.choices[`${state.main.round}:${state.main.index}`]||[]; }
function renderMain(){
  state.stage="main";save();showOnly($("#mainView"));
  const m=state.main, ids=m.groups[m.index]||[], choice=currentMainChoice(); const grid=$("#mainGrid");grid.innerHTML="";
  ids.forEach(id=>{const mem=memberMap.get(id); if(!mem)return; const rank=choice.indexOf(id)+1; grid.append(makeCard(mem,{rank,onClick:()=>selectMain(id)}));});
  $("#mainRound").textContent=`ROUND ${m.round} / 3`; $("#mainScreen").textContent=`${m.index+1} / ${m.groups.length}`;
  const doneBefore=(m.round-1)+((m.index+1)/m.groups.length); $("#mainBar").style.width=`${(doneBefore/3)*100}%`;
  $("#mainPrompt").textContent=choice.length===0?"① 一番好きな顔は？":choice.length===1?"② 次に好きな顔は？":"この2人でOK？";
  $("#mainSub").textContent=choice.length===0?"まず1位をタップ":choice.length===1?"次に2位をタップ":"変更したい場合はカードをタップ";
  $("#mainNext").disabled=ids.length>1&&choice.length<2; $("#mainBack").disabled=m.index===0;
  $("#mainNext").textContent=(m.round===3&&m.index===m.groups.length-1)?"決勝進出者を決める →":"次へ →";
}
function selectMain(id){
  const m=state.main,key=`${m.round}:${m.index}`; let c=[...(m.choices[key]||[])];
  const at=c.indexOf(id); if(at>=0)c.splice(at,1); else if(c.length<2)c.push(id); else c=[c[0],id];
  m.choices[key]=c;save();renderMain();
}
function applyGroupScore(ids,choice,delta=1){
  if(choice[0]&&state.main.scores[choice[0]]){state.main.scores[choice[0]].points+=2*delta;state.main.scores[choice[0]].firsts+=delta;}
  if(choice[1]&&state.main.scores[choice[1]]){state.main.scores[choice[1]].points+=1*delta;state.main.scores[choice[1]].seconds+=delta;}
}
function mainNext(){
  const m=state.main, ids=m.groups[m.index]||[], key=`${m.round}:${m.index}`, c=m.choices[key]||[]; if(ids.length>1&&c.length<2)return;
  if(!m.applied) m.applied={}; if(!m.applied[key]){applyGroupScore(ids,c,1);m.applied[key]=true;}
  if(m.index<m.groups.length-1){m.index++;save();renderMain();scrollTo(0,0);return;}
  if(m.round<3){m.round++;m.index=0;m.groups=balancedGroups(shuffle(survivorIds()),6);save();renderMain();scrollTo(0,0);return;}
  const ranked=Object.keys(m.scores).sort((a,b)=>{const A=m.scores[a],B=m.scores[b];return B.points-A.points||B.firsts-A.firsts||B.seconds-A.seconds||m.tie[a]-m.tie[b];});
  state.finalists=ranked.slice(0,18);state.stage="finalists";save();renderFinalists();
}
function mainBack(){
  const m=state.main;
  if(m.index===0) return;
  m.index--;
  const key=`${m.round}:${m.index}`;
  if(m.applied?.[key]){applyGroupScore(m.groups[m.index],m.choices[key]||[],-1);delete m.applied[key];}
  save();renderMain();
}

function renderFinalists(){ preview($("#finalistsPreview"),state.finalists,18);showOnly($("#finalistsView")); }
function initFinal(){
  const order=shuffle(state.finalists);
  state.final={order,processed:0,ranking:[],candidate:null,lo:0,hi:0,mid:null,history:[]}; state.stage="final";save(); advanceFinal();
}
function advanceFinal(){
  const f=state.final;
  if(f.candidate===null){
    if(f.processed>=f.order.length){state.result=f.ranking.slice(0,9);state.stage="result";save();renderResult();return;}
    const id=f.order[f.processed];
    if(f.ranking.length===0){f.ranking=[id];f.processed++;save();advanceFinal();return;}
    f.candidate=id;f.lo=0;f.hi=f.ranking.length;f.mid=Math.floor((f.lo+f.hi)/2);save();
  }
  renderFinal();
}
function renderFinal(){
  showOnly($("#finalView")); const f=state.final;
  if(f.candidate===null){advanceFinal();return;}
  const opp=f.ranking[f.mid]; const ids=shuffle([f.candidate,opp]); const d=$("#duel");d.innerHTML="";
  ids.forEach(id=>{const m=memberMap.get(id); if(m)d.append(makeCard(m,{onClick:()=>chooseFinal(id)}));});
  $("#finalProgress").textContent=`${Math.min(f.processed+1,f.order.length)} / ${f.order.length}`;
  $("#finalBar").style.width=`${(f.processed/f.order.length)*100}%`; $("#finalUndo").disabled=f.history.length===0;
}
function chooseFinal(winner){
  const f=state.final; f.history.push(JSON.stringify({processed:f.processed,ranking:f.ranking,candidate:f.candidate,lo:f.lo,hi:f.hi,mid:f.mid}));
  const opp=f.ranking[f.mid];
  if(winner===f.candidate) f.hi=f.mid; else if(winner===opp) f.lo=f.mid+1; else return;
  if(f.lo>=f.hi){ const r=[...f.ranking]; r.splice(f.lo,0,f.candidate); f.ranking=r.slice(0,9); f.processed++; f.candidate=null; f.mid=null; save(); advanceFinal(); }
  else { f.mid=Math.floor((f.lo+f.hi)/2);save();renderFinal(); }
}
function undoFinal(){ const f=state.final;if(!f.history.length)return;const snap=JSON.parse(f.history.pop());Object.assign(f,snap);save();renderFinal(); }

function resultCard(m,rank){
  const frag=$("#resultTemplate").content.cloneNode(true);frag.querySelector(".rank").textContent=`${rank}位`;frag.querySelector(".result-info strong").textContent=m.name;frag.querySelector(".result-info span").textContent=groupName(m);wireImage(frag.querySelector(".result-photo"),frag.querySelector(".result-fallback"),m);return frag;
}
function renderResult(){
  const ids=state.result||[]; const g=$("#resultGrid");g.innerHTML="";const t=$("#rankingText");t.innerHTML="";
  ids.forEach((id,i)=>{const m=memberMap.get(id);if(!m)return;g.append(resultCard(m,i+1));const line=document.createElement("div");line.className="rank-line";line.textContent=`${i+1}位　${m.name}（${groupName(m)}）`;t.append(line);});
  showOnly($("#resultView"));scrollTo(0,0);
}
async function copyResult(){ const text=(state.result||[]).map((id,i)=>`${i+1}位 ${memberMap.get(id)?.name||""}`).join("\n")+"\n\n#いけめんだいすき"; try{await navigator.clipboard.writeText(text);$("#copyNotice").classList.remove("hidden");setTimeout(()=>$("#copyNotice").classList.add("hidden"),1600);}catch{} }
function goHome(){renderStart();scrollTo(0,0);}

$("#filterStarto").addEventListener("change",updateStartCounts);$("#filterUngrouped").addEventListener("change",updateStartCounts);$("#filterActors").addEventListener("change",updateStartCounts);
$("#startBtn").addEventListener("click",startNew);$("#resumeBtn").addEventListener("click",resume);$("#restartBtn").addEventListener("click",()=>{clearState();renderStart()});
$("#prelimNext").addEventListener("click",prelimNext);$("#prelimBack").addEventListener("click",prelimBack);$("#homeFromPrelim").addEventListener("click",goHome);
$("#toMain").addEventListener("click",goFromPrelimDone);$("#restartFromPrelim").addEventListener("click",()=>{clearState();renderStart()});
$("#mainStart").addEventListener("click",startMain);$("#mainNext").addEventListener("click",mainNext);$("#mainBack").addEventListener("click",mainBack);$("#homeFromMain").addEventListener("click",goHome);
$("#finalStart").addEventListener("click",initFinal);$("#finalUndo").addEventListener("click",undoFinal);$("#homeFromFinal").addEventListener("click",goHome);
$("#copyBtn").addEventListener("click",copyResult);$("#resultRestart").addEventListener("click",()=>{clearState();renderStart()});

(async()=>{
  try{
    const info=await loadData();
    if(info.originalError){$("#photoWarning").classList.remove("hidden");}
    renderStart();
  }catch(e){$("#errorText").textContent=e?.message||String(e);showOnly($("#errorView"));}
})();
