# DDHQ Lite — Step 4 (SEO fields + save)

This package gives you a drop-in `pages/index.tsx` that:
- Connects to your WordPress site with Basic/Auth App Passwords
- Fetches a post with `?context=edit` so Rank Math meta comes through
- Maps common Rank Math keys into a simple SEO form
- Saves to your app via `POST /api/post_seo` (expected to upsert into a `post_seo` table)

## How to apply

1. Unzip.
2. In your repo, **replace**: `pages/index.tsx` with the file from this package.
3. Commit: `Step 4 - Pull Rank Math SEO + Save to post_seo`
4. Let Vercel redeploy.
5. In the app:
   - Fill **Connect Site** (base URL, username, app password).
   - Enter **Post ID** → **Fetch (context=edit)**.
   - Edit fields as needed, then **Save SEO in App**.

## Notes

- This step **does not push changes back to WordPress** yet; it only reads from WP and stores your chosen SEO in your app for later publishing.
- `/api/post_seo` should accept payload like:

```json
{
  "site_base_url": "https://thejunk.com",
  "post_id": 123,
  "post_slug": "my-post",
  "post_link": "https://thejunk.com/my-post/",
  "source": "ddhq-lite-step4",
  "fetched_at": "2025-08-10T08:00:00.000Z",
  "seo": {
    "title": "…",
    "description": "…",
    "focusKeyword": "…",
    "canonical": "…",
    "robots": "…",
    "schema": "{…}",
    "breadcrumbTitle": "…",
    "ogTitle": "…",
    "ogDescription": "…",
    "ogImage": "…",
    "twitterTitle": "…",
    "twitterDescription": "…",
    "twitterImage": "…"
  }
}
```

- If you don’t yet have `/api/post_seo`, create one that upserts on `(site_base_url, post_id)`.
  Use whatever DB layer you already have (Supabase, Prisma, etc.).