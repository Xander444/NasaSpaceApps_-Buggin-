# Public simulator backend

The frontend is a static Vite application. Live simulations require the separate FastAPI/PyTorch service; the exact precomputed cabin is a static asset and remains available when that service is offline.

## Runtime contract

- Health check: `GET /api/health`
- Simulation: `POST /api/simulate`
- Container port: read from `PORT`, default `8000`
- Allowed browser origins: comma-separated `SIMULATOR_ALLOWED_ORIGINS`
- Concurrent simulation slots: `SIMULATOR_MAX_CONCURRENT`, default `2`
- Request range: 1,000–2,000,000 sampled locations

The container intentionally uses one worker. The in-process capacity guard therefore applies consistently and rejects excess work with HTTP 503 instead of allowing unbounded CPU and memory contention.

## Container deployment

Build from the repository root:

```bash
docker build -t flame-screening-api .
docker run --rm -p 8000:8000 \
  -e SIMULATOR_ALLOWED_ORIGINS=http://localhost:5173 \
  -e SIMULATOR_MAX_CONCURRENT=2 \
  flame-screening-api
```

The public container host must support a Python container with enough memory for PyTorch. Configure its health check to `/api/health` and preserve one application worker unless the concurrency design is changed and retested.

## Connect the public frontend

Set this variable before building the frontend:

```bash
VITE_SIMULATOR_API_URL=https://your-api-host.example.com
```

Set the backend origin allowlist to the exact deployed frontend origin:

```bash
SIMULATOR_ALLOWED_ORIGINS=https://your-frontend-host.example.com
```

Do not add `/api` to `VITE_SIMULATOR_API_URL`; the frontend appends `/api/simulate`.

## Failure behavior

- Validation failures return HTTP 422 with the specific confirmation or scenario error.
- Capacity failures return HTTP 503 and can be retried later.
- Network failures and timeouts produce a visible frontend message.
- “View precomputed result” fetches `/simulation/cabin-demo.json` from the static frontend host, not the API host. It remains usable during a backend outage.

## Tested release cases

| Case | Expected behavior | Automated coverage |
| --- | --- | --- |
| Successful live simulation | Returns a relative-screening result | Python API test |
| Unconfirmed or malformed input | HTTP 422 with a useful detail | Python API test |
| Backend unavailable or HTTP 5xx | Frontend reports outage without hiding the precomputed result; API capacity is released after an unexpected failure | JavaScript client and Python recovery tests |
| Two simultaneous requests | Both complete within the configured two-slot capacity | Python concurrency test |
| More work than capacity | HTTP 503 from the capacity guard; a later request succeeds after a slot is released | Python capacity test |

Before release, test the deployed URL from the deployed frontend origin as well. Local automated tests cannot verify a cloud provider’s routing, TLS, cold-start behavior, or environment configuration.

