"""Idempotent loopback launcher with readiness checks and child cleanup."""
import os
import signal
import subprocess
import sys
import time
import urllib.request
from pathlib import Path
sys.path.insert(0,str(Path(__file__).resolve().parents[1]))
from research.summaries import ROOT,ensure
from research.config import load_settings


def wait_ready(url,child,seconds=30):
    end=time.monotonic()+seconds
    while time.monotonic()<end:
        if child.poll() is not None: raise RuntimeError('A local service could not start; check for a port conflict.')
        try:
            with urllib.request.urlopen(url,timeout=1) as response:
                if response.status==200: return
        except OSError: time.sleep(.2)
    raise RuntimeError('Local service readiness timed out.')

def main():
    ensure();load_settings()
    children=[]
    def stop(*_): raise KeyboardInterrupt()
    signal.signal(signal.SIGTERM,stop)
    try:
        # Fail on occupied ports instead of accidentally using another app's API.
        import socket
        for port in (8000,5173):
            with socket.socket() as sock: sock.bind(('127.0.0.1',port))
        api=subprocess.Popen([sys.executable,'simulator/api.py'],cwd=ROOT,start_new_session=True)
        children.append(api);wait_ready('http://127.0.0.1:8000/api/health',api)
        frontend_env={k:v for k,v in os.environ.items() if not k.startswith('GEMINI_')}
        web=subprocess.Popen(['npm','run','dev','--','--host','127.0.0.1','--port','5173','--strictPort'],cwd=ROOT,env=frontend_env,start_new_session=True)
        children.append(web);wait_ready('http://127.0.0.1:5173/evidence',web)
        print('Ready: http://127.0.0.1:5173/evidence',flush=True)
        while all(child.poll() is None for child in children): time.sleep(.5)
    except KeyboardInterrupt: pass
    except (OSError,RuntimeError):
        print('Launcher unavailable: check ports 8000/5173 and local dependencies.',file=sys.stderr)
        return 1
    finally:
        for child in children:
            if child.poll() is None: os.killpg(child.pid,signal.SIGTERM)
        for child in children:
            try: child.wait(timeout=5)
            except subprocess.TimeoutExpired: os.killpg(child.pid,signal.SIGKILL);child.wait()
    return 0

if __name__=='__main__': sys.exit(main())
