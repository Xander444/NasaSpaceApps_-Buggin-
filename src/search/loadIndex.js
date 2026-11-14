// Static hosts need no compression configuration. Fall back for older browsers
// or hosts that transparently decode the .gz asset themselves.
export async function loadIndex(base, signal) {
  if (typeof DecompressionStream !== 'undefined') {
    try {
      const response = await fetch(base + 'search/index.json.gz', {signal});
      if (!response.ok || !response.body) throw new Error('Compressed index unavailable');
      const stream = response.headers.get('Content-Encoding') === 'gzip'
        ? response.body : response.body.pipeThrough(new DecompressionStream('gzip'));
      return await new Response(stream).json();
    } catch (error) {
      if (signal?.aborted) throw error;
    }
  }
  const response = await fetch(base + 'search/index.json', {signal});
  if (!response.ok) throw new Error('Search index unavailable. Run npm run search:index.');
  return response.json();
}
