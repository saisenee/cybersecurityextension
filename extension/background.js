// NeuroSafe Copilot - Background Service Worker

// Use production URL or fallback to localhost for development
const BACKEND_URL = 'http://localhost:3000'; // Development backend URL
const FOCUS_MODE_THRESHOLD = 2; // risky events in 60s
const FOCUS_MODE_WINDOW = 60000; // ms

// In-memory tracking
const tabCache = new Map(); // tabId -> { verdict, score, timestamp }
const riskEvents = new Map(); // tabId -> [timestamps]
const settings = {};

// Initialize default settings
async function initSettings() {
  const stored = await chrome.storage.local.get(['widgetEnabled', 'focusModeEnabled', 'reducedMotion', 'readingLevel', 'backendBaseUrl', 'autoBlockEnabled']);
  settings.widgetEnabled = stored.widgetEnabled !== false;
  settings.focusModeEnabled = stored.focusModeEnabled !== false;
  settings.reducedMotion = stored.reducedMotion === true;
  settings.readingLevel = stored.readingLevel || 'standard';
  settings.backendBaseUrl = stored.backendBaseUrl || BACKEND_URL;
  settings.autoBlockEnabled = stored.autoBlockEnabled !== false; // Default: enabled
}

// Analyze URL
async function analyzeUrl(url, pageTitle, snippet) {
  try {
    // Add timeout to fetch to prevent hanging
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 5000);
    
    // Add cache-busting parameter for fresh analysis
    const analysisUrl = `${settings.backendBaseUrl}/analyze?t=${Date.now()}`;
    
    const response = await fetch(analysisUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ url, pageTitle, snippet }),
      signal: controller.signal
    });
    clearTimeout(timeoutId);
    
    if (!response.ok) {
      throw new Error(`HTTP ${response.status}`);
    }
    const data = await response.json();
    console.log('[BG] Analysis result:', data);
    return data;
  } catch (err) {
    console.error('[BG] Analyze error:', err);
    // Return safe default instead of throwing
    return { verdict: 'SAFE', score: 0, reasons: [], tags: [], actions: [] };
  }
}

// Get explanation
async function getExplanation(url, verdict, tags, reasons) {
  try {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 5000);
    
    const response = await fetch(`${settings.backendBaseUrl}/explain`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        url,
        verdict,
        tags,
        reasons,
        reading_level: settings.readingLevel
      }),
      signal: controller.signal
    });
    clearTimeout(timeoutId);
    
    if (!response.ok) {
      throw new Error(`HTTP ${response.status}`);
    }
    return await response.json();
  } catch (err) {
    console.error('[BG] Explain error:', err);
    return { summary: 'Analysis unavailable.', bullets: [], next_steps: [] };
  }
}

// Get learning cards
async function getCards(verdict, tags, reasons) {
  try {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 5000);
    
    const response = await fetch(`${settings.backendBaseUrl}/cards`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        verdict,
        tags,
        reasons,
        reading_level: settings.readingLevel,
        max_cards: 3
      }),
      signal: controller.signal
    });
    clearTimeout(timeoutId);
    
    if (!response.ok) {
      throw new Error(`HTTP ${response.status}`);
    }
    return await response.json();
  } catch (err) {
    console.error('[BG] Cards error:', err);
    return { cards: [] };
  }
}

// Deep check (optional)
async function deepCheck(url) {
  try {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 5000);
    
    const response = await fetch(`${settings.backendBaseUrl}/deepcheck`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ url }),
      signal: controller.signal
    });
    clearTimeout(timeoutId);
    
    if (!response.ok) {
      throw new Error(`HTTP ${response.status}`);
    }
    return await response.json();
  } catch (err) {
    console.error('[BG] Deep check error:', err);
    return { otx: null, virustotal: null };
  }
}

