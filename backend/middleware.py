from starlette.responses import JSONResponse

class BodyLimitMiddleware:
    """Bound memory use even for uploads without a Content-Length header."""
    def __init__(self, app, limit=4_000_000):
        self.app, self.limit = app, limit

    async def __call__(self, scope, receive, send):
        if scope['type'] != 'http':
            await self.app(scope, receive, send)
            return
        chunks, size = [], 0
        while True:
            message = await receive()
            if message['type'] == 'http.disconnect':
                return
            chunk = message.get('body', b'')
            size += len(chunk)
            if size > self.limit:
                await JSONResponse({'detail': 'Request body exceeds the 4 MB transport limit.'}, status_code=413)(scope, receive, send)
                return
            chunks.append(chunk)
            if not message.get('more_body', False):
                break
        body, delivered = b''.join(chunks), False
        async def buffered_receive():
            nonlocal delivered
            if not delivered:
                delivered = True
                return {'type': 'http.request', 'body': body, 'more_body': False}
            return await receive()
        await self.app(scope, buffered_receive, send)
