"""Explicit live smoke test: sends a public example query and NASA summaries to Gemini."""
import http.cookiejar
import json
import urllib.error
import urllib.request

BASE = 'http://127.0.0.1:5173/api/research/'
opener = urllib.request.build_opener(urllib.request.HTTPCookieProcessor(http.cookiejar.CookieJar()))

def call(path, body=None):
    request = urllib.request.Request(BASE + path, data=json.dumps(body).encode() if body is not None else None,
        headers={'Content-Type': 'application/json'} if body is not None else {})
    try:
        with opener.open(request, timeout=70) as response:
            return json.load(response)
    except urllib.error.HTTPError as error:
        try:
            detail = json.load(error).get('detail', 'request_failed')
        except Exception:
            detail = 'request_failed'
        print(json.dumps({'stage': path, 'http_status': error.code,
            'error': detail if isinstance(detail, str) else 'validation_error'}))
        raise SystemExit(1) from None

def main():
    from pathlib import Path
    status = call('status')
    print(json.dumps({'stage': 'status', 'status': status.get('status'), 'model': status.get('model')}), flush=True)
    body = {'prompt': 'I need smoke particle size measurements for designing a spacecraft smoke detector. Find relevant SAME and SAME-R investigations.',
        'index_version': status['index_version'], 'summary_version': status['summary_version'], 'search_now': True}
    analysis = call('analyze', body)
    print(json.dumps({'stage': 'analyze', 'status': analysis['status'], 'usage': analysis.get('request_usage')}), flush=True)
    recommend_body = {**body, 'intent': analysis['interpretation']}
    result = call('recommend', recommend_body)
    print(json.dumps({'stage': 'recommend', 'ids': [r['id'] for r in result['ranked']], 'gap': result['gap'],
        'usage': result.get('request_usage'), 'cache_hit': result.get('cache_hit')}), flush=True)
    index = json.loads((Path(__file__).resolve().parents[1] / 'public/search/index.json').read_text())
    for rank in result['ranked']:
        source = index['sources'].get(rank['source_id'])
        assert source and source['accession'] == rank['id'] and rank['excerpt'] in source['excerpt']
    assert {'PSI-101', 'PSI-102'}.issubset({r['id'] for r in result['ranked']}), 'Expected SAME and SAME-R evidence absent'
    print('All returned citations resolve to exact local source excerpts.', flush=True)
    repeated = call('recommend', recommend_body)
    assert repeated['cache_hit'] and repeated['request_usage']['calls'] == 0
    print(json.dumps({'stage': 'cache', 'cache_hit': True, 'new_provider_calls': 0}), flush=True)

if __name__ == '__main__':
    main()
