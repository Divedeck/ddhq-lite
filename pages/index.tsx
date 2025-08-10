import { useState } from 'react';

function decodeEntities(str: string) {
  if (!str) return str;
  const txt = typeof window !== 'undefined' ? document.createElement('textarea') : null;
  if (!txt) return str;
  txt.innerHTML = str;
  return txt.value;
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
      const headers: any = {};
      if (wpUser && wpAppPass) {
        const token = Buffer.from(`${wpUser}:${wpAppPass}`).toString('base64');
        headers['Authorization'] = `Basic ${token}`;
      }
      const res = await fetch(url, { headers });
      if (!res.ok) {
        throw new Error(`WP responded ${res.status}`);
      }
      const json = await res.json();
      const content = json?.content?.rendered || '';
      const title = decodeEntities(json?.title?.rendered || '');
      const link = json?.link || '';
      const featured = json?._embedded?.['wp:featuredmedia']?.[0];
      const featuredUrl = featured?.source_url || '';
      const featuredAlt = featured?.alt_text || '';
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
          <li>Use a valid WP Application Password on a user with access to the post.</li>
          <li>This reads <code>/wp-json/wp/v2/posts/ID?_embed=1</code> and shows <code>content.rendered</code>.</li>
          <li>Once this works, we’ll add SEO meta pulls and Supabase storage in Step 3.</li>
        </ul>
      </div>
    </div>
  );
}