function getStats() {
  return new Promise((resolve) => chrome.runtime.sendMessage({ type: "GET_STATS" }, resolve));
}
function forceUpdate() {
  return new Promise((resolve) => chrome.runtime.sendMessage({ type: "FORCE_UPDATE" }, resolve));
}
function getIncidents(){
  return new Promise((resolve)=>chrome.runtime.sendMessage({ type: "GET_INCIDENTS" }, resolve));
}
function clearIncidents(){
  return new Promise((resolve)=>chrome.runtime.sendMessage({ type: "CLEAR_INCIDENTS" }, resolve));
}

const fmt = (ts) => (ts ? new Date(ts).toLocaleString() : "—");

function renderIncidents(items){
  const ul = document.getElementById("incidentList");
  ul.innerHTML = "";
  if(!items || !items.length){
    const li = document.createElement("li");
    li.textContent = "No recent activity.";
    ul.appendChild(li);
    return;
  }
  for(const it of items){
    const li = document.createElement("li");
    const kind = document.createElement("span"); kind.className = "kind"; kind.textContent = it.kind;
    const host = document.createElement("span"); host.className = "host"; host.textContent = it.host || "unknown";
    const time = document.createElement("span"); time.className = "time"; time.textContent = fmt(it.ts);
    li.appendChild(kind); li.appendChild(host); li.appendChild(time);
    ul.appendChild(li);
  }
}

async function init() {
  // Clear badge when popup opens
  chrome.action.setBadgeText({ text: "" });

  const toggle = document.getElementById("enabledToggle");
  const statusText = document.getElementById("statusText");
  const localCount = document.getElementById("localCount");
  const remoteCount = document.getElementById("remoteCount");
  const updatedAt = document.getElementById("updatedAt");

  chrome.storage.local.get(["enabled"], (st) => {
    toggle.checked = st.enabled !== false;
    statusText.textContent = toggle.checked ? "On" : "Off";
  });

  toggle.addEventListener("change", () => {
    chrome.storage.local.set({ enabled: toggle.checked });
    statusText.textContent = toggle.checked ? "On" : "Off";
  });

  const stats = await getStats();
  localCount.textContent = String(stats?.counts?.local ?? 0);
  remoteCount.textContent = String(stats?.counts?.remote ?? 0);
  updatedAt.textContent = fmt(stats?.lastUpdate);

  document.getElementById("forceUpdate").addEventListener("click", async () => {
    const res = await forceUpdate();
    updatedAt.textContent = fmt(res?.lastUpdate);
    const again = await getStats();
    remoteCount.textContent = String(again?.counts?.remote ?? 0);
  });

  document.getElementById("openOptions").addEventListener("click", () => {
    chrome.runtime.openOptionsPage();
  });

  const inc = await getIncidents();
  renderIncidents(inc?.incidents || []);
  document.getElementById("clearIncidents").addEventListener("click", async ()=>{
    await clearIncidents();
    renderIncidents([]);
  });
}

document.addEventListener("DOMContentLoaded", init);
