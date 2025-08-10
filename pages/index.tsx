import React, { useMemo, useState } from "react";

/**
 * DDHQ Lite — Step 4
 * SEO fields + save
 *
 * What this page does
 * - Connect Site: store WP base URL and Basic Auth creds (username:app-password)
 * - Fetch Post (?context=edit): pulls meta so Rank Math fields are available
 * - Extracts Rank Math keys and maps them to a simple UI
 * - Save SEO in App: POSTs a normalized record to /api/post_seo (upsert expected)
 *
 * Assumptions
 * - Your WP has Application Passwords enabled (or Basic Auth) and REST API exposed
 * - Your Next.js app provides an /api/post_seo endpoint that performs the upsert
 *   to a table named `post_seo` with a unique key on (site_base_url, post_id)
 * - You’re replacing only this file: pages/index.tsx
 *
 * Notes
 * - We do NOT mutate the WordPress post meta here. We only read from WP,
 *   let you edit in the UI, then save to your app’s `post_seo` (for later push).
 */

type RankMathSEO = {
  title?: string;
  description?: string;
  focusKeyword?: string;
  canonical?: string;
  robots?: string;
  schema?: string; // raw JSON or string
  breadcrumbTitle?: string;
  ogTitle?: string;
  ogDescription?: string;
  ogImage?: string;
  twitterTitle?: string;
  twitterDescription?: string;
  twitterImage?: string;
};

type WPPostResponse = {
  id: number;
  link?: string;
  slug?: string;
  title?: { rendered?: string };
  meta?: Record<string, any>;
};

function b64(input: string) {
  if (typeof window === "undefined") return "";
  return window.btoa(unescape(encodeURIComponent(input)));
}

function loadFromLS<T>(key: string, fallback: T): T {
  if (typeof window === "undefined") return fallback;
  try {
    const raw = window.localStorage.getItem(key);
    return raw ? (JSON.parse(raw) as T) : fallback;
  } catch {
    return fallback;
  }
}

function saveToLS(key: string, value: any) {
  if (typeof window === "undefined") return;
  window.localStorage.setItem(key, JSON.stringify(value));
}

