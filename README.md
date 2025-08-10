# DDHQ Lite — WP Fetch Tester

This is Step 2 of your DDHQ tablet app. It lets you pull a WordPress post by ID using the REST API and view the content.

## How to run locally
1. Install Node (v18+). Then:
```bash
npm install
npm run dev
```
2. Open http://localhost:3000

## How to deploy (Vercel)
1. Create a new Vercel project and import this repo/folder.
2. No env vars needed yet.
3. Deploy.
4. Visit the app URL and enter your Site URL, WP username, App Password, and a post ID. Click "Fetch from WordPress".

## Next steps
- Step 3 will add Supabase storage + SEO meta pulls + TinyMCE editor.