"""Build a deterministic, offline evidence index. No network or model dependency."""
from __future__ import annotations
import gzip
import hashlib
import json
import re
from collections import Counter
from html.parser import HTMLParser
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
SCHEMA = 1

class PlainText(HTMLParser):
    def __init__(self):
        super().__init__(); self.parts = []; self.hidden = 0
    def handle_starttag(self, tag, attrs):
        if tag in ('script', 'style'): self.hidden += 1
        elif tag in ('p', 'br', 'li', 'div'): self.parts.append(' ')
    def handle_endtag(self, tag):
        if tag in ('script', 'style'): self.hidden = max(0, self.hidden - 1)
        elif tag in ('p', 'li', 'div'): self.parts.append(' ')
    def handle_data(self, data):
        if not self.hidden: self.parts.append(data)

def clean(value):
    parser = PlainText(); parser.feed(value or '')
    return re.sub(r'\s+', ' ', ''.join(parser.parts)).strip()

def digest(value):
    return hashlib.sha256(value if isinstance(value, bytes) else value.encode()).hexdigest()

def tokens(text, config):
    text = text.lower()
    for alias, canonical in sorted(config['aliases'].items(), key=lambda x: -len(x[0])):
        text = re.sub(r'(?<!\w)' + re.escape(alias) + r'(?!\w)', canonical, text)
    return [x for x in re.findall(r'[a-z0-9]+(?:\.[0-9]+)?', text) if x not in config['stopwords']]

def number(raw, suffix=''):
    if raw is None: return None
    text = str(raw).strip()
    if suffix: text = re.sub(r'\s*' + re.escape(suffix) + r'$', '', text)
    return float(text) if re.fullmatch(r'[-+]?(?:\d+(?:\.\d*)?|\.\d+)', text) else None