// Check if URL is temporarily allowed for a specific tab
async function isTemporarilyAllowed(url, tabId) {
  try {
    const stored = await chrome.storage.local.get([`allow_${tabId}`]);
    const allowRule = stored[`allow_${tabId}`];
    
    if (!allowRule) return false;
    
    // Check if expired
    if (Date.now() > allowRule.expires) {
      // Clean up expired rule
      await chrome.storage.local.remove([`allow_${tabId}`]);
      return false;
    }
    
    // Check if URL matches
    if (allowRule.url === url) {
      console.log(`[BG] URL temporarily allowed for tab ${tabId}`);
      return true;
    }
    
    return false;
  } catch (err) {
    console.error('[BG] Error checking allow rule:', err);
    return false;
  }
}

// Block a dangerous URL
async function blockUrl(tabId, url, analysisResult) {
  try {
    console.log(`[BG] Blocking dangerous URL in tab ${tabId}: ${url}`);
    
    // Store block data for blocked page to display
    await chrome.storage.local.set({
      currentBlockData: {
        url,
        verdict: analysisResult.verdict,
        score: analysisResult.score,
        reasons: analysisResult.reasons,
        tags: analysisResult.tags,
        timestamp: Date.now()
      }
    });
    
    // Redirect to blocked page
    const blockedPageUrl = chrome.runtime.getURL(
      `blocked.html?url=${encodeURIComponent(url)}&verdict=${analysisResult.verdict}&score=${analysisResult.score}`
    );
    
    await chrome.tabs.update(tabId, { url: blockedPageUrl });
    
    return true;
  } catch (err) {
    console.error('[BG] Error blocking URL:', err);
    return false;
  }
}

// Message handling
chrome.runtime.onMessage.addListener((msg, sender, sendResponse) => {
  (async () => {
    try {
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
      
      if (msg.type === 'ALLOW_ONCE') {
        // Tab wants to proceed to dangerous site
        console.log(`[BG] Allowing once: ${msg.url} for tab ${msg.tabId}`);
        sendResponse({ ok: true });
      }
    } catch (err) {
      console.error('[BG] Message handler error:', err);
      sendResponse({ error: err.message });
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
  // Clean up temporary allow rules
  chrome.storage.local.remove([`allow_${tabId}`]).catch(() => {});
});

// Tab navigation listener - check and block dangerous sites
chrome.tabs.onUpdated.addListener((tabId, changeInfo, tab) => {
  // Only check when navigation is committed (URL actually changed)
  if (changeInfo.status !== 'loading' || !tab.url) return;
  
  const url = tab.url;
  
  // Skip internal pages
  if (url.startsWith('chrome://') || 
      url.startsWith('chrome-extension://') || 
      url.startsWith('about:') ||
      url.startsWith('edge://')) {
    return;
  }
  
  // Check if auto-blocking is enabled
  if (!settings.autoBlockEnabled) {
    console.log('[BG] Auto-blocking disabled, skipping check');
    return;
  }
  
  // Wrap async logic in an IIFE
  (async () => {
    try {
      // Check if URL is temporarily allowed
      const allowed = await isTemporarilyAllowed(url, tabId);
      if (allowed) {
        console.log(`[BG] URL allowed for tab ${tabId}, skipping block`);
        return;
      }
      
      // Check cache first
      let analysis = tabCache.get(tabId);
      
      // If not cached or URL changed, analyze
      if (!analysis || analysis.url !== url) {
        console.log(`[BG] Checking URL for blocking: ${url}`);
        
        // Quick analysis (we'll do full analysis when content script loads)
        analysis = await analyzeUrl(url, tab.title || '', '');
        
        if (analysis) {
          tabCache.set(tabId, { ...analysis, url });
        }
      }
      
      // Block if dangerous
      if (analysis && analysis.verdict === 'DANGEROUS') {
        console.log(`[BG] DANGEROUS site detected, blocking: ${url}`);
        await blockUrl(tabId, url, analysis);
      }
    } catch (err) {
      console.error('[BG] Error in tab update handler:', err);
    }
  })();
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
