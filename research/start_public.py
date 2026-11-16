"""Start the warm retrieval worker before exposing the public ASGI server."""
from __future__ import annotations

import json
import os
from pathlib import Path
import subprocess
import sys
import time
from urllib.error import URLError
from urllib.parse import urlparse
from urllib.request import urlopen

ROOT = Path(__file__).resolve().parents[1]
PORT = os.getenv("PORT", "8000")
RETRIEVAL_URL = os.getenv("RESEARCH_RETRIEVAL_URL", "http://127.0.0.1:8787").rstrip("/")


def wait_until_ready(process: subprocess.Popen[bytes], timeout_seconds: float = 60) -> None:
    deadline = time.monotonic() + timeout_seconds
    while time.monotonic() < deadline:
        returncode = process.poll()
        if returncode is not None:
            print(f"[public-start] retrieval_exit returncode={returncode}", flush=True)
            raise SystemExit(1)
        try:
            with urlopen(RETRIEVAL_URL + "/health", timeout=1) as response:
                body = response.read(4096)
            status = json.loads(body)
            if status.get("status") == "ready":
                print(
                    "[public-start] retrieval_ready "
                    f"index={status.get('index_version', 'unknown')} "
                    f"node={status.get('node_version', 'unknown')}",
                    flush=True,
                )
                return
        except (OSError, URLError, ValueError, json.JSONDecodeError):
            pass
        time.sleep(0.25)
    process.terminate()
    print("[public-start] retrieval_startup_timeout seconds=60", flush=True)
    raise SystemExit(1)


def main() -> None:
    parsed = urlparse(RETRIEVAL_URL)
    if parsed.scheme != "http" or parsed.hostname not in {"127.0.0.1", "localhost"}:
        print("[public-start] retrieval_configuration_rejected category=non_loopback_url", flush=True)
        raise SystemExit(1)
    process = subprocess.Popen(
        ["node", str(ROOT / "research/retrieve_service.mjs")],
        cwd=ROOT,
        stdin=subprocess.DEVNULL,
    )
    wait_until_ready(process)
    os.execvp(
        "uvicorn",
        [
            "uvicorn",
            "server_public:app",
            "--host",
            "0.0.0.0",
            "--port",
            PORT,
            "--workers",
            "1",
        ],
    )


if __name__ == "__main__":
    main()
