// SafeBrowse Aid - Content Script

(function () {
  console.log("[SafeBrowse Aid] Content script loaded on:", window.location.href);
  
  const OVERLAY_ID = "safebrowse-aid-overlay";
  const MAX_SCAN_LINKS = 100;

  function getAbsoluteUrl(href) {
    try {
      return new URL(href, location.href).href;
    } catch {
      return null;
    }
  }

  function checkUrl(url) {
    console.log("[SafeBrowse Aid] Sending CHECK_URL message for:", url);
    return new Promise((resolve) => {
      chrome.runtime.sendMessage({ type: "CHECK_URL", url }, (response) => {
        console.log("[SafeBrowse Aid] Received response:", response);
        resolve(response);
      });
    });
  }

  function createOverlay(details) {
    console.log("[SafeBrowse Aid] Creating overlay for:", details);
    if (document.getElementById(OVERLAY_ID)) return;

    const overlay = document.createElement("div");
    overlay.id = OVERLAY_ID;
    overlay.setAttribute("role", "dialog");
    overlay.setAttribute("aria-modal", "true");
    overlay.style.position = "fixed";
    overlay.style.inset = "0";
    overlay.style.background = "rgba(0,0,0,.6)";
    overlay.style.zIndex = "2147483647";
    overlay.style.display = "flex";
    overlay.style.alignItems = "center";
    overlay.style.justifyContent = "center";

    const panel = document.createElement("div");
    panel.style.maxWidth = "600px";
    panel.style.width = "92%";
    panel.style.background = "#fff";
    panel.style.color = "#0b0b0b";
    panel.style.borderRadius = "12px";
    panel.style.boxShadow = "0 10px 30px rgba(0,0,0,.2)";
    panel.style.padding = "24px";
    panel.style.fontFamily = "system-ui, -apple-system, Segoe UI, Roboto, Arial, sans-serif";
    panel.style.lineHeight = "1.6";

    const h = document.createElement("h2");
    h.textContent = "⚠️ Safety Check";
    h.style.margin = "0 0 8px";
    h.style.color = "#d32f2f";

    const p = document.createElement("p");
    const host = details.host || "this site";
    p.textContent = `${host} looks risky (${details.reason}).`;
    p.style.margin = "0 0 12px";
    p.style.fontSize = "18px";

    const ul = document.createElement("ul");
    ul.style.margin = "0 0 16px 20px";
    ul.style.padding = "0";

    const li1 = document.createElement("li");
    li1.textContent = "Links and downloads from this site may be unsafe.";
    ul.appendChild(li1);

    const btnRow = document.createElement("div");
    btnRow.style.display = "flex";
    btnRow.style.gap = "12px";
    btnRow.style.flexWrap = "wrap";

    function makeBtn(label) {
      const b = document.createElement("button");
      b.textContent = label;
      b.style.fontSize = "16px";
      b.style.padding = "10px 14px";
      b.style.borderRadius = "8px";
      b.style.border = "1px solid #ccc";
      b.style.cursor = "pointer";
      b.style.background = "#f5f5f5";
      b.style.color = "#111";
      b.onmouseenter = () => (b.style.background = "#eee");
      b.onmouseleave = () => (b.style.background = "#f5f5f5");
      return b;
    }

    const backBtn = makeBtn("Go Back");
    backBtn.style.background = "#4caf50";
    backBtn.style.color = "white";
    backBtn.style.borderColor = "#388e3c";
    backBtn.style.flex = "1";
    backBtn.onclick = () => {
      console.log("[SafeBrowse Aid] User clicked Go Back");
      closeOverlay();
    };

    const proceedBtn = makeBtn("Proceed Anyway (Risky)");
    proceedBtn.style.background = "#ff5252";
    proceedBtn.style.color = "white";
    proceedBtn.style.borderColor = "#d32f2f";
    proceedBtn.style.flex = "1";
    proceedBtn.onclick = () => {
      console.log("[SafeBrowse Aid] User clicked Proceed Anyway");
      closeOverlay();
      // Small delay to let overlay close before navigation
      setTimeout(() => {
        if (details.originalHref) window.location.href = details.originalHref;
      }, 100);
    };

    btnRow.appendChild(backBtn);

    if (details?.suggestion?.url) {
      const altBtn = makeBtn(details.suggestion.label || "Open Alternative");
      altBtn.style.background = "#2196f3";
      altBtn.style.color = "white";
      altBtn.style.borderColor = "#1976d2";
      altBtn.onclick = () => {
        console.log("[SafeBrowse Aid] User clicked alternative link");
        window.open(details.suggestion.url, "_blank", "noopener");
      };
      btnRow.appendChild(altBtn);
    }

    btnRow.appendChild(proceedBtn);

    panel.appendChild(h);
    panel.appendChild(p);
    panel.appendChild(ul);
    panel.appendChild(btnRow);

    overlay.appendChild(panel);
    document.body.appendChild(overlay);

    function closeOverlay() {
      overlay.remove();
    }
  }

  async function handleLinkClick(e) {
    console.log("[SafeBrowse Aid] Click event detected, target:", e.target);
    
    if (e.defaultPrevented) {
      console.log("[SafeBrowse Aid] Event already prevented, skipping");
      return;
    }
    if (e.button !== 0) return; // left click only
    if (e.metaKey || e.ctrlKey || e.shiftKey || e.altKey) return;

    const a = e.target.closest && e.target.closest("a[href]");
    if (!a) {
      console.log("[SafeBrowse Aid] Not a link, skipping");
      return;
    }
    
    const href = a.getAttribute("href");
    const url = getAbsoluteUrl(href);
    console.log("[SafeBrowse Aid] Found link:", href, "=>", url);
    if (!url) return;

    try {
      const res = await checkUrl(url);
      
      if (res && res.malicious) {
        console.log("[SafeBrowse Aid] ⛔ BLOCKING malicious URL:", url);
        e.preventDefault();
        e.stopPropagation();
        e.stopImmediatePropagation();
        createOverlay({ ...res, originalHref: url });
      } else {
        console.log("[SafeBrowse Aid] ✅ URL is safe:", url);
      }
    } catch (err) {
      console.error("[SafeBrowse Aid] ❌ Error checking URL:", err);
    }
  }

  async function scanLinks() {
    console.log("[SafeBrowse Aid] Scanning links on page...");
    const anchors = Array.from(document.querySelectorAll("a[href]"));
    console.log("[SafeBrowse Aid] Found", anchors.length, "links");
    const slice = anchors.slice(0, MAX_SCAN_LINKS);
    for (const a of slice) {
      const url = getAbsoluteUrl(a.getAttribute("href"));
      if (!url) continue;
      try {
        const res = await checkUrl(url);
        if (res && res.malicious) {
          const tag = document.createElement("span");
          tag.textContent = " 🛡️";
          tag.setAttribute("aria-label", "Potentially unsafe link");
          tag.title = "This link may be unsafe";
          a.appendChild(tag);
        }
      } catch {
        // ignore
      }
    }
    console.log("[SafeBrowse Aid] Link scan complete");
  }

  // Initialize
  chrome.storage.local.get(["enabled"], (st) => {
    const enabled = st.enabled !== false;
    console.log("[SafeBrowse Aid] Protection enabled:", enabled);
    
    if (!enabled) {
      console.log("[SafeBrowse Aid] ⚠️ Protection is OFF - not attaching handlers");
      return;
    }
    
    console.log("[SafeBrowse Aid] ✅ Attaching click handler (capture phase)");
    document.addEventListener("click", handleLinkClick, true);
    
    setTimeout(() => {
      console.log("[SafeBrowse Aid] Starting link scan...");
      scanLinks();
    }, 1200);
  });
  
  console.log("[SafeBrowse Aid] Content script initialization complete");
})();
