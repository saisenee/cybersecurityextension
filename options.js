function dom(id){ return document.getElementById(id); }
function getStorage(keys){ return new Promise(r=>chrome.storage.local.get(keys,r)); }
function setStorage(obj){ return new Promise(r=>chrome.storage.local.set(obj,r)); }
function send(msg){ return new Promise(r=>chrome.runtime.sendMessage(msg,r)); }

function renderList(listEl, values, onRemove){
  listEl.innerHTML = "";
  for(const val of values){
    const li = document.createElement("li");
    li.className = "list-item";
    const span = document.createElement("span");
    span.textContent = val;
    const btn = document.createElement("button");
    btn.className = "remove";
    btn.textContent = "Remove";
    btn.onclick = ()=>onRemove(val);
    li.appendChild(span); li.appendChild(btn);
    listEl.appendChild(li);
  }
}

async function init(){
  const wlEl = dom("whitelist");
  const blEl = dom("blocklist");

  const st = await getStorage(["whitelist", "customBlocklist"]);
  const whitelist = Array.isArray(st.whitelist) ? st.whitelist : [];
  const customBlocklist = Array.isArray(st.customBlocklist) ? st.customBlocklist : [];

  renderList(wlEl, whitelist, async (val)=>{
    const next = whitelist.filter(v=>v!==val);
    await setStorage({ whitelist: next });
    init();
  });

  renderList(blEl, customBlocklist, async (val)=>{
    const next = customBlocklist.filter(v=>v!==val);
    await setStorage({ customBlocklist: next });
    init();
  });

  dom("addWhitelist").onclick = async ()=>{
    const v = (dom("whitelistInput").value||"").trim().toLowerCase();
    if(!v) return;
    if(!whitelist.includes(v)) whitelist.push(v);
    await setStorage({ whitelist });
    dom("whitelistInput").value = "";
    init();
  };

  dom("addBlocklist").onclick = async ()=>{
    const v = (dom("blocklistInput").value||"").trim().toLowerCase();
    if(!v) return;
    if(!customBlocklist.includes(v)) customBlocklist.push(v);
    await setStorage({ customBlocklist });
    dom("blocklistInput").value = "";
    init();
  };

  dom("updateNow").onclick = async ()=>{
    dom("updateStatus").textContent = "Updating…";
    const res = await send({ type: "FORCE_UPDATE" });
    dom("updateStatus").textContent = res?.ok ? "Updated." : "Failed.";
  };
}

document.addEventListener("DOMContentLoaded", init);
