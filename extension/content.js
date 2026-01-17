// NeuroSafe Copilot - Content Script

(function () {
  console.log('[Content] NeuroSafe loaded');

  const WIDGET_ID = 'neurosafe-widget-root';
  const INTERSTITIAL_ID = 'neurosafe-interstitial-root';
  const FOCUS_INTERRUPT_ID = 'neurosafe-focus-interrupt-root';

  let settings = { widgetEnabled: true, focusModeEnabled: true, reducedMotion: false };
  let lastAnalysis = null;

  // Load settings
  async function loadSettings() {
    const stored = await chrome.storage.local.get(['widgetEnabled', 'focusModeEnabled', 'reducedMotion']);
    settings = {
      widgetEnabled: stored.widgetEnabled !== false,
      focusModeEnabled: stored.focusModeEnabled !== false,
      reducedMotion: stored.reducedMotion === true
    };
  }

  // Inject widget
  async function injectWidget() {
    // Wait for document.body to be available
    if (!document.body) {
      document.addEventListener('DOMContentLoaded', injectWidget);
      return;
    }

    await loadSettings();
    if (!settings.widgetEnabled) return;

    if (document.getElementById(WIDGET_ID)) return;

    const widget = document.createElement('div');
    widget.id = WIDGET_ID;
    widget.innerHTML = `
      <div id="neurosafe-widget" style="
        position: fixed;
        bottom: 20px;
        right: 20px;
        width: 60px;
        height: 60px;
        background: #4CAF50;
        border-radius: 50%;
        box-shadow: 0 4px 12px rgba(0,0,0,0.2);
        cursor: pointer;
        z-index: 999999;
        display: flex;
        align-items: center;
        justify-content: center;
        font-size: 28px;
        user-select: none;
        transition: transform 0.2s, background 0.3s;
      ">
        🛡️
      </div>
    `;

    document.body.appendChild(widget);

    const widgetEl = document.getElementById('neurosafe-widget');
    let isDragging = false;
    let hasMoved = false;
    let startX, startY, offsetX = 0, offsetY = 0;
    let mouseDownTime = 0;

    // Load saved position
    chrome.storage.local.get(['widgetPos'], (data) => {
      if (data.widgetPos) {
        widgetEl.style.left = data.widgetPos.left;
        widgetEl.style.right = data.widgetPos.right;
        widgetEl.style.bottom = data.widgetPos.bottom;
        widgetEl.style.top = data.widgetPos.top;
      }
    });

    // Update widget appearance based on analysis
    function updateWidgetStatus(verdict) {
      const colors = {
        SAFE: '#4CAF50',
        SUSPICIOUS: '#FF9800',
        DANGEROUS: '#F44336'
      };
      const icons = {
        SAFE: '✓',
        SUSPICIOUS: '⚠',
        DANGEROUS: '⛔'
      };
      
      widgetEl.style.background = colors[verdict] || '#4CAF50';
      widgetEl.textContent = icons[verdict] || '🛡️';
      
      // Add pulse animation
      widgetEl.style.animation = 'none';
      setTimeout(() => {
        widgetEl.style.animation = 'pulse 0.5s ease-in-out';
      }, 10);
    }

    // Add CSS animation
    if (!document.getElementById('neurosafe-styles')) {
      const style = document.createElement('style');
      style.id = 'neurosafe-styles';
      style.textContent = `
        @keyframes pulse {
          0%, 100% { transform: scale(1); }
          50% { transform: scale(1.1); }
        }
        @keyframes analyzing {
          0% { transform: rotate(0deg); }
          100% { transform: rotate(360deg); }
        }
      `;
      document.head.appendChild(style);
    }

    widgetEl.addEventListener('mousedown', (e) => {
      mouseDownTime = Date.now();
      isDragging = true;
      hasMoved = false;
      startX = e.clientX;
      startY = e.clientY;
      offsetX = widgetEl.offsetLeft;
      offsetY = widgetEl.offsetTop;
      widgetEl.style.cursor = 'grabbing';
      e.preventDefault();
    });

    document.addEventListener('mousemove', (e) => {
      if (!isDragging) return;
      const deltaX = e.clientX - startX;
      const deltaY = e.clientY - startY;
      
      // Only start dragging if moved more than 5 pixels
      if (Math.abs(deltaX) > 5 || Math.abs(deltaY) > 5) {
        hasMoved = true;
        const newX = offsetX + deltaX;
        const newY = offsetY + deltaY;
        widgetEl.style.left = newX + 'px';
        widgetEl.style.top = newY + 'px';
        widgetEl.style.right = 'auto';
        widgetEl.style.bottom = 'auto';
      }
    });

    document.addEventListener('mouseup', async (e) => {
      if (!isDragging) return;
      
      const clickDuration = Date.now() - mouseDownTime;
      const wasQuickClick = clickDuration < 200 && !hasMoved;
      
      isDragging = false;
      widgetEl.style.cursor = 'pointer';

      if (hasMoved) {
        // Snap to corner
        const rect = widgetEl.getBoundingClientRect();
        const cx = rect.left + rect.width / 2;
        const cy = rect.top + rect.height / 2;
        const vw = window.innerWidth;
        const vh = window.innerHeight;

        let pos = { left: 'auto', right: 'auto', top: 'auto', bottom: 'auto' };
        if (cx < vw / 2 && cy < vh / 2) {
          pos = { left: '20px', right: 'auto', top: '20px', bottom: 'auto' };
        } else if (cx >= vw / 2 && cy < vh / 2) {
          pos = { left: 'auto', right: '20px', top: '20px', bottom: 'auto' };
        } else if (cx < vw / 2 && cy >= vh / 2) {
          pos = { left: '20px', right: 'auto', top: 'auto', bottom: '20px' };
        } else {
          pos = { left: 'auto', right: '20px', top: 'auto', bottom: '20px' };
        }

        widgetEl.style.left = pos.left;
        widgetEl.style.right = pos.right;
        widgetEl.style.top = pos.top;
        widgetEl.style.bottom = pos.bottom;

        chrome.storage.local.set({ widgetPos: pos });
      } else if (wasQuickClick) {
        // Handle click - analyze the page
        e.stopPropagation();
        
        // Show analyzing state
        widgetEl.textContent = '⏳';
        widgetEl.style.animation = 'analyzing 1s linear infinite';
        
        const currentUrl = window.location.href;
        const pageTitle = document.title;
        const snippet = document.body.innerText.slice(0, 2000);

        try {
          const result = await chrome.runtime.sendMessage({
            type: 'ANALYZE_URL',
            url: currentUrl,
            pageTitle,
            snippet
          });

          lastAnalysis = result;
          
          // Update widget with result
          updateWidgetStatus(result.verdict);
          
          // Show tooltip with result
          showResultTooltip(widgetEl, result);
          
          if (result.verdict !== 'SAFE') {
            showInterstitial(result);
          }
        } catch (err) {
          console.error('[Content] Analysis error:', err);
          widgetEl.textContent = '🛡️';
          widgetEl.style.animation = 'none';
        }
      }
    });

    // Show result tooltip
    function showResultTooltip(element, result) {
      // Remove existing tooltip
      const existingTooltip = document.getElementById('neurosafe-tooltip');
      if (existingTooltip) existingTooltip.remove();
      
      const tooltip = document.createElement('div');
      tooltip.id = 'neurosafe-tooltip';
      tooltip.style.cssText = `
        position: fixed;
        background: rgba(0,0,0,0.9);
        color: white;
        padding: 12px 16px;
        border-radius: 8px;
        font-family: system-ui, sans-serif;
        font-size: 13px;
        z-index: 999998;
        max-width: 250px;
        box-shadow: 0 4px 12px rgba(0,0,0,0.3);
        pointer-events: none;
      `;
      
      const verdictText = {
        SAFE: '✓ Safe',
        SUSPICIOUS: '⚠ Suspicious',
        DANGEROUS: '⛔ Dangerous'
      };
      
      tooltip.innerHTML = `
        <div style="font-weight: 600; margin-bottom: 4px;">${verdictText[result.verdict]}</div>
        <div style="font-size: 11px; opacity: 0.8;">Score: ${result.score}/100</div>
        ${result.reasons.length > 0 ? `<div style="font-size: 11px; opacity: 0.8; margin-top: 4px;">${result.reasons[0]}</div>` : ''}
      `;
      
      document.body.appendChild(tooltip);
      
      // Position tooltip near widget
      const rect = element.getBoundingClientRect();
      tooltip.style.top = (rect.top - tooltip.offsetHeight - 10) + 'px';
      tooltip.style.left = (rect.left + rect.width / 2 - tooltip.offsetWidth / 2) + 'px';
      
      // Auto-hide after 3 seconds
      setTimeout(() => tooltip.remove(), 3000);
    }
  }

  // Show interstitial
  async function showInterstitial(analysis) {
    if (document.getElementById(INTERSTITIAL_ID)) {
      document.getElementById(INTERSTITIAL_ID).remove();
    }

    const container = document.createElement('div');
    container.id = INTERSTITIAL_ID;
    container.innerHTML = `
      <div style="
        position: fixed;
        inset: 0;
        background: rgba(0,0,0,0.7);
        display: flex;
        align-items: center;
        justify-content: center;
        z-index: 9999999;
        ${settings.reducedMotion ? '' : 'animation: fadeIn 0.3s ease-in;'}
      " id="neurosafe-overlay">
        <div style="
          background: white;
          border-radius: 12px;
          padding: 24px;
          max-width: 500px;
          width: 90%;
          box-shadow: 0 10px 40px rgba(0,0,0,0.3);
          font-family: system-ui, sans-serif;
        ">
          <div style="text-align: center; font-size: 48px; margin-bottom: 12px;">
            ${analysis.verdict === 'DANGEROUS' ? '⛔' : '⚠️'}
          </div>
          <h2 style="margin: 0 0 12px; font-size: 20px; color: ${analysis.verdict === 'DANGEROUS' ? '#d32f2f' : '#f57c00'};">
            ${analysis.verdict === 'DANGEROUS' ? 'Dangerous Site' : 'Suspicious Site'}
          </h2>
          <p style="margin: 0 0 12px; color: #666; font-size: 14px;">
            This site shows signs of being unsafe. Proceed with caution.
          </p>
          
          <div id="reasons-toggle" style="
            background: #f5f5f5;
            border-radius: 8px;
            padding: 12px;
            margin-bottom: 12px;
            cursor: pointer;
            user-select: none;
            font-size: 13px;
          ">
            <span style="font-weight: 600;">Why? ▼</span>
            <div id="reasons-list" style="display: none; margin-top: 8px; max-height: 150px; overflow-y: auto;">
              ${analysis.reasons.map(r => `<div style="color: #555; margin: 4px 0; font-size: 12px;">• ${r}</div>`).join('')}
              <div style="color: #888; margin: 4px 0; font-size: 11px;">Score: ${analysis.score}/100</div>
            </div>
          </div>

          <div style="display: flex; gap: 12px;">
            <button id="neurosafe-back" style="
              flex: 1;
              padding: 12px;
              border: none;
              border-radius: 8px;
              background: #4CAF50;
              color: white;
              font-size: 14px;
              font-weight: 600;
              cursor: pointer;
            ">Go Back</button>
            <button id="neurosafe-proceed" style="
              flex: 1;
              padding: 12px;
              border: none;
              border-radius: 8px;
              background: #ff5252;
              color: white;
              font-size: 14px;
              font-weight: 600;
              cursor: pointer;
            ">Proceed Anyway</button>
          </div>
        </div>
      </div>
    `;

    document.body.appendChild(container);

    // Toggle reasons
    document.getElementById('reasons-toggle').addEventListener('click', (e) => {
      e.stopPropagation();
      const list = document.getElementById('reasons-list');
      const toggle = document.getElementById('reasons-toggle');
      const isHidden = list.style.display === 'none';
      list.style.display = isHidden ? 'block' : 'none';
      toggle.textContent = isHidden ? 'Why? ▲' : 'Why? ▼';
    });

    document.getElementById('neurosafe-back').addEventListener('click', () => {
      document.getElementById(INTERSTITIAL_ID).remove();
      history.back();
    });

    document.getElementById('neurosafe-proceed').addEventListener('click', () => {
      document.getElementById(INTERSTITIAL_ID).remove();
      chrome.runtime.sendMessage({ type: 'RISK_EVENT' }).catch(() => {});
    });

    // Report risk event
    chrome.runtime.sendMessage({ type: 'RISK_EVENT' }).catch(() => {});
  }

  // Focus interrupt overlay
  async function showFocusInterrupt() {
    if (document.getElementById(FOCUS_INTERRUPT_ID)) return;

    const container = document.createElement('div');
    container.id = FOCUS_INTERRUPT_ID;
    container.innerHTML = `
      <div style="
        position: fixed;
        inset: 0;
        background: rgba(0,0,0,0.5);
        display: flex;
        align-items: center;
        justify-content: center;
        z-index: 9999998;
      ">
        <div style="
          background: white;
          border-radius: 12px;
          padding: 32px;
          text-align: center;
          box-shadow: 0 10px 40px rgba(0,0,0,0.3);
          font-family: system-ui, sans-serif;
        ">
          <div style="font-size: 36px; margin-bottom: 12px;">⏸️</div>
          <h3 style="margin: 0 0 12px; font-size: 18px;">Quick Pause</h3>
          <p style="margin: 0 0 20px; color: #666; font-size: 14px;">
            You've encountered multiple risky sites quickly. Take a moment to stay safe.
          </p>
          <div style="display: flex; gap: 12px;">
            <button id="focus-back" style="
              flex: 1;
              padding: 12px;
              border: none;
              border-radius: 8px;
              background: #4CAF50;
              color: white;
              font-weight: 600;
              cursor: pointer;
            ">Go Back</button>
            <button id="focus-continue" style="
              flex: 1;
              padding: 12px;
              border: none;
              border-radius: 8px;
              background: #2196F3;
              color: white;
              font-weight: 600;
              cursor: pointer;
            ">Continue</button>
          </div>
        </div>
      </div>
    `;

    document.body.appendChild(container);

    document.getElementById('focus-back').addEventListener('click', () => {
      document.getElementById(FOCUS_INTERRUPT_ID).remove();
      history.back();
    });

    document.getElementById('focus-continue').addEventListener('click', () => {
      document.getElementById(FOCUS_INTERRUPT_ID).remove();
    });
  }

  // Message handling
  chrome.runtime.onMessage.addListener((msg, sender, response) => {
    if (msg.type === 'SHOW_INTERSTITIAL') {
      showInterstitial(msg.data);
      response({ ok: true });
    } else if (msg.type === 'SHOW_FOCUS_INTERRUPT') {
      showFocusInterrupt();
      response({ ok: true });
    }
  });

  // Initialize
  (async function init() {
    await loadSettings();
    injectWidget();
  })();

  // Listen for settings changes
  chrome.storage.onChanged.addListener((changes, areaName) => {
    if (areaName === 'local') {
      loadSettings().then(() => {
        if (!settings.widgetEnabled && document.getElementById(WIDGET_ID)) {
          document.getElementById(WIDGET_ID).remove();
        } else if (settings.widgetEnabled && !document.getElementById(WIDGET_ID)) {
          injectWidget();
        }
      });
    }
  });
})();
