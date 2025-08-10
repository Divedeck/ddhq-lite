import { useState } from 'react';
import { getSupabase } from '../lib/supabase';

function decodeEntities(str: string) {
  if (!str) return str as any;
  const txt = typeof window !== 'undefined' ? document.createElement('textarea') : null;
  if (!txt) return str as any;
  txt.innerHTML = str;
  return (txt as HTMLTextAreaElement).value;
}

// Rewrites image sources to go through /api/image proxy and activates lazy-loaded attributes.
function normalizeContentHTML(html: string) {
  if (!html) return html;

  // Activate lazy attributes
  html = html.replace(/\sdata-srcset=/gi, ' srcset=');
  html = html.replace(/\sdata-src=/gi, ' src=');

  // Force srcset entries through proxy
  html = html.replace(/srcset=["']([^"']+)["']/gi, (_m, set) => {
    const rebuilt = set
      .split(',')
      .map((part: string) => {
        const p = part.trim();
        if (!p) return p;
        const pieces = p.split(/\s+/);
        const url = pieces[0];
        const size = pieces.slice(1).join(' ');
        let absUrl = url;
        if (url.startsWith('//')) absUrl = 'https:' + url;
        const proxied = `/api/image?u=${encodeURIComponent(absUrl)}`;
        return size ? `${proxied} ${size}` : proxied;
      })
      .join(', ');
    return `srcset="${rebuilt}"`;
  });

  // Force <img src="..."> through proxy (only obvious images)
  html = html.replace(/src=["']([^"']+)["']/gi, (_m, url) => {
    const lower = url.toLowerCase();
    const isImg = /(\.jpg|\.jpeg|\.png|\.gif|\.webp|\.avif)(\?|#|$)/.test(lower) || /\/wp-content\//i.test(lower);
    if (!isImg) return _m;
    let absUrl = url;
    if (url.startsWith('//')) absUrl = 'https:' + url;
    return `src="/api/image?u=${encodeURIComponent(absUrl)}"`;
  });

  return html;
}

type WPJson = any;

export default function Home() {
  const [siteName, setSiteName] = useState('DiveDeck');
  const [siteUrl, setSiteUrl] = useState('https://divedeck.net');
  const [wpUser, setWpUser] = useState('');
  const [wpAppPass, setWpAppPass] = useState('');
  const [postId, setPostId] = useState('7914');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [data, setData] = useState<any>(null);
  const [siteRow, setSiteRow] = useState<any>(null);
  const [saving, setSaving] = useState(false);
  const [saveMsg, setSaveMsg] = useState<string | null>(null);

  async function ensureSite() {
    const supabase = getSupabase();
    const { data, error } = await supabase
      .from('sites')
      .upsert({
        name: siteName,
        base_url: siteUrl.replace(/\/$/, ''),
        wp_user: wpUser,
        wp_app_password: wpAppPass
      }, { onConflict: 'base_url' })
      .select()
      .single();
    if (error) throw error;
    setSiteRow(data);
    return data;
  }

  async function fetchPost() {
    setError(null);
    setData(null);
    setSaveMsg(null);
    setLoading(true);
    try {
      const site = await ensureSite();

      const url = `${siteUrl.replace(/\/$/,'')}/wp-json/wp/v2/posts/${postId}?_embed=1`;
      const headers: Record<string,string> = {};
      if (wpUser && wpAppPass && typeof window !== 'undefined') {
        const token = btoa(`${wpUser}:${wpAppPass}`);
        headers['Authorization'] = `Basic ${token}`;
      }
      const res = await fetch(url, { headers });
      if (!res.ok) throw new Error(\`WP responded \${res.status}\`);
      const json: WPJson = await res.json();

      const rawContent = json?.content?.rendered || '';
      const content = normalizeContentHTML(rawContent);
      const title = decodeEntities(json?.title?.rendered || '');
      const link = json?.link || '';
      const slug = json?.slug || '';
      const status = json?.status || '';
      const modified = json?.modified ? new Date(json.modified).toISOString() : null;
      const excerpt = decodeEntities(json?.excerpt?.rendered || '').replace(/<[^>]*>/g, '');

      // Featured image
      let featuredUrl = '';
      let featuredAlt = '';
      const media = json?._embedded?.['wp:featuredmedia']?.[0];
      if (media) {
        let url0 = media?.source_url || media?.media_details?.sizes?.full?.source_url || '';
        featuredAlt = media?.alt_text || media?.title?.rendered || '';
        if (url0) {
          if (url0.startsWith('//')) url0 = 'https:' + url0;
          if (url0.startsWith('/')) url0 = `${siteUrl.replace(/\/$/,'')}${url0}`;
          if (url0.startsWith('http://')) url0 = url0.replace('http://','https://');
          featuredUrl = `/api/image?u=${encodeURIComponent(url0)}`;
        }
      }

      setData({ title, content, link, slug, status, modified, excerpt, featuredUrl, featuredAlt, raw: json, site });
    } catch (e:any) {
      setError(e.message || 'Unknown error');
    } finally {
      setLoading(false);
    }
  }

  async function saveInApp() {
    if (!data?.raw || !siteRow?.id) return;
    setSaving(true); setSaveMsg(null); setError(null);
    try {
      const supabase = getSupabase();
      const site_id = siteRow.id;
      const wp_post_id = data.raw.id;
      const { error: pErr } = await supabase
        .from('posts')
        .upsert({
          site_id,
          wp_post_id,
          slug: data.slug,
          permalink: data.link,
          status: data.status === 'publish' ? 'published' : data.status,
          title: data.title,
          content_html: data.content,
          excerpt: data.excerpt,
          featured_image_url: data.featuredUrl || null,
          featured_image_alt: data.featuredAlt || null,
          author: data.raw?._embedded?.author?.[0]?.name || null,
          categories: data.raw?._embedded?.terms?.[0] || null,
          tags: data.raw?._embedded?.terms?.[1] || null,
          last_wp_modified: data.modified,
          last_synced_at: new Date().toISOString()
        }, { onConflict: 'site_id,wp_post_id' });
      if (pErr) throw pErr;
      setSaveMsg('Saved in DDHQ Lite 👍');
    } catch (e:any) {
      setError(e.message || 'Save failed');
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="wrap">
      <h1>DDHQ Lite — WP Fetch + Save</h1>

      <div className="card">
        <h3>Connect Site</h3>
        <label>Site Name</label>
        <input value={siteName} onChange={e=>setSiteName(e.target.value)} placeholder="DiveDeck" />
        <label>Site URL</label>
        <input value={siteUrl} onChange={e=>setSiteUrl(e.target.value)} placeholder="https://example.com" />
        <label>WP Username (Application Password user)</label>
        <input value={wpUser} onChange={e=>setWpUser(e.target.value)} placeholder="admin" />
        <label>WP Application Password</label>
        <input value={wpAppPass} onChange={e=>setWpAppPass(e.target.value)} placeholder="abcd efgh ijkl ..." />
      </div>

      <div className="card">
        <h3>Fetch Post</h3>
        <label>Post ID</label>
        <input value={postId} onChange={e=>setPostId(e.target.value)} />
        <button onClick={fetchPost} disabled={loading}>
          {loading ? 'Fetching…' : 'Fetch from WordPress'}
        </button>
      </div>

      {error && <div className="error">Error: {error}</div>}
      {saveMsg && <div className="card" style={{borderColor:'#14532d'}}>✅ {saveMsg}</div>}

      {data && (
        <div className="card">
          <h2>Preview</h2>
          <p><strong>Title:</strong> {data.title}</p>
          <p><strong>Permalink:</strong> <a href={data.link} target="_blank" rel="noreferrer">{data.link}</a></p>
          {data.featuredUrl && (
            <p><img src={data.featuredUrl} alt={data.featuredAlt || ''} style={{maxWidth:'100%'}}/></p>
          )}
          <div className="content" dangerouslySetInnerHTML={{__html: data.content}} />
          <div style={{marginTop:'1rem'}}>
            <button onClick={saveInApp} disabled={saving}>{saving ? 'Saving…' : 'Save in App'}</button>
          </div>
          <details>
            <summary>Raw JSON</summary>
            <pre>{JSON.stringify(data.raw, null, 2)}</pre>
          </details>
        </div>
      )}

      <div className="help">
        <p>Set env vars in Vercel → Project → Settings → Environment Variables:</p>
        <ul>
          <li><code>NEXT_PUBLIC_SUPABASE_URL</code></li>
          <li><code>NEXT_PUBLIC_SUPABASE_ANON_KEY</code></li>
        </ul>
      </div>
    </div>
  );
}