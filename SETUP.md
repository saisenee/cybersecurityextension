# NeuroSafe Copilot - Setup & Test Guide

## ⚡ 10-Minute Setup

### Step 1: Start Backend (2 min)

```bash
cd NeuroSafe-Copilot/backend
npm install
npm start
```

✅ You should see:
```
🛡️ NeuroSafe Backend running on http://localhost:3000
```

### Step 2: Load Extension (1 min)

1. Open Chrome → `chrome://extensions`
2. Enable **Developer mode** (top right)
3. Click **Load unpacked**
4. Select `NeuroSafe-Copilot/extension` folder
5. ✅ You should see the extension loaded with 🛡️ icon

### Step 3: Enable File Access (1 min)

1. On the extension card, click **Details**
2. Scroll down → toggle ON "Allow access to file URLs"
3. ✅ Now the extension can analyze local demo pages

### Step 4: Open Demo Page (1 min)

**Option A: Direct file**
```bash
# Mac/Linux
open NeuroSafe-Copilot/docs/demo-pages/cra-refund-scam.html

# Windows
start NeuroSafe-Copilot\docs\demo-pages\cra-refund-scam.html
```

**Option B: Local server**
```bash
cd NeuroSafe-Copilot
python -m http.server 8000
# Visit http://localhost:8000/docs/demo-pages/
```

### Step 5: Test the Extension (5 min)

1. **See the floating widget**: Green 🛡️ circle (bottom right)
2. **Click it**: Triggers `/analyze` → detects CRA scam
3. **See interstitial**: Warning overlay appears
4. **Expand "Why?"**: Shows reasons
5. **Click "Go Back"**: Closes overlay
6. **Open side panel**: Click extension icon → panel appears
7. **See explanation**: Click "📖 Explain This"
8. **See cards**: Click "Learn" tab → micro-learning cards

---

## 🧪 Test Checklist

- [ ] Backend running on `http://localhost:3000`
- [ ] Extension loaded with 🛡️ icon visible
- [ ] Floating widget appears on any page
- [ ] Widget is draggable and snaps to corners
- [ ] Clicking widget shows warning on scam page
- [ ] Side panel opens and shows verdict
- [ ] "Explain This" button shows explanation
- [ ] "Learn" tab shows learning cards
- [ ] Settings page lets you toggle options
- [ ] Reduced motion toggle works
- [ ] Focus Mode: multiple risky events show interrupt

---

## 📋 Demo Pages

### CRA Refund Scam
**File:** `docs/demo-pages/cra-refund-scam.html`

**What it shows:**
- CRA-branded page
- Urgent refund message
- 24-hour expiration threat
- "Verify Now" button

**Expected:** ⚠️ SUSPICIOUS verdict, CRA keywords detected

### Interac Escrow Scam
**File:** `docs/demo-pages/interac-escrow-scam.html`

**What it shows:**
- Fake Interac e-transfer
- Processing/unlock fee request
- Pressure to pay immediately

**Expected:** ⛔ DANGEROUS verdict, escrow + fee keywords detected

### Safe Example
**File:** `docs/demo-pages/safe-example.html`

**What it shows:**
- Real Amazon-like site
- Professional design
- No urgency or pressure

**Expected:** ✅ SAFE verdict, no warnings

---

## 🔧 Troubleshooting

### Backend Not Starting
```bash
# Check if port 3000 is in use
lsof -i :3000  # Mac/Linux
netstat -ano | findstr :3000  # Windows

# Kill process
kill -9 <PID>  # Mac/Linux
taskkill /PID <PID> /F  # Windows
```

### Extension Not Showing Warnings
1. Check backend is running: `curl http://localhost:3000/health`
2. Open DevTools: `F12` → Console → look for errors
3. Reload extension: `chrome://extensions` → reload button

### Widget Not Appearing
1. Go to extension Settings → toggle "Show floating widget" ON
2. Reload page
3. Check console for errors

### No Learning Cards
- Ensure backend is responding: `curl http://localhost:3000/analyze -X POST -H "Content-Type: application/json" -d '{"url":"http://example.com"}'`
- Check for backend errors in terminal

---

## 📊 API Testing

### Test `/analyze` Endpoint
```bash
curl http://localhost:3000/analyze \
  -X POST \
  -H "Content-Type: application/json" \
  -d '{
    "url": "http://malicious-example.com",
    "pageTitle": "Refund",
    "snippet": "urgent refund cra benefit verify now"
  }'
```

### Expected Response (CRA Scam)
```json
{
  "verdict": "SUSPICIOUS",
  "score": 75,
  "reasons": ["CRA refund/benefit scam pattern"],
  "tags": ["CRA_REFUND_URGENCY"],
  "actions": [...]
}
```

---

## 💡 Pro Tips

1. **Check cache size**: `curl http://localhost:3000/health`
2. **Monitor logs**: Terminal shows `[Analyze]`, `[Cache]` messages
3. **Test lookalikes**: Try `amaazon.com` vs `amazon.com`
4. **Test multiple scams**: Open CRA + Interac + good site → triggers Focus Mode after 2 risky
5. **Inspect side panel**: Right-click → Inspect to debug CSS/JS

---

## 🎯 Devpost Demo (2 min)

**Script:**

1. *"This is NeuroSafe Copilot, a Chrome extension for neuro-inclusive cybersecurity."*
2. Show backend running → explain `/analyze` endpoint
3. Open demo CRA page → show floating widget → click it
4. Show interstitial warning → click "Why?" to expand reasons
5. Open side panel → show Status + Learn + Settings
6. Click "Explain This" → show AI explanation
7. Click "Learn" → show micro-learning cards
8. Mention: "Built in 24 hours, zero external UI libraries, fully accessible, privacy-first"

**Key talking points:**
- ✅ Deterministic threat detection (no AI for verdict)
- ✅ Canada-specific scams (CRA + Interac)
- ✅ Neuro-inclusive UX (calm, accessible, focus-mode)
- ✅ Privacy (no full HTML, no tracking)
- ✅ Learning cards (tag-based, safe actions only)

---

## 📞 Quick Help

**Q: Nothing works!**
A: Check if both services are running:
```bash
# Terminal 1: Backend
cd backend && npm start

# Terminal 2: Open extension on demo page
# Should see widget + warnings
```

**Q: Widget disabled?**
A: Go to Settings tab in side panel → toggle "Show floating widget"

**Q: No explanations?**
A: Backend needs to be running. Check: `curl http://localhost:3000/health`

---

**You're ready to demo! 🎉**