def build(root=ROOT):
    base = root / 'data/psi'
    config = json.loads((root / 'data/search/config.json').read_text())
    inputs = [base/'catalog.json', base/'file_inventory.json', base/'manifest.json', root/'data/search/config.json', root/'data/source_review.json', Path(__file__)]
    inputs += sorted((base/'normalized').glob('*.json')) + sorted((base/'tables').glob('*.csv'))
    hashes = {str(p.relative_to(root)): digest(p.read_bytes()) for p in inputs}
    version = digest(json.dumps({'schema': SCHEMA, 'inputs': hashes}, sort_keys=True))[:20]
    catalog = json.loads((base/'catalog.json').read_text())
    parents = {r['accession']: r for r in catalog}
    manifest = json.loads((base/'manifest.json').read_text())
    table_meta = {r['source_file_name']: r for r in manifest['downloaded_tables']}
    for entry in manifest['downloaded_tables']:
        if hashes[entry['file']] != entry['sha256']:
            raise ValueError('Source table hash differs from import manifest: ' + entry['file'])
    documents, sources, investigations, diagnostics = [], {}, [], []
    row_counts = {"imported": 0, "empty_excluded": 0}

    def source(accession, locator, excerpt, path='data/psi/catalog.json', status='reported', **extra):
        parent = parents[accession]
        sid = accession + ':source:' + digest(path + '|' + locator + '|' + excerpt)[:16]
        sources[sid] = dict(id=sid, accession=accession, doi=parent.get('doi'), url=parent['source_url'],
            path=path, locator=locator, excerpt=excerpt, extraction_status=status,
            sha256=hashes.get(path), source_version=parent.get('version'), **extra)
        return sid

    def add(doc):
        doc.setdefault('conditions', {}); doc.setdefault('warnings', [])
        doc.setdefault('tags', []); doc.setdefault('tag_evidence', [])
        if doc['kind'] != 'file':
            for tag, pattern in config['tag_rules'].items():
                if re.search(pattern, doc['text'], re.I):
                    doc['tags'].append(tag)
                    doc['tag_evidence'].append({'tag': tag, 'method': 'regex-v1', 'source_ids': doc['source_ids']})
        doc['tokens'] = {field: dict(Counter(tokens(value, config))) for field, value in {
            'title': (re.sub(r'^PSI-\d+_', '', doc['title']) if doc['kind']=='file' else doc.get('conditions',{}).get('material',{}).get('value') or doc['title']), 'text': doc['text'], 'tags': ' '.join(doc['tags'])}.items()}
        documents.append(doc)

    for r in catalog:
        acc = r['accession']
        inv = {'id': acc, 'accession': acc, 'program': r['acronym'] or acc, 'title': clean(r['title']),
               'project_type': r['project_type'], 'project_start_date': r.get('start_date') or None,
               'publication_date': None, 'source_url': r['source_url'], 'doi': r.get('doi'),
               'warnings': config['warnings'].get(acc, []), 'source_ids': [], 'section_sources': {}}
        for field in ['title', 'project_type', 'hardware', 'objective', 'approach', 'hypothesis', 'research_impacts', 'abstract', 'findings']:
            text = clean(r.get(field))
            if not text: continue
            sid = source(acc, field, text)
            inv['section_sources'][field] = sid
            inv['source_ids'].append(sid)
            words = text.split()
            for offset in range(0, len(words), config['chunk_words']):
                passage = ' '.join(words[offset:offset+config['chunk_words']])
                psid = source(acc, f'{field}; words {offset+1}–{min(offset+config["chunk_words"], len(words))}', passage)
                add(dict(id=f'{acc}:{field}:{digest(passage)[:12]}', accession=acc, kind='passage',
                    evidence_level='catalog '+field, section=field, title=inv['program']+' '+inv['title'],
                    text=passage, source_ids=[psid], content_indexed=True))
        add(dict(id=acc, accession=acc, kind='investigation', evidence_level='catalog metadata',
            title=inv['program']+' '+inv['title'], text=inv['title'], source_ids=[inv['section_sources']['title']], content_indexed=True))
        investigations.append(inv)

    normalized = {r['source_row']: r for r in json.loads((base/'normalized/bass_ii_tests.json').read_text())}
    for path in sorted((base/'normalized').glob('*_raw.json')):
        for row in json.loads(path.read_text()):
            acc, raw, rownum = row['accession'], row['raw'], row['source_row']
            row_counts['imported'] += 1
            if not any(value is not None and str(value).strip() for value in raw.values()):
                row_counts['empty_excluded'] += 1
                continue
            material = next((raw.get(k) for k in ['Fuel Sample Material','Material','Sample Material','Sample Type','Fuel'] if raw.get(k)), None)
            raw_id = next((raw.get(k) for k in ['As Run Test #','Test #','FLEX Test #','SAME Test #','Sample Number','Sample #','Test','Flex Number','Session Name'] if raw.get(k)), None)
            if acc == 'PSI-107' and raw.get('GMT ignition'): raw_id = f'row{rownum}'
            is_test = bool((material or raw.get('Test')) and raw_id and not re.search(r'pre-test|note\s*\d', material or '', re.I))
            filename = row['source_file']; tablepath = 'data/psi/tables/'+filename
            excerpt = json.dumps(raw, ensure_ascii=False, sort_keys=True)
            sid = source(acc, f'CSV row {rownum}', excerpt, tablepath, 'parsed cells', table_version=table_meta[filename]['source_version'])
            fields = {}
            def field(name, value, unit=None, key=None, method='parsed', refs=None):
                fields[name] = dict(value=value, unit=unit, raw=raw.get(key) if key else value, method=method, source_ids=refs or [sid])
            field('material', material, key=next((k for k,v in raw.items() if v == material), None), method='reported')
            # Broad material classes are derived separately, never exact material equivalence.
            if material:
                if re.search(r'methanol|heptane|dibutyl|dodecane|C12H26', material, re.I): fuel_class='liquid'
                elif re.search(r'^(methane|ethylene|ethane|propane|propylene|hydrogen|CH4|C2H4|C2H6|H2)$', material, re.I): fuel_class='gas'
                elif re.search(r'pmma|sibal|wax|nomex|kapton|teflon|pyrell|silicone|cotton|fabric|film|rod|slab|ultem', material, re.I): fuel_class='solid'
                else: fuel_class=None
                field('fuel_class', fuel_class, method='rule: named material class')
            if acc == 'PSI-25':
                n = normalized[rownum]
                for name, unit, key in [('oxygen_initial_percent','% vol','Calibrated  initial O2 % by vol'),('oxygen_final_percent','% vol','Calibrated final O2 % by vol'),('co_initial_ppm','ppm','Initial CO (ppm)'),('co_final_ppm','ppm','Final CO (ppm)')]:
                    if number(raw.get(key)) != n[name]: raise ValueError(f'Normalized/source mismatch: {acc} row {rownum} {name}')
                    field(name, n[name], unit, key)
                field('fan_display', raw.get('Fan display'), 'uncalibrated display', 'Fan display', 'reported')
            flow_key = next((k for k in ['Air Flow (cm/s)','Air Flow','Inlet velocity (cm/s)'] if k in raw), None)
            if flow_key: field('airflow', number(raw.get(flow_key), 'cm/s'), 'cm/s', flow_key)
            direction_key = next((k for k in ['Direction','Flow Direction'] if k in raw), None)
            if direction_key: field('direction', (raw.get(direction_key) or '').lower() or None, key=direction_key)
            if acc == 'PSI-69':
                field('pressure', number(raw.get('Ambient pressure; mmHg')), 'mmHg', 'Ambient pressure; mmHg')
                field('oxygen_initial_mole_fraction', number(raw.get('O initial ambient composition; mole fraction')), 'mol/mol', 'O initial ambient composition; mole fraction')
                field('geometry', raw.get('Droplet initial diameter; mm'), 'mm diameter', 'Droplet initial diameter; mm', 'reported')
                field('outcome', raw.get('Test end'), key='Test end', method='reported')
            else:
                dimensions='; '.join(f'{k}: {v}' for k,v in raw.items() if v and re.search(r'(?:sample|samle) (?:thickness|length|width)', k, re.I))
                shape=material if material and re.search(r'film|sphere|slab|rod|fabric|cylinder|micron|\bmm\b|\bcm\b', material, re.I) else None
                field('geometry', dimensions or shape, method='reported geometry text; dimensions not reconciled')
            # Do not assign measured gravity from platform. Mixed flight/ground/model studies remain unknown.
            field('gravity', None, method='unresolved per-row scope')
            field('sensor', ', '.join(f'{k}: {v}' for k,v in raw.items() if k.startswith('Camera') and v and v != 'n/a') or None, method='reported camera identifiers')
            warnings = []
            if acc == 'PSI-25':
                warnings += config['warnings'][acc]
                for name in ['oxygen_initial_percent','oxygen_final_percent','co_initial_ppm','co_final_ppm']:
                    v=fields[name]['value']
                    if v is not None and (v < 0 or ('oxygen' in name and v > 30)):
                        warnings.append(f'Suspicious reported {name}: {v}; retained for review.')
            if acc == 'PSI-99': warnings.append('This row includes reduced-gravity and 1-g outcomes; no single measured gravity assigned. Approximate O2 is not initial O2.')
            if warnings: diagnostics.append({'accession':acc,'row':rownum,'warnings':warnings})
            table_key = digest(filename)[:10]
            doc_id = f'{acc}:{raw_id}' if is_test else f'{acc}:table-note:{rownum}'
            if acc in ('PSI-10','PSI-159'): doc_id = f'{acc}:table-{table_key}:'+ (str(raw_id) if is_test else f'row{rownum}')
            if any(d['id']==doc_id for d in documents): doc_id += f':row{rownum}'
            test_date = raw.get('Test Date') or raw.get('Date')
            add(dict(id=doc_id, accession=acc, kind='test' if is_test else 'passage', evidence_level='table row' if is_test else 'table summary / unresolved scope',
                title=(parents[acc]['acronym'] or acc)+' '+(str(raw_id) if is_test else f'table row {rownum}'),
                text='; '.join(f'{k}: {v}' for k,v in raw.items() if v is not None), source_ids=[sid],
                conditions=fields if is_test else {}, raw=raw, test_date_raw=test_date, content_indexed=True, warnings=warnings, evidence_scope='mixed reduced/normal gravity outcomes' if acc=='PSI-99' else 'per-test gravity unresolved',
                tags=['measurements'] if is_test and any(v['unit'] and v['value'] is not None for v in fields.values()) else []))

    excluded = 0
    for r in json.loads((base/'file_inventory.json').read_text()):
        if r.get('restricted'): excluded += 1; continue
        name = r['file_name'] or ''
        sid = source(r['accession'], name, name+'; '+r['category'], 'data/psi/file_inventory.json', 'file metadata only', file_version=r['version'])
        add(dict(id=r['accession']+':file:'+digest(name)[:16], accession=r['accession'], kind='file',
            evidence_level='file metadata only', title=name, text=r['category']+' '+(r.get('subcategory') or ''),
            source_ids=[sid], content_indexed=False))
    ids=[d['id'] for d in documents]
    if len(ids)!=len(set(ids)): raise ValueError('Duplicate document IDs')
    counts=dict(Counter(d['kind'] for d in documents))
    facets={key: sorted({str(f['value']) for d in documents for k,f in d['conditions'].items() if k==key and f['value'] is not None}) for key in ['material','fuel_class','gravity','direction']}
    return dict(schema_version=SCHEMA,index_version=version,config=config,input_hashes=hashes,
        investigations=investigations,documents=documents,sources=sources,facets=facets,
        counts=counts,row_counts=row_counts,diagnostics=diagnostics,restricted_files_excluded=excluded,
        coverage='Catalog sections and imported table cells are indexed; inventory files are metadata only. No publication full text. Per-test measured gravity remains unresolved; numeric normalization is deliberately limited.')

if __name__ == '__main__':
    result = build(); output = ROOT/'public/search/index.json'; output.parent.mkdir(parents=True, exist_ok=True)
    payload=(json.dumps(result, ensure_ascii=False, separators=(',',':'))+'\n').encode()
    output.write_bytes(payload)
    output.with_suffix('.json.gz').write_bytes(gzip.compress(payload,mtime=0))
    print(json.dumps({'index_version':result['index_version'],'counts':result['counts'],'bytes':output.stat().st_size}))
