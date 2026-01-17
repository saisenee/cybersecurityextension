// NeuroSafe Copilot - Background Service Worker

const BACKEND_URL = 'http://localhost:3000';
const FOCUS_MODE_THRESHOLD = 2; // risky events in 60s
const FOCUS_MODE_WINDOW = 60000; // ms

// In-memory tracking
const tabCache = new Map(); // tabId -> { verdict, score, timestamp }
const riskEvents = new Map(); // tabId -> [timestamps]
const settings = {};

// Initialize default settings
async function initSettings() {
  const stored = await chrome.storage.local.get(['widgetEnabled', 'focusModeEnabled', 'reducedMotion', 'readingLevel', 'backendBaseUrl']);
  settings.widgetEnabled = stored.widgetEnabled !== false;
  settings.focusModeEnabled = stored.focusModeEnabled !== false;
  settings.reducedMotion = stored.reducedMotion === true;
  settings.readingLevel = stored.readingLevel || 'standard';
  settings.backendBaseUrl = stored.backendBaseUrl || BACKEND_URL;
}

// Analyze URL
async function analyzeUrl(url, pageTitle, snippet) {
  try {
    const response = await fetch(`${settings.backendBaseUrl}/analyze`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ url, pageTitle, snippet })
    });
    const data = await response.json();
    return data;
  } catch (err) {
    console.error('[BG] Analyze error:', err);
    return { verdict: 'SAFE', score: 0, reasons: [], tags: [], actions: [] };
  }
}

// Get explanation
async function getExplanation(url, verdict, tags, reasons) {
  try {
    const response = await fetch(`${settings.backendBaseUrl}/explain`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        url,
        verdict,
        tags,
        reasons,
        reading_level: settings.readingLevel
      })
    });
    return await response.json();
  } catch (err) {
    console.error('[BG] Explain error:', err);
    return { summary: 'Analysis unavailable.', bullets: [], next_steps: [] };
  }
}

// Get learning cards
async function getCards(verdict, tags, reasons) {
  try {
    const response = await fetch(`${settings.backendBaseUrl}/cards`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        verdict,
        tags,
        reasons,
        reading_level: settings.readingLevel,
        max_cards: 3
      })
    });
    return await response.json();
  } catch (err) {
    console.error('[BG] Cards error:', err);
    return { cards: [] };
  }
}

// Deep check (optional)
async function deepCheck(url) {
  try {
    const response = await fetch(`${settings.backendBaseUrl}/deepcheck`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ url })
    });
    return await response.json();
  } catch (err) {
    console.error('[BG] Deep check error:', err);
    return { otx: null, virustotal: null };
  }
}

// Message handling
chrome.runtime.onMessage.addListener((msg, sender, sendResponse) => {
  (async () => {
    const tabId = sender.tab?.id;
    
    if (msg.type === 'ANALYZE_URL') {
      console.log(`[BG] Analyzing URL: ${msg.url}`);
      const result = await analyzeUrl(msg.url, msg.pageTitle, msg.snippet);
      
      if (tabId) {
        tabCache.set(tabId, result);
        
        // Check focus mode
        if (settings.focusModeEnabled && (result.verdict === 'SUSPICIOUS' || result.verdict === 'DANGEROUS')) {
          recordRiskEvent(tabId);
        }
      }
      
      sendResponse(result);
    }
    
    if (msg.type === 'GET_TAB_STATUS') {
      const cached = tabCache.get(tabId);
      sendResponse(cached || { verdict: 'SAFE', score: 0, reasons: [], tags: [], actions: [] });
    }
    
    if (msg.type === 'GET_EXPLANATION') {
      const explain = await getExplanation(msg.url, msg.verdict, msg.tags, msg.reasons);
      sendResponse(explain);
    }
    
    if (msg.type === 'GET_CARDS') {
      const cards = await getCards(msg.verdict, msg.tags, msg.reasons);
      sendResponse(cards);
    }
    
    if (msg.type === 'DEEP_CHECK') {
      const check = await deepCheck(msg.url);
      sendResponse(check);
    }
    
    if (msg.type === 'RISK_EVENT') {
      recordRiskEvent(tabId);
      sendResponse({ ok: true });
    }
  })();
  
  return true;
});

function recordRiskEvent(tabId) {
  if (!tabId) return;
  
  const now = Date.now();
  if (!riskEvents.has(tabId)) {
    riskEvents.set(tabId, []);
  }
  
  const events = riskEvents.get(tabId);
  events.push(now);
  
  // Clean old events
  const cutoff = now - FOCUS_MODE_WINDOW;
  riskEvents.set(tabId, events.filter(t => t > cutoff));
  
  // Check if focus mode should trigger
  if (events.length >= FOCUS_MODE_THRESHOLD) {
    console.log(`[BG] Focus mode triggered for tab ${tabId} (${events.length} events)`);
    // Send to content script to show focus interrupt
    chrome.tabs.sendMessage(tabId, { type: 'SHOW_FOCUS_INTERRUPT' }).catch(() => {});
  }
}

// Tab cleanup
chrome.tabs.onRemoved.addListener((tabId) => {
  tabCache.delete(tabId);
  riskEvents.delete(tabId);
});

// Open side panel when extension icon is clicked
chrome.action.onClicked.addListener((tab) => {
  chrome.sidePanel.open({ windowId: tab.windowId });
});

// Initialize on startup
chrome.runtime.onInstalled.addListener(async () => {
  await initSettings();
  console.log('[BG] NeuroSafe initialized');
});

chrome.runtime.onStartup.addListener(async () => {
  await initSettings();
});

// Listen for settings changes
chrome.storage.onChanged.addListener(async (changes, areaName) => {
  if (areaName === 'local') {
    await initSettings();
  }
});

// Initialize on load
initSettings();
