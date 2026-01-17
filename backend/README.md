# NeuroSafe Backend - Vercel Deployment

## Deployment Steps

### 1. Install Vercel CLI
```bash
npm i -g vercel
```

### 2. Login to Vercel
```bash
vercel login
```

### 3. Deploy from backend directory
```bash
cd backend
vercel
```

### 4. Set Environment Variables in Vercel Dashboard

Go to your Vercel project dashboard → Settings → Environment Variables

Add these variables:
- `SAFE_BROWSING_API_KEY` - Your Google Safe Browsing API key
- `OTX_API_KEY` - Your AlienVault OTX API key
- `VIRUSTOTAL_API_KEY` - Your VirusTotal API key
- `AI_PROVIDER` - "gemini", "openrouter", or "none"
- `AI_API_KEY` - Your AI provider API key (if using AI)
- `CORS_ORIGINS` - `chrome-extension://YOUR_EXTENSION_ID_HERE`
- `OFFICIAL_DOMAIN_ALLOWLIST` - Comma-separated list of official domains
- `CACHE_TTL` - `600` (cache time in seconds)
- `PORT` - `3000` (optional, Vercel handles this)

### 5. Deploy to Production
```bash
vercel --prod
```

### 6. Update Extension
After deployment, copy your Vercel URL (e.g., `https://your-backend.vercel.app`) and update `BACKEND_URL` in `extension/background.js`:

```javascript
const BACKEND_URL = 'https://your-backend.vercel.app';
```

### 7. Update CORS After Extension Upload
Once you upload your extension to Chrome Web Store and get the extension ID:
1. Go to Vercel Dashboard → Your Project → Settings → Environment Variables
2. Update `CORS_ORIGINS` to include your extension ID:
   ```
   chrome-extension://your-actual-extension-id
   ```
3. Redeploy if needed

## Testing Locally
```bash
npm install
npm start
```

## Notes
- Vercel automatically installs dependencies from package.json
- Environment variables must be set in Vercel Dashboard
- The backend will be available at your Vercel domain
- CORS is configured to accept Chrome extension origins
