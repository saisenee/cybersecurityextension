# 🛡️ NeuroSafe Copilot

**A neuro-inclusive Chrome extension (MV3) for cybersecurity threat detection with accessible UX, floating widget, and AI-powered explanations.**

Built for the Hackville 24-hour hackathon with a focus on accessibility for users with neurological and processing disabilities.

---

## 📋 Features

### Core Threat Detection
- **Google Safe Browsing API** integration for malware/phishing detection
- **URLhaus** database checking
- **Lookalike domain detection** (Levenshtein similarity)
- **Canada-specific scam heuristics**:
  - CRA refund/benefit scams (urgency + keywords)
  - Interac e-transfer escrow/processing fee schemes
- **Deterministic scoring** (0-100) + reasons + tags + actions
- **Caching** to reduce API calls and improve performance

### Neuro-Inclusive UX
- **Floating draggable widget** (snap to corners, toggleable)
- **Side Panel** with tabs:
  - Status: verdict + score + reasons + "Explain" + "Deep Check"
  - Learn: AI-generated micro-learning cards
  - Settings: accessibility toggles
- **Interstitial warnings** (SUSPICIOUS/DANGEROUS sites)
  - Large icon + clear messaging
  - Expandable "Why?" section
  - Reduced motion option for accessibility
- **Focus Mode**: calm interrupt overlay if ≥2 risky events in 60 seconds
- **Reading level preference** (simple vs. standard)

### AI & Explanations
- Plain-language explanations (via backend)
- Micro-learning cards based on threat tags
- Safe action suggestions (official domains + search actions)
- No AI-invented unsafe alternatives

### Privacy
- Never sends full HTML
- Never sends form data or passwords
- Only sends: URL + page title + short snippet (≤5000 chars)
- Learning cards generated from threat tags only

---

## 📁 Project Structure

```
NeuroSafe-Copilot/
├── backend/
│   ├── package.json
│   ├── .env.example
│   └── server.js
├── extension/
│   ├── manifest.json
│   ├── background.js
│   ├── content.js
│   ├── sidepanel.html
│   ├── sidepanel.js
│   └── sidepanel.css
└── docs/
    └── demo-pages/
        ├── cra-refund-scam.html
        ├── interac-escrow-scam.html
        └── safe-example.html
```

---

## 🚀 Quick Start

### 1. Backend Setup

```bash
cd backend
npm install
cp .env.example .env
# Edit .env with your API keys (optional for demo)
npm start
```

**Backend runs on:** `http://localhost:3000`

### 2. Extension Installation

1. Go to `chrome://extensions`
2. Enable **Developer mode** (top right toggle)
3. Click **Load unpacked**
4. Select the `/extension` folder
5. Pin the extension to toolbar

### 3. Test with Demo Pages

Open any of the demo pages:
- **CRA Refund Scam**: `docs/demo-pages/cra-refund-scam.html`
- **Interac Escrow Scam**: `docs/demo-pages/interac-escrow-scam.html`
- **Safe Example**: `docs/demo-pages/safe-example.html`

```bash
# Option 1: Open in Chrome directly
open docs/demo-pages/cra-refund-scam.html

# Option 2: Use local server
python -m http.server 8000
# Visit http://localhost:8000/docs/demo-pages/
```

---

## 🔑 Environment Variables

### Backend (.env)

```env
# Server
PORT=3000
NODE_ENV=development

# API Keys (optional, demo works without these)
SAFE_BROWSING_API_KEY=your_key_here
OTX_API_KEY=your_key_here
VIRUSTOTAL_API_KEY=your_key_here

# AI Provider (set to "none" for demo)
AI_PROVIDER=none
AI_API_KEY=

# Official domain allowlist (comma-separated)
OFFICIAL_DOMAIN_ALLOWLIST=amazon.com,google.com,microsoft.com,interac.ca,canada.ca,cra-arc.gc.ca,apple.com

# CORS
CORS_ORIGINS=chrome-extension://your-extension-id,http://localhost:3000

# Cache TTL
CACHE_TTL=600
```

### How to Get API Keys

1. **Google Safe Browsing**: https://developers.google.com/safe-browsing/v4/get-started
2. **URLhaus**: Free, no key needed (uses public API)
3. **OTX (AlienVault)**: https://otx.alienvault.com/api
4. **VirusTotal**: https://www.virustotal.com/gui/home/upload

---

## 📊 Backend Endpoints

### POST `/analyze`
Core threat detection.

**Request:**
```json
{
  "url": "https://example.com",
  "pageTitle": "Example Page",
  "snippet": "First 2000 chars of page text"
}
```

