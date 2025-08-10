import { useState } from 'react';

function decodeEntities(str: string) {
  if (!str) return str as any;
  const txt = typeof window !== 'undefined' ? document.createElement('textarea') : null;
  if (!txt) return str as any;
  txt.innerHTML = str;
  return (txt as HTMLTextAreaElement).value;
}

function normalizeContentHTML(html: string, siteUrl: string) {
  if (!html) return html;
  // 1) Replace lazy-load data-src/srcset with real src/srcset
  html = html.replace(/\sdata-srcset=/gi, ' srcset=');
  html = html.replace(/\sdata-src=/gi, ' src=');
  // 2) Protocol-relative URLs //example.com -> https://example.com
  html = html.replace(/src=["']\/\//gi, 'src="https://');
  // 3) Force http -> https (if present)
  const siteHost = siteUrl.replace(/^https?:\/\//, '').replace(/\/$/, '');
  html = html.replace(new RegExp('src=["\']http://'+siteHost, 'gi'), 'src="https://'+siteHost);
  // 4) Ensure relative image paths become absolute to site
  html = html.replace(/src=["']\/(?!\/)/gi, 'src="'+siteUrl.replace(/\/$/,'')+'/');
  return html;
}

export default function Home() {
  const [siteUrl, setSiteUrl] = useState('https://divedeck.net');
  const [wpUser, setWpUser] = useState('');
  const [wpAppPass, setWpAppPass] = useState('');
  const [postId, setPostId] = useState('7914');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [data, setData] = useState<any>(null);

  async function fetchPost() {
    setError(null);
    setData(null);
    setLoading(true);
    try {
      const url = `${siteUrl.replace(/\/$/,'')}/wp-json/wp/v2/posts/${postId}?_embed=1`;
      const headers: Record<string,string> = {};
      if (wpUser && wpAppPass && typeof window !== 'undefined') {
        const token = btoa(`${wpUser}:${wpAppPass}`);
        headers['Authorization'] = `Basic ${token}`;
      }
      const res = await fetch(url, { headers });
      if (!res.ok) {
        throw new Error(`WP responded ${res.status}`);
      }
      const json = await res.json();
      const rawContent = json?.content?.rendered || '';
      const content = normalizeContentHTML(rawContent, siteUrl);
      const title = decodeEntities(json?.title?.rendered || '');
      const link = json?.link || '';

      // Featured image: try several locations
      let featuredUrl = '';
      let featuredAlt = '';
      const media = json?._embedded?.['wp:featuredmedia']?.[0];
      if (media) {
        featuredUrl = media?.source_url || media?.media_details?.sizes?.full?.source_url || '';
        featuredAlt = media?.alt_text || media?.title?.rendered || '';
        if (featuredUrl && featuredUrl.startsWith('//')) featuredUrl = 'https:' + featuredUrl;
        if (featuredUrl && featuredUrl.startsWith('/')) featuredUrl = siteUrl.replace(/\/$/,'') + featuredUrl;
        if (featuredUrl.startsWith('http://')) featuredUrl = featuredUrl.replace('http://','https://');
      }

      setData({ title, content, link, featuredUrl, featuredAlt, raw: json });
    } catch (e:any) {
      setError(e.message || 'Unknown error');
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="wrap">
      <h1>DDHQ Lite — WP Fetch Tester</h1>
      <div className="card">
        <label>Site URL</label>
        <input value={siteUrl} onChange={e=>setSiteUrl(e.target.value)} placeholder="https://example.com" />
        <label>WP Username (Application Password user)</label>
        <input value={wpUser} onChange={e=>setWpUser(e.target.value)} placeholder="admin" />
        <label>WP Application Password</label>
        <input value={wpAppPass} onChange={e=>setWpAppPass(e.target.value)} placeholder="abcd efgh ijkl ..." />
        <label>Post ID</label>
        <input value={postId} onChange={e=>setPostId(e.target.value)} />
        <button onClick={fetchPost} disabled={loading}>
          {loading ? 'Fetching…' : 'Fetch from WordPress'}
        </button>
      </div>

      {error && <div className="error">Error: {error}</div>}

      {data && (
        <div className="card">
          <h2>Preview</h2>
          <p><strong>Title:</strong> {data.title}</p>
          <p><strong>Permalink:</strong> <a href={data.link} target="_blank" rel="noreferrer">{data.link}</a></p>
          {data.featuredUrl && (
            <p><img src={data.featuredUrl} alt={data.featuredAlt || ''} style={{maxWidth:'100%'}}/></p>
          )}
          <div className="content" dangerouslySetInnerHTML={{__html: data.content}} />
          <details>
            <summary>Raw JSON</summary>
            <pre>{JSON.stringify(data.raw, null, 2)}</pre>
          </details>
        </div>
      )}

      <div className="help">
        <p>Notes:</p>
        <ul>
          <li>If images still don’t load, host may block hotlinking. We can add a small proxy in <code>/api/image</code> next.</li>
          <li>Protocol-relative and http URLs are normalized to https.</li>
          <li>Lazy-load attributes are converted to real <code>src/srcset</code>.</li>
        </ul>
      </div>
    </div>
  );
}