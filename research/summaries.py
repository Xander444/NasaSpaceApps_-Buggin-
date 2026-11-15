"""Deterministic, offline research cards. No provider calls."""
import hashlib
import json
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
ARTIFACT = ROOT / 'public/search/research-summaries.json'
SCHEMA = 1

def digest(value):
    return hashlib.sha256(json.dumps(value, sort_keys=True, ensure_ascii=False).encode()).hexdigest()

def fingerprint(index):
    return digest({'index': index['index_version'], 'review': (ROOT/'data/source_review.json').read_text(),
                   'config': (ROOT/'data/search/config.json').read_text(), 'builder': Path(__file__).read_text()})

def build(index):
    cards = []
    for inv in index['investigations']:
        docs = [d for d in index['documents'] if d['accession'] == inv['id']]
        sections = {}
        for section, sid in inv['section_sources'].items():
            if section in ('objective', 'approach', 'hardware', 'hypothesis', 'research_impacts'):
                text = index['sources'][sid]['excerpt']
                sections[section] = {'excerpt': text[:1000], 'truncated': len(text)>1000, 'source_id': sid}
        coverage = {}
        for field in ('material', 'geometry', 'sensor', 'oxygen_initial_percent', 'pressure', 'airflow', 'gravity'):
            values = {}
            for doc in docs:
                f = doc.get('conditions', {}).get(field)
                if doc['kind'] == 'test' and f and f.get('value') is not None:
                    key = json.dumps([f['value'], f.get('unit')])
                    if key not in values:
                        values[key] = {'value': f['value'], 'unit': f.get('unit'), 'test_id': doc['id'], 'source_ids': f['source_ids']}
            coverage[field] = {'examples': list(values.values())[:3], 'distinct_values': len(values), 'scope': 'Separate tests; not joint conditions'}
        card = {'id': inv['id'], 'program': inv['program'], 'title': inv['title'], 'sections': sections,
                'reported_findings': 'No independently extracted publication findings; inspect cited rows for reported outcomes.',
                'coverage': coverage, 'test_count': sum(d['kind']=='test' for d in docs),
                'data_formats': sorted({Path(d['title']).suffix.lower() for d in docs if d['kind']=='file' and Path(d['title']).suffix})[:15],
                'limitations': inv['warnings'] + ['Inventory is metadata, not full text. Hypotheses and planned impacts are not findings. Missing values are unknown.'],
                'source_ids': inv['source_ids'], 'index_version': index['index_version'], 'schema_version': SCHEMA}
        card['content_hash'] = digest(card)
        cards.append(card)
    version = fingerprint(index)
    return {'schema_version': SCHEMA, 'index_version': index['index_version'], 'summary_version': version,
            'cards': cards, 'content_hash': digest(cards), 'counts': index['counts']}

def ensure():
    index = json.loads((ROOT/'public/search/index.json').read_text())
    if ARTIFACT.exists():
        old = json.loads(ARTIFACT.read_text())
        if old.get('summary_version') == fingerprint(index) and old.get('content_hash') == digest(old.get('cards')):
            return old
    artifact = build(index)
    ARTIFACT.write_text(json.dumps(artifact, indent=2, ensure_ascii=False)+'\n')
    return artifact

if __name__ == '__main__':
    a = ensure()
    print(f"Prepared {len(a['cards'])} extractive cards; summary version {a['summary_version'][:12]}")