**Response:**
```json
{
  "verdict": "SAFE|SUSPICIOUS|DANGEROUS",
  "score": 0-100,
  "reasons": ["reason 1", "reason 2"],
  "tags": ["LOOKALIKE_DOMAIN", "CRA_REFUND_URGENCY"],
  "actions": [
    {
      "type": "OPEN_OFFICIAL",
      "label": "Go to official site",
      "url": "https://official.com"
    }
  ],
  "meta": {
    "domain": "example.com",
    "lookalike": { "brand": "amazon.com", "similarity": 0.85 }
  }
}
```

### POST `/explain`
Plain-language explanation.

**Request:**
```json
{
  "url": "https://example.com",
  "verdict": "DANGEROUS",
  "tags": ["CRA_REFUND_URGENCY"],
  "reasons": ["CRA scam pattern detected"],
  "reading_level": "simple|standard"
}
```

**Response:**
```json
{
  "summary": "This site looks like a CRA scam.",
  "bullets": ["Never share passwords", "Visit canada.ca directly"],
  "next_steps": ["Search for official CRA site", "Call 1-800-959-8281"]
}
```

### POST `/cards`
Micro-learning cards.

**Request:**
```json
{
  "verdict": "DANGEROUS",
  "tags": ["CRA_REFUND_URGENCY"],
  "reasons": [],
  "reading_level": "simple|standard",
  "max_cards": 3
}
```

**Response:**
```json
{
  "cards": [
    {
      "title": "CRA Will Never Rush You",
      "bullets": ["Real CRA never emails urgently", "Scammers create fake urgency"],
      "next_step": "Log into CRA.gc.ca yourself"
    }
  ]
}
```

### POST `/deepcheck`
Optional threat intelligence enrichment.

**Request:**
```json
{
  "url": "https://example.com"
}
```

**Response:**
```json
{
  "otx": {
    "pulseCount": 5,
    "tags": ["malware", "phishing"]
  },
  "virustotal": {
    "positives": 12,
    "total": 78,
    "permalink": "https://www.virustotal.com/gui/home/url/"
  }
}
```

### GET `/health`
Health check.

**Response:**
```json
{
  "status": "ok",
  "cacheSize": 42
}
```

---

## 🧠 Threat Detection Logic

### Deterministic Scoring

1. **Safe Browsing Match** → DANGEROUS (score ≥90) + tag `SAFE_BROWSING_MATCH`
2. **URLhaus Match** → DANGEROUS (score ≥90) + tag `URLHAUS_MATCH`
3. **Lookalike Domain** (≥0.75 similarity) → SUSPICIOUS (score +35) + tag `LOOKALIKE_DOMAIN`
4. **Interac Scam** (escrow/fee keywords) → DANGEROUS (score ≥88) + tag `INTERAC_ESCROW_FEE`
5. **CRA Scam** (CRA keywords + urgency + urgency signals) → SUSPICIOUS (score 70+) + tag `CRA_REFUND_URGENCY`
6. **Generic Phishing** (≥2 suspicious keywords) → SUSPICIOUS (score +20) + tag `PHISHING_KEYWORDS`

**Final Verdict:**
- Score ≥75 → **DANGEROUS**
- Score 50-74 → **SUSPICIOUS**
- Score <50 → **SAFE**

### Heuristic Keywords

**Urgency:** urgent, immediately, expires, final notice, act now, verify now, suspended, limited time, 24 hours

**CRA:** cra, canada revenue agency, gst, hst, refund, benefit, carbon rebate, my account, gckey

**Interac:** interac, e-transfer, escrow, processing fee, deposit pending, unlock transfer

**Phishing:** confirm, verify, urgent action, click here, update payment, unusual activity

---

## 🎨 Extension UI

### Floating Widget
- 60x60px circular button (green, draggable)
- Snaps to 4 corners (saves position)
- Click to check current page
- Toggleable in Settings

### Side Panel (2-in-1 View)
1. **Status Tab**
   - Verdict card (safe/suspicious/dangerous)
   - Score visualization
   - Reasons list
   - Action buttons (Open Official / Search Official)
   - "Explain This" button (calls backend)
   - "Deep Check" button (threat intel)

2. **Learn Tab**
   - AI-generated micro-learning cards
   - 3 cards max
   - Tag-based (not page content)

3. **Settings Tab**
   - Widget toggle
   - Focus Mode toggle
   - Reduced motion toggle
   - Reading level (simple/standard)
   - Backend URL (for custom server)
   - Privacy note

