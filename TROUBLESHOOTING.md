# Troubleshooting: Website Not Being Flagged

## Quick Diagnosis Steps

### Step 1: Test Your API Keys

Run the API test script from the `backend/` directory:

```bash
cd backend
npm run test:apis
```

This will check:
- ✅ Environment variables are set
- ✅ URLhaus connection (no key needed)
- ✅ Google Safe Browsing API key validity
- ✅ OTX API key validity
- ✅ VirusTotal API key validity

### Step 2: Check Backend API Status

Visit (or curl) the API status endpoint:

```bash
curl https://cybersecurityextension.vercel.app/api-status
```

Or for local testing:
```bash
curl http://localhost:3000/api-status
```

Expected response:
```json
{
  "safe_browsing": true,
  "otx": true,
  "virustotal": true,
  "ai_provider": "none",
  "urlhaus": true,
  "cache_size": 5,
  "official_domains": 11
}
```

### Step 3: Test the Analyze Endpoint Directly

Test with a known malicious URL:

```bash
curl https://cybersecurityextension.vercel.app/analyze \
  -X POST \
  -H "Content-Type: application/json" \
  -d '{
    "url": "http://malware.wicar.org/data/ms14_064_ole_not_xp.html",
    "pageTitle": "Test",
    "snippet": "test malware site"
  }'
```

You should see a DANGEROUS verdict if URLhaus is working.

### Step 4: Check Extension Connection

1. Open Chrome DevTools (F12) on any page
2. Go to Console tab
3. Look for messages from the extension:
   - `[BG] Analysis result:` - Backend responded
   - `[BG] Analyze error:` - Backend connection failed
4. Check for CORS errors (red text about "blocked by CORS policy")

## Common Issues

### Issue 1: "Backend connection failed" in extension

**Symptoms:**
- Extension shows "Analysis failed" or generic errors
- Console shows `[BG] Analyze error: Failed to fetch`

**Solutions:**

1. **Verify backend URL in extension:**
   - Check [background.js](c:\Users\evans\OneDrive\Documents\GitHub\cybersecurityextension\extension\background.js) line 4
   - Should be: `const BACKEND_URL = 'https://cybersecurityextension.vercel.app';`

2. **Check CORS settings in Vercel:**
   - Go to Vercel Dashboard → Environment Variables
   - Verify `CORS_ORIGINS` includes `chrome-extension://*` OR your specific extension ID
   - After upload, update to: `chrome-extension://your-actual-extension-id`

3. **Verify Vercel deployment:**
   ```bash
   curl https://cybersecurityextension.vercel.app/health
   ```
   Should return: `{"status":"ok","cacheSize":0}`

### Issue 2: API Keys Not Working on Vercel

**Symptoms:**
- Local backend detects threats fine
- Vercel deployment doesn't detect known threats
- `/api-status` shows `false` for API keys

**Solutions:**

1. **Set Environment Variables in Vercel:**
   - Go to https://vercel.com/saisenees-projects/cybersecurityextension
   - Click "Settings" → "Environment Variables"
   - Add each key:
     ```
     SAFE_BROWSING_API_KEY = your_actual_key
     OTX_API_KEY = your_actual_key
     VIRUSTOTAL_API_KEY = your_actual_key
     ```

2. **Redeploy after adding variables:**
   - Go to "Deployments" tab
   - Click "..." menu on latest deployment
   - Click "Redeploy"

3. **Verify keys are active:**
   ```bash
   curl https://cybersecurityextension.vercel.app/api-status
   ```

### Issue 3: Known Malicious Site Not Detected

**Symptoms:**
- URLhaus says site is malicious
- Extension shows "SAFE" verdict

**Reasons:**

1. **Cache is serving old result:**
   - Clear cache by restarting backend
   - Wait 10 minutes (cache TTL)

2. **URL format mismatch:**
   - URLhaus stores exact URLs
   - If you test `http://example.com/path` but database has `https://example.com/path`, it won't match
   - Try both HTTP and HTTPS versions

3. **No API keys configured:**
   - Without API keys, only URLhaus works (no key needed)
   - URLhaus has limited coverage
   - Get free API keys for better detection:
     - Google Safe Browsing: https://developers.google.com/safe-browsing/v4/get-started
     - OTX: https://otx.alienvault.com/api
     - VirusTotal: https://www.virustotal.com/gui/home/upload

4. **Heuristics not triggered:**
   - If the page has no suspicious text (CRA, Interac, urgency keywords), heuristics won't trigger
   - This is expected - the extension needs content to analyze

### Issue 4: "Context access might be invalid" Warning

**Symptoms:**
- VS Code shows warning about NPM_TOKEN
- File is in `node_modules/undefsafe/.github/workflows/release.yml`

**Solution:**
- **Ignore it!** This is a third-party dependency's workflow file
- It has no impact on your extension
- Add `node_modules/` to VS Code's excluded files:
  ```json
  // .vscode/settings.json
  {
    "files.exclude": {
      "**/node_modules": true
    }
  }
  ```

## Testing Checklist

### Local Testing:
- [ ] Backend running: `npm start` in `backend/`
- [ ] Check logs for `[Analyze]` messages
- [ ] Test with: `npm run test:apis`
- [ ] Verify `/health` endpoint responds
- [ ] Check `/api-status` shows keys configured

### Extension Testing:
- [ ] Extension loaded in Chrome
- [ ] Background.js points to correct URL
- [ ] Console shows no CORS errors
- [ ] Widget appears on pages
- [ ] Side panel opens and loads

### Vercel Testing:
- [ ] Environment variables set in dashboard
- [ ] Latest deployment is live
- [ ] `curl` to `/health` succeeds
- [ ] `/api-status` shows keys as `true`
- [ ] Test `/analyze` with malicious URL

## Test URLs

### URLs Known to Be in URLhaus:
```
http://malware.wicar.org/data/ms14_064_ole_not_xp.html
```

### Google Safe Browsing Test URLs:
```
http://malware.testing.google.test/testing/malware/
http://testsafebrowsing.appspot.com/s/malware.html
```

### Test with Heuristics:
Create a test HTML with CRA scam content:
```html
<html>
<head><title>CRA Refund - Act Now</title></head>
<body>
<h1>Canada Revenue Agency - Urgent Refund Notice</h1>
<p>Your CRA refund of $1,250 is ready. Verify your account within 24 hours or it will expire.</p>
<button>Verify Now</button>
</body>
</html>
```

Expected: SUSPICIOUS verdict with `CRA_REFUND_URGENCY` tag

## Debug Mode

Add these lines to [server.js](c:\Users\evans\OneDrive\Documents\GitHub\cybersecurityextension\backend\server.js) after line 1 for verbose logging:

```javascript
// Enable verbose logging
process.env.DEBUG = 'true';
```

This will show detailed analysis steps in console.

## Getting Help

If issues persist:

1. Check backend logs for specific errors
2. Test API keys individually with `npm run test:apis`
3. Verify URL format matches database exactly
4. Check if site is actually in the threat database
5. Consider that newer/unknown threats may not be in databases yet

## Quick Fix Commands

```bash
# Restart backend
cd backend
npm start

# Test API keys
npm run test:apis

# Check Vercel status
curl https://cybersecurityextension.vercel.app/health
curl https://cybersecurityextension.vercel.app/api-status

# Reload extension
# In Chrome: chrome://extensions → click reload button

# Clear extension cache
# In Console: chrome.storage.local.clear()
```
