# SafeBrowse Aid (Chrome Extension, MV3)

Detects risky sites, links, and downloads using a simple local blocklist plus an optional remote feed (URLHaus). Shows an accessible warning with safer alternatives and allows a whitelist.

## Features
- Warns on risky link clicks with an overlay; lets users go back, proceed, or open a suggested alternative.
- Cancels flagged downloads automatically.
- Toggle protection in the popup; see blocklist stats and force updates.
- Manage whitelist and custom blocklist in Options.
- Accessibility-minded UI with simple language and contrast.

## Install (Unpacked)
1. Open Chrome → Menu → Extensions → Manage Extensions.
2. Toggle "Developer mode" on.
3. Click "Load unpacked" and pick this folder (the one with `manifest.json`).

## Try it
- Click the extension icon to ensure Protection is On.
- On any page, click a link to `malicious.example` or `phishing.test` (you can create a test link like `<a href="http://malicious.example">bad</a>`). You should see the warning overlay.
- Downloads from flagged hosts will be cancelled.

## Notes
- Remote blocklist is fetched from URLHaus every ~6 hours (first 2000 entries for demo). You can update manually from the popup or Options.
- This is a demo scaffold. For production, integrate additional signals (e.g., Google Safe Browsing) and more robust UX and localization.