### Interstitial Overlay
- Full-screen dark overlay
- White panel with icon + message
- Expandable "Why?" section
- "Go Back" (green) + "Proceed Anyway" (red) buttons
- Respects reduced motion setting

### Focus Mode Interrupt
- Calm blue overlay
- "Quick pause… Take a moment"
- "Go Back" or "Continue" buttons
- Triggers after ≥2 risky events in 60 seconds

---

## 📱 Accessibility Features

✅ **Neuro-Inclusive Design**
- Simple, non-alarmist language
- Reduced motion support
- Large, high-contrast buttons
- Reading level preferences (simple/standard)
- Clear hierarchy and whitespace

✅ **Cognitive Load Reduction**
- Widget is optional (can disable)
- Side panel tabs (not overwhelming)
- Focus Mode to prevent decision fatigue
- Calm colors and tone

✅ **WCAG Compliance**
- Semantic HTML
- ARIA labels
- Keyboard navigation
- Color contrast ratios ≥4.5:1

---

## 🧪 Test Scenarios

### 1. CRA Refund Scam
**File:** `docs/demo-pages/cra-refund-scam.html`
- ✅ Detect urgency keywords
- ✅ Detect CRA keywords
- ✅ Show SUSPICIOUS verdict
- ✅ Offer action: "Go to canada.ca"

### 2. Interac Escrow Scam
**File:** `docs/demo-pages/interac-escrow-scam.html`
- ✅ Detect Interac + escrow + fee keywords
- ✅ Show DANGEROUS verdict
- ✅ Suggest official Interac site

### 3. Safe Page
**File:** `docs/demo-pages/safe-example.html`
- ✅ Show SAFE verdict
- ✅ No warnings

### 4. Lookalike Domain
Try visiting a domain like `amamzon.com` or `micrasoft.com`:
- ✅ Detect similarity
- ✅ Show SUSPICIOUS verdict
- ✅ Offer official alternative

---

## 📊 Performance & Caching

- **Cache TTL:** 10 minutes (600 sec, configurable)
- **Max Cache Size:** Unlimited (in-memory)
- **Cache Key:** SHA-256(URL)
- **Benefit:** Avoid rate limits; fast repeat checks

Example cache hit:
```
[Cache] Hit for https://example.com
Response time: <5ms
```

---

## 🔒 Security & Privacy

✅ **No Full HTML Sent**
- Only URL + title + 5000-char snippet

✅ **No Form Data**
- Never intercepts or sends form input values

✅ **CORS Restricted**
- Backend only accepts requests from extension origin

✅ **No Persistent Logs**
- Results cached in memory only (lost on restart)

✅ **No Tracking**
- No user analytics or telemetry

---

## 🐛 Debugging

### Backend Logs
```
[Analyze] Checking Safe Browsing for example.com
[Cache] Hit for ...
[BG] NeuroSafe initialized
```

### Extension Console
Press `F12` in DevTools to see:
```
[Content] NeuroSafe loaded
[Content] Click event detected
[BG] Analyzing URL: https://example.com
```

### Clear Extension Data
```javascript
// In DevTools console on extension page:
chrome.storage.local.clear();
```

---

## 🚀 Devpost Submission

### Quick Demo Script (2 min)

1. **Show backend running**: `npm start` → explain threat detection
2. **Load extension**: Show manifest + content script injection
3. **Click floating widget**: Trigger `/analyze` call
4. **Open side panel**: Show Status + Learn + Settings tabs
5. **Test demo page**: Open CRA scam page → show interstitial overlay
6. **Explain**: Mention neuro-inclusive UX, accessibility features
7. **Devpost callout**: "Built in 24 hours, zero external UI libraries"

### Key Points
- ✅ Deterministic threat detection (AI-free verdict logic)
- ✅ Neuro-inclusive UX (calm, accessible, focus-friendly)
- ✅ Canada-specific heuristics (CRA + Interac scams)
- ✅ Floating widget + side panel + interstitials
- ✅ Privacy-first (no full HTML, no tracking)
- ✅ Learning cards (tag-based, not page-specific)

---

## 📞 Support

**Getting Started Issues?**
1. Check backend is running: `curl http://localhost:3000/health`
2. Check extension is loaded: `chrome://extensions`
3. Check browser console for errors: `F12` → Console

**API Key Issues?**
- Leave API keys blank for demo mode (only local heuristics)
- Lookalike and keyword-based detection works without keys

**Performance Issues?**
- Increase `CACHE_TTL` to reduce API calls
- Reduce `max_cards` in `/cards` endpoint

---

## 📝 License

Open source, hackathon submission.

---

**Built with ❤️ for cybersecurity accessibility.**