export default function Home() {
  // Connection state
  const [siteUrl, setSiteUrl] = useState<string>(loadFromLS("ddhq_siteUrl", ""));
  const [username, setUsername] = useState<string>(loadFromLS("ddhq_username", ""));
  const [appPassword, setAppPassword] = useState<string>(loadFromLS("ddhq_appPassword", ""));

  // Post fetch state
  const [postId, setPostId] = useState<string>("");
  const [wpPost, setWpPost] = useState<WPPostResponse | null>(null);
  const [seo, setSeo] = useState<RankMathSEO>({});
  const [isFetching, setIsFetching] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [info, setInfo] = useState<string | null>(null);

  const authHeader = useMemo(() => {
    if (!username || !appPassword) return "";
    return `Basic ${b64(`${username}:${appPassword}`)}`;
  }, [username, appPassword]);

  function persistConn() {
    saveToLS("ddhq_siteUrl", siteUrl);
    saveToLS("ddhq_username", username);
    saveToLS("ddhq_appPassword", appPassword);
    setInfo("Connection saved locally.");
    setTimeout(() => setInfo(null), 2000);
  }

  async function testConnection() {
    setError(null);
    setInfo(null);
    try {
      if (!siteUrl) throw new Error("Add your Site URL first.");
      const r = await fetch(
        `${siteUrl.replace(/\/+$/, "")}/wp-json/`,
        { headers: authHeader ? { Authorization: authHeader } : undefined }
      );
      if (!r.ok) throw new Error(`WP REST check failed (${r.status})`);
      setInfo("WordPress REST API reachable.");
      setTimeout(() => setInfo(null), 2500);
    } catch (e: any) {
      setError(e?.message || "Connection test failed.");
    }
  }

  function extractRankMath(meta: Record<string, any> | undefined): RankMathSEO {
    const m = meta || {};
    // Common Rank Math meta keys (underscore variants returned by WP)
    const title = m["_rank_math_title"] ?? m["rank_math_title"] ?? "";
    const description = m["_rank_math_description"] ?? m["rank_math_description"] ?? "";
    const focusKeyword = m["_rank_math_focus_keyword"] ?? m["rank_math_focus_keyword"] ?? "";

    const canonical = m["rank_math_canonical_url"] ?? m["_rank_math_canonical_url"] ?? m["canonical"] ?? "";
    const robots = m["rank_math_robots"] ?? m["_rank_math_robots"] ?? m["robots"] ?? "";

    const schema = (() => {
      const raw = m["rank_math_schema"] ?? m["_rank_math_schema"] ?? m["schema"];
      if (!raw) return "";
      try {
        return typeof raw === "string" ? raw : JSON.stringify(raw, null, 2);
      } catch {
        return String(raw);
      }
    })();

    const breadcrumbTitle = m["rank_math_breadcrumb_title"] ?? m["_rank_math_breadcrumb_title"] ?? "";

    // OG/Twitter often live under these keys; projects vary so we accept common alternates
    const ogTitle = m["rank_math_facebook_title"] ?? m["_rank_math_facebook_title"] ?? m["og_title"] ?? "";
    const ogDescription = m["rank_math_facebook_description"] ?? m["_rank_math_facebook_description"] ?? m["og_description"] ?? "";
    const ogImage = m["rank_math_facebook_image"] ?? m["_rank_math_facebook_image"] ?? m["og_image"] ?? "";

    const twitterTitle = m["rank_math_twitter_title"] ?? m["_rank_math_twitter_title"] ?? m["twitter_title"] ?? "";
    const twitterDescription = m["rank_math_twitter_description"] ?? m["_rank_math_twitter_description"] ?? m["twitter_description"] ?? "";
    const twitterImage = m["rank_math_twitter_image"] ?? m["_rank_math_twitter_image"] ?? m["twitter_image"] ?? "";

    return {
      title,
      description,
      focusKeyword,
      canonical,
      robots,
      schema,
      breadcrumbTitle,
      ogTitle,
      ogDescription,
      ogImage,
      twitterTitle,
      twitterDescription,
      twitterImage,
    };
  }

  async function fetchPost() {
    setError(null);
    setInfo(null);
    setIsFetching(true);
    setWpPost(null);
    try {
      if (!siteUrl) throw new Error("Add your Site URL first.");
      if (!postId) throw new Error("Enter a Post ID.");

      const url = `${siteUrl.replace(/\/+$/, "")}/wp-json/wp/v2/posts/${postId}?context=edit`;
      const r = await fetch(url, {
        headers: {
          "Accept": "application/json",
          ...(authHeader ? { Authorization: authHeader } : {}),
        },
      });

      if (!r.ok) {
        const text = await r.text();
        throw new Error(`Fetch failed (${r.status}): ${text.slice(0, 200)}`);
      }

      const data = (await r.json()) as WPPostResponse;
      setWpPost(data);
      setSeo(extractRankMath(data.meta));
      setInfo("Post fetched. SEO fields populated.");
      setTimeout(() => setInfo(null), 2500);
    } catch (e: any) {
      setError(e?.message || "Failed to fetch post.");
    } finally {
      setIsFetching(false);
    }
  }

  async function saveSEO() {
    setError(null);
    setInfo(null);
    setIsSaving(true);
    try {
      if (!siteUrl) throw new Error("Add your Site URL first.");
      if (!postId) throw new Error("Enter a Post ID before saving.");

      // Normalize payload for your app's upsert
      const payload = {
        site_base_url: siteUrl.replace(/\/+$/, ""),
        post_id: Number(postId),
        post_slug: wpPost?.slug || null,
        post_link: wpPost?.link || null,
        source: "ddhq-lite-step4",
        fetched_at: new Date().toISOString(),
        seo: {
          title: seo.title ?? "",
          description: seo.description ?? "",
          focusKeyword: seo.focusKeyword ?? "",
          canonical: seo.canonical ?? "",
          robots: seo.robots ?? "",
          schema: seo.schema ?? "",
          breadcrumbTitle: seo.breadcrumbTitle ?? "",
          ogTitle: seo.ogTitle ?? "",
          ogDescription: seo.ogDescription ?? "",
          ogImage: seo.ogImage ?? "",
          twitterTitle: seo.twitterTitle ?? "",
          twitterDescription: seo.twitterDescription ?? "",
          twitterImage: seo.twitterImage ?? "",
        },
      };

      // POST to your app’s API. Expectation: upsert into `post_seo` table.
      const resp = await fetch("/api/post_seo", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });

      if (!resp.ok) {
        const t = await resp.text();
        throw new Error(`Save failed (${resp.status}): ${t.slice(0, 200)}`);
      }

      setInfo("Saved to post_seo (upsert).");
      setTimeout(() => setInfo(null), 2500);
    } catch (e: any) {
      setError(e?.message || "Failed to save SEO.");
    } finally {
      setIsSaving(false);
    }
  }

  function Field({
    label, value, onChange, textarea = false, placeholder
  }: {
    label: string;
    value?: string;
    onChange: (v: string) => void;
    textarea?: boolean;
    placeholder?: string;
  }) {
    return (
      <div className="flex flex-col gap-1">
        <label className="text-sm font-medium">{label}</label>
        {textarea ? (
          <textarea
            className="border rounded-lg p-2 min-h-[90px]"
            value={value || ""}
            onChange={(e) => onChange(e.target.value)}
            placeholder={placeholder}
          />
        ) : (
          <input
            className="border rounded-lg p-2"
            value={value || ""}
            onChange={(e) => onChange(e.target.value)}
            placeholder={placeholder}
          />
        )}
      </div>
    );
  }

  return (
    <div className="max-w-5xl mx-auto p-6 flex flex-col gap-6">
      <h1 className="text-2xl font-bold">DDHQ Lite — Step 4 (SEO fields + save)</h1>

      {/* Connection Card */}
      <div className="border rounded-2xl p-4 flex flex-col gap-3 shadow-sm">
        <div className="text-lg font-semibold">Connect Site</div>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
          <Field label="WordPress Site URL" value={siteUrl} onChange={setSiteUrl} placeholder="https://example.com" />
          <Field label="Username (Basic/Auth App Password)" value={username} onChange={setUsername} placeholder="wp-user" />
          <Field label="App Password" value={appPassword} onChange={setAppPassword} placeholder="abcd efgh ijkl mnop" />
        </div>
        <div className="flex gap-2">
          <button
            className="px-4 py-2 rounded-xl border bg-gray-50 hover:bg-gray-100"
            onClick={persistConn}
          >
            Save Connection
          </button>
          <button
            className="px-4 py-2 rounded-xl border bg-gray-50 hover:bg-gray-100"
            onClick={testConnection}
          >
            Test WP REST
          </button>
        </div>
        {info && <div className="text-green-700 text-sm">{info}</div>}
        {error && <div className="text-red-700 text-sm">{error}</div>}
      </div>

      {/* Fetch Card */}
      <div className="border rounded-2xl p-4 flex flex-col gap-3 shadow-sm">
        <div className="text-lg font-semibold">Fetch from WordPress</div>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-3 items-end">
          <Field label="Post ID" value={postId} onChange={setPostId} placeholder="12345" />
          <button
            className="px-4 py-2 rounded-xl border bg-gray-50 hover:bg-gray-100"
            onClick={fetchPost}
            disabled={isFetching}
          >
            {isFetching ? "Fetching…" : "Fetch (context=edit)"}
          </button>
          {wpPost?.title?.rendered && (
            <div className="text-sm text-gray-600 truncate">
              Title: <span className="font-medium">{wpPost.title.rendered}</span>
            </div>
          )}
        </div>
      </div>

      {/* SEO Fields Card */}
      <div className="border rounded-2xl p-4 flex flex-col gap-4 shadow-sm">
        <div className="text-lg font-semibold">SEO Fields</div>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <Field label="SEO Title" value={seo.title} onChange={(v) => setSeo({ ...seo, title: v })} />
          <Field label="SEO Description" value={seo.description} onChange={(v) => setSeo({ ...seo, description: v })} textarea />
          <Field label="Focus Keyword" value={seo.focusKeyword} onChange={(v) => setSeo({ ...seo, focusKeyword: v })} />
          <Field label="Canonical URL" value={seo.canonical} onChange={(v) => setSeo({ ...seo, canonical: v })} />
          <Field label="Robots" value={seo.robots} onChange={(v) => setSeo({ ...seo, robots: v })} />
          <Field label="Breadcrumb Title" value={seo.breadcrumbTitle} onChange={(v) => setSeo({ ...seo, breadcrumbTitle: v })} />
          <Field label="OG Title" value={seo.ogTitle} onChange={(v) => setSeo({ ...seo, ogTitle: v })} />
          <Field label="OG Description" value={seo.ogDescription} onChange={(v) => setSeo({ ...seo, ogDescription: v })} textarea />
          <Field label="OG Image URL" value={seo.ogImage} onChange={(v) => setSeo({ ...seo, ogImage: v })} />
          <Field label="Twitter Title" value={seo.twitterTitle} onChange={(v) => setSeo({ ...seo, twitterTitle: v })} />
          <Field label="Twitter Description" value={seo.twitterDescription} onChange={(v) => setSeo({ ...seo, twitterDescription: v })} textarea />
          <Field label="Twitter Image URL" value={seo.twitterImage} onChange={(v) => setSeo({ ...seo, twitterImage: v })} />
          <div className="md:col-span-2">
            <Field label="Schema (JSON)" value={seo.schema} onChange={(v) => setSeo({ ...seo, schema: v })} textarea />
          </div>
        </div>
        <div>
          <button
            className="px-4 py-2 rounded-xl border bg-gray-50 hover:bg-gray-100"
            onClick={saveSEO}
            disabled={isSaving}
          >
            {isSaving ? "Saving…" : "Save SEO in App (upsert to post_seo)"}
          </button>
        </div>
      </div>
    </div>
  );
}