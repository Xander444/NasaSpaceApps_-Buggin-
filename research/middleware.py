"""Bound request bodies before JSON parsing; prevent cross-origin paid requests."""
from urllib.parse import urlparse
from starlette.responses import JSONResponse

class ResearchLimits:
    def __init__(self,app): self.app=app
    async def __call__(self,scope,receive,send):
        if scope['type']!='http' or not scope['path'].startswith('/api/research'):
            return await self.app(scope,receive,send)
        headers=dict(scope['headers'])
        origin=headers.get(b'origin',b'').decode()
        host = headers.get(b'host', b'').decode()
        local_proxy = host in {'127.0.0.1:8000', 'localhost:8000'} and origin in {
            'http://127.0.0.1:5173', 'http://localhost:5173'}
        if origin and urlparse(origin).netloc != host and not local_proxy:
            return await JSONResponse({'detail':'Origin not allowed'},403)(scope,receive,send)
        body=b''
        while True:
            message=await receive()
            if message['type']=='http.disconnect': return
            body+=message.get('body',b'')
            if len(body)>32768:
                return await JSONResponse({'detail':'Request too large'},413)(scope,receive,send)
            if not message.get('more_body'): break
        async def replay(): return {'type':'http.request','body':body,'more_body':False}
        await self.app(scope,replay,send)
