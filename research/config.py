"""Backend-only environment loading and atomic private credential storage."""
import json
import os
import subprocess
import tempfile
from pathlib import Path
from research.summaries import ROOT
ENV_FILE = ROOT / '.env.server.local'
_loaded = {}

def read_settings(path=ENV_FILE):
    result = {}
    if path.exists():
        for line in path.read_text().splitlines():
            if '=' not in line or line.lstrip().startswith('#'):
                continue
            key, value = line.split('=', 1)
            try:
                value = json.loads(value)
            except ValueError:
                value = value.strip()
            result[key.strip()] = str(value)
    return result

def load_settings():
    for key, value in read_settings().items():
        if key in ('GEMINI_API_KEY', 'GEMINI_MODEL', 'GEMINI_ELIGIBILITY_CONFIRMED'):
            if key not in os.environ or os.environ[key] == _loaded.get(key):
                os.environ[key] = value
                _loaded[key] = value

def save_key(key, replace=False, path=ENV_FILE):
    if not key.strip() or '\n' in key or '\r' in key:
        raise ValueError('Enter a nonempty single-line key.')
    if path == ENV_FILE and subprocess.run(['git','check-ignore','--quiet',str(path)],cwd=ROOT).returncode:
        raise ValueError('Credential file must be ignored by git.')
    settings = read_settings(path)
    if settings.get('GEMINI_API_KEY') and not replace:
        raise ValueError('A key is already saved; use --replace to rotate it explicitly.')
    settings['GEMINI_API_KEY'] = key.strip()
    settings['GEMINI_ELIGIBILITY_CONFIRMED'] = 'true'
    fd, name = tempfile.mkstemp(dir=path.parent)
    try:
        os.fchmod(fd, 0o600)
        with os.fdopen(fd, 'w') as stream:
            stream.write(''.join(f'{k}={json.dumps(v)}\n' for k,v in settings.items()))
        os.replace(name, path)
    finally:
        if os.path.exists(name): os.unlink(name)
