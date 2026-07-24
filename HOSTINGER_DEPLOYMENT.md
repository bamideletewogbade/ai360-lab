# AI 360 Lab on Hostinger

AI 360 Lab is a full Next.js application with server-side API routes. Deploy it
as a **Node.js Web App** using Hostinger's **Next.js** framework preset. Do not
deploy it as a static website.

## Requirements

- Hostinger Business Web Hosting or a Cloud hosting plan
- GitHub repository access
- A newly rotated OpenRouter API key

## Create the application

1. In hPanel, open **Websites** and select **Add Website**.
2. Choose **Deploy Web App** or **Node.js Web App**.
3. Select **Import Git Repository**, authorize GitHub, and choose the
   `ai360-lab` repository.
4. Deploy the `main` branch.
5. Confirm these settings:

   - Framework: `Next.js`
   - Node.js: `22.x`
   - Package manager: `npm`
   - Install command: `npm install` or Hostinger's default
   - Build command: `npm run build`
   - Start command: `npm start`
   - Output directory, if requested: `.next`
   - Entry file: leave empty when the Next.js preset is selected

## Production environment variables

Add these in hPanel. Never prefix the OpenRouter key with `NEXT_PUBLIC_`.

```text
OPENROUTER_API_KEY=<newly rotated key>
OPENROUTER_SITE_URL=https://lab.aithreesixty.tech
OPENROUTER_SITE_NAME=AI 360 Lab
AI360_RATE_CHAT_PER_MINUTE=12
AI360_RATE_CHAT_PER_DAY=80
AI360_RATE_AGENT_PER_MINUTE=4
AI360_RATE_AGENT_PER_DAY=16
AI360_RATE_VOICE_PER_MINUTE=5
AI360_RATE_VOICE_PER_DAY=24
```

Deploy the temporary Hostinger URL first. Open `/api/health` and confirm it
returns `"status":"ok"` and `"aiConfigured":true`.

## Connect the subdomain

1. From the Node.js application dashboard, select **Connect domain**.
2. Enter `lab.aithreesixty.tech`.
3. If `aithreesixty.tech` uses Hostinger nameservers, Hostinger creates the DNS
   routing and SSL certificate automatically.
4. If the domain uses external nameservers, add the DNS record shown by hPanel
   at the provider that controls DNS.
5. If a previous CNAME for `lab` points to another platform, remove it before
   connecting Hostinger.

After changing environment variables or deployment settings, use
**Settings & Redeploy** so the new values take effect.
