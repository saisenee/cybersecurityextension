// SafeBrowse Aid - Background Service Worker (MV3)
// Minimal, focused implementation for demo purposes.

const URLHAUS_HOSTFILE = "https://urlhaus.abuse.ch/downloads/hostfile/";
const SIX_HOURS_MS = 6 * 60 * 60 * 1000;

const DEFAULT_SETTINGS = {
  enabled: true,
  whitelist: [],
  accessibility: { simplifiedText: true, highContrast: true },
  lastUpdate: 0
};

let localBlocklist = new Set();
let remoteBlocklist = new Set();
let suggestions = {};

function promisifyGet(keys) {
  return new Promise((resolve) => chrome.storage.local.get(keys, resolve));
}
function promisifySet(obj) {
  return new Promise((resolve) => chrome.storage.local.set(obj, resolve));
}

function hostFromUrl(urlString) {
  try {
    const u = new URL(urlString);
    return u.hostname.toLowerCase();
  } catch {
    return null;
  }
}

function isWhitelisted(host, whitelist = []) {
  if (!host) return false;
  host = host.toLowerCase();
  return whitelist.some((w) => host === w || host.endsWith("." + w));
}

function buildSuffixes(host) {
  const parts = host.split(".");
  const out = [];
  for (let i = 0; i < parts.length - 1; i++) {
    out.push(parts.slice(i).join("."));
  }
  return out;
}

function inBlocklists(host) {
  if (!host) return { found: false };
  const suffixes = buildSuffixes(host);
  for (const s of suffixes) {
    if (localBlocklist.has(s)) return { found: true, source: "local-blocklist", match: s };
    if (remoteBlocklist.has(s)) return { found: true, source: "remote-blocklist", match: s };
  }
  return { found: false };
}

async function loadLocalBlocklist() {
  try {
    const url = chrome.runtime.getURL("data/blocklist.json");
    const res = await fetch(url);
    const json = await res.json();
    const domains = Array.isArray(json.domains) ? json.domains : [];
    localBlocklist = new Set(domains.map((d) => String(d).toLowerCase()));
    console.log("[SafeBrowse Aid BG] Loaded local blocklist:", localBlocklist.size, "domains", Array.from(localBlocklist));
  } catch (e) {
    console.warn("[SafeBrowse Aid BG] Failed to load local blocklist:", e);
    localBlocklist = new Set();
  }
}

async function loadSuggestions() {
  try {
    const url = chrome.runtime.getURL("data/suggestions.json");
    const res = await fetch(url);
    suggestions = await res.json();
  } catch (e) {
    suggestions = {};
  }
}

async function maybeUpdateRemoteBlocklist(force = false) {
  const { lastUpdate = 0 } = await promisifyGet(["lastUpdate"]);
  if (!force && Date.now() - lastUpdate < SIX_HOURS_MS && remoteBlocklist.size > 0) {
    return;
  }
  try {
    const res = await fetch(URLHAUS_HOSTFILE);
    const text = await res.text();
    const lines = text.split("\n");
    const hosts = [];
    for (const line of lines) {
      const trimmed = line.trim();
      if (!trimmed || trimmed.startsWith("#")) continue;
      // Expected formats like: 0.0.0.0 badhost.com
      const parts = trimmed.split(/\s+/);
      const candidate = parts.length >= 2 ? parts[1] : parts[0];
      if (/^[a-z0-9.-]+\.[a-z]{2,}$/i.test(candidate)) {
        hosts.push(candidate.toLowerCase());
      }
      if (hosts.length >= 2000) break; // keep storage small for demo
    }
    remoteBlocklist = new Set(hosts);
    await promisifySet({ lastUpdate: Date.now(), remoteCount: hosts.length });
  } catch (e) {
    console.warn("Failed to update remote blocklist:", e);
  }
}

async function ensureDefaults() {
  const got = await promisifyGet(Object.keys(DEFAULT_SETTINGS));
  const toSet = {};
  for (const [k, v] of Object.entries(DEFAULT_SETTINGS)) {
    if (got[k] === undefined) toSet[k] = v;
  }
  if (Object.keys(toSet).length) await promisifySet(toSet);
}

function getSuggestionForHost(host) {
  if (!host) return null;
  const direct = suggestions[host];
  if (Array.isArray(direct) && direct.length) return direct[0];
  // Fallback: suggest a safe search
  return {
    label: "Search for safe alternative",
    url: `https://duckduckgo.com/?q=${encodeURIComponent(host + " safe alternative")}`
  };
}

