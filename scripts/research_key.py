"""Run locally in a private terminal; never pass keys as command arguments."""
import argparse
import getpass
import sys
from pathlib import Path
sys.path.insert(0, str(Path(__file__).resolve().parents[1]))
from research.config import save_key, read_settings
parser = argparse.ArgumentParser()
parser.add_argument('--replace', action='store_true')
args = parser.parse_args()
if not sys.stdin.isatty():
    sys.exit('Private terminal required. Run: .venv/bin/python scripts/research_key.py')
if read_settings().get('GEMINI_API_KEY') and not args.replace:
    sys.exit('Key already saved. Use --replace for explicit rotation.')
print('Review https://ai.google.dev/gemini-api/terms and /docs/available-regions.\nRequires an eligible 18+ developer account and permitted audience/region. No billing will be enabled.')
if input('Do you confirm this use is eligible under the current terms? [yes/no] ').strip().lower() != 'yes':
    sys.exit('Live Gemini remains disabled.')
try:
    save_key(getpass.getpass('Paste a newly rotated Gemini key (hidden): '), replace=args.replace)
except ValueError as exc:
    sys.exit(str(exc))
print('Key saved privately. The running backend loads it on the next AI request.')
