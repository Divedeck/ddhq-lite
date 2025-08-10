import { useState } from 'react';

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
        // Normalize to absolute URL on divedeck.net
        let path = url;
        const abs = url.match(/^https?:\/\/[^\/]+(\/.*)$/i);
        if (abs) path = abs[1];
        const proto = url.match(/^\/\/(.*)$/);
        if (proto) path = '/' + proto[1].replace(/^[^\/]+/, '');
        if (!path.startsWith('/')) path = '/' + path;
        const absUrl = `https://divedeck.net${path}`;
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

    let path = url;
    const abs = url.match(/^https?:\/\/[^\/]+(\/.*)$/i);
    if (abs) path = abs[1];
    const proto = url.match(/^\/\/(.*)$/);
    if (proto) path = '/' + proto[1].replace(/^[^\/]+/, '');
    if (!path.startsWith('/')) path = '/' + path;
    const absUrl = `https://divedeck.net${path}`;

    return `src="/api/image?u=${encodeURIComponent(absUrl)}"`;
  });

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
      const content = normalizeContentHTML(rawContent);
      const title = decodeEntities(json?.title?.rendered || '');
      const link = json?.link || '';

      // Featured image through proxy as well
      let featuredUrl = '';
      let featuredAlt = '';
      const media = json?._embedded?.['wp:featuredmedia']?.[0];
      if (media) {
        let url0 = media?.source_url || media?.media_details?.sizes?.full?.source_url || '';
        featuredAlt = media?.alt_text || media?.title?.rendered || '';
        if (url0) {
          let path = url0;
          const abs = url0.match(/^https?:\/\/[^\/]+(\/.*)$/i);
          if (abs) path = abs[1];
          const proto = url0.match(/^\/\/(.*)$/);
          if (proto) path = '/' + proto[1].replace(/^[^\/]+/, '');
          if (!path.startsWith('/')) path = '/' + path;
          const absUrl = `https://divedeck.net${path}`;
          featuredUrl = `/api/image?u=${encodeURIComponent(absUrl)}`;
        }
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
          <li>Images are proxied via <code>/api/image</code> to bypass hotlink/CDN blocks.</li>
          <li>Only <code>divedeck.net</code> is allowed by the proxy for safety.</li>
        </ul>
      </div>
    </div>
  );
}