chrome.runtime.onInstalled.addListener(async () => {
  await ensureDefaults();
  await loadLocalBlocklist();
  await loadSuggestions();
  await maybeUpdateRemoteBlocklist(true);
  chrome.alarms.create("updateBlocklist", { periodInMinutes: 360 });
});

chrome.runtime.onStartup.addListener(async () => {
  await ensureDefaults();
  await loadLocalBlocklist();
  await loadSuggestions();
  await maybeUpdateRemoteBlocklist(false);
});

chrome.alarms.onAlarm.addListener((alarm) => {
  if (alarm.name === "updateBlocklist") {
    maybeUpdateRemoteBlocklist(false);
  }
});

chrome.storage.onChanged.addListener(async (changes, area) => {
  if (area !== "local") return;
  if (changes.customBlocklist) {
    const extra = new Set(changes.customBlocklist.newValue || []);
    for (const d of extra) localBlocklist.add(String(d).toLowerCase());
  }
});

async function logIncident(incident) {
  try {
    const { incidents = [] } = await promisifyGet(["incidents"]);
    const entry = { ...incident, ts: Date.now() };
    const next = [entry, ...incidents].slice(0, 20);
    await promisifySet({ incidents: next });
  } catch {}
}

function setBadgeAlert() {
  chrome.action.setBadgeText({ text: "!" });
  chrome.action.setBadgeBackgroundColor({ color: "#d32f2f" });
}

chrome.runtime.onMessage.addListener((msg, sender, sendResponse) => {
  console.log("[SafeBrowse Aid BG] Received message:", msg.type, msg);
  
  (async () => {
    if (msg?.type === "CHECK_URL") {
      const { enabled = true, whitelist = [] } = await promisifyGet(["enabled", "whitelist"]);
      const host = hostFromUrl(msg.url);
      
      console.log("[SafeBrowse Aid BG] Checking URL:", msg.url, "Host:", host, "Enabled:", enabled);
      
      if (!enabled) {
        console.log("[SafeBrowse Aid BG] Protection disabled, allowing");
        return sendResponse({ malicious: false, host });
      }
      if (isWhitelisted(host, whitelist)) {
        console.log("[SafeBrowse Aid BG] Host is whitelisted, allowing");
        return sendResponse({ malicious: false, host, reason: "whitelisted" });
      }
      
      const res = inBlocklists(host);
      console.log("[SafeBrowse Aid BG] Blocklist check result:", res);
      
      if (res.found) {
        setBadgeAlert();
        await logIncident({ kind: "link", url: msg.url, host, reason: res.source, match: res.match });
        console.log("[SafeBrowse Aid BG] ⛔ BLOCKED:", host, "Reason:", res.source);
        return sendResponse({ malicious: true, host, reason: res.source, match: res.match, suggestion: getSuggestionForHost(host) });
      }
      
      console.log("[SafeBrowse Aid BG] ✅ ALLOWED:", host);
      return sendResponse({ malicious: false, host });
    }
    if (msg?.type === "GET_STATS") {
      const { enabled = true, lastUpdate = 0 } = await promisifyGet(["enabled", "lastUpdate"]);
      return sendResponse({
        enabled,
        lastUpdate,
        counts: {
          local: localBlocklist.size,
          remote: remoteBlocklist.size
        }
      });
    }
    if (msg?.type === "FORCE_UPDATE") {
      await maybeUpdateRemoteBlocklist(true);
      const { lastUpdate = 0 } = await promisifyGet(["lastUpdate"]);
      return sendResponse({ ok: true, lastUpdate, counts: { local: localBlocklist.size, remote: remoteBlocklist.size } });
    }
    if (msg?.type === "GET_INCIDENTS") {
      const { incidents = [] } = await promisifyGet(["incidents"]);
      return sendResponse({ incidents });
    }
    if (msg?.type === "CLEAR_INCIDENTS") {
      await promisifySet({ incidents: [] });
      chrome.action.setBadgeText({ text: "" });
      return sendResponse({ ok: true });
    }
    return sendResponse({});
  })();
  return true; // keep message channel open for async
});

chrome.downloads.onCreated.addListener(async (item) => {
  try {
    const { enabled = true, whitelist = [] } = await promisifyGet(["enabled", "whitelist"]);
    if (!enabled || !item?.url) return;
    const host = hostFromUrl(item.url);
    if (isWhitelisted(host, whitelist)) return;
    const res = inBlocklists(host);
    if (res.found) {
      chrome.downloads.cancel(item.id, async () => {
        setBadgeAlert();
        await logIncident({ kind: "download", url: item.url, host, reason: res.source, match: res.match });
      });
    }
  } catch (e) {
    // swallow
  }
});
