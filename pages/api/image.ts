import type { NextApiRequest, NextApiResponse } from 'next';

// Simple image proxy to bypass hotlink/CDN restrictions.
// Only allows fetching from divedeck.net to keep it safe.
export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  try {
    const u = (req.query.u as string) || '';
    if (!u) {
      res.status(400).send('Missing u param');
      return;
    }
    // Decode and validate
    const url = decodeURIComponent(u);
    try {
      const target = new URL(url);
      if (target.hostname !== 'divedeck.net') {
        res.status(400).send('Blocked host');
        return;
      }
    } catch {
      res.status(400).send('Bad URL');
      return;
    }

    const upstream = await fetch(url, {
      headers: {
        // Pretend to be a normal browser; some CDNs check UA
        'User-Agent': 'Mozilla/5.0 DDHQ-Lite',
        'Accept': 'image/avif,image/webp,image/apng,image/*,*/*;q=0.8',
        'Referer': 'https://divedeck.net/',
      },
    });

    if (!upstream.ok) {
      res.status(upstream.status).send('Upstream error');
      return;
    }

    // Pass through headers that matter
    const type = upstream.headers.get('content-type') || 'image/jpeg';
    res.setHeader('Content-Type', type);
    // Basic caching
    res.setHeader('Cache-Control', 'public, max-age=3600');

    const arrayBuffer = await upstream.arrayBuffer();
    const buf = Buffer.from(arrayBuffer);
    res.status(200).send(buf);
  } catch (e:any) {
    res.status(500).send('Proxy error');
  }
}