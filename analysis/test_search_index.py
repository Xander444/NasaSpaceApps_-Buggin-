import json
import unittest
from build_search_index import build,clean,ROOT
from semantic_service import validate,RequestError,make_handler
from http.server import ThreadingHTTPServer
from urllib.request import Request,urlopen
from urllib.error import HTTPError
import threading

class IndexTests(unittest.TestCase):
    @classmethod
    def setUpClass(cls):cls.index=build()
    def test_deterministic_build_and_committed_artifact(self):
        self.assertEqual(self.index,build())
        self.assertEqual(self.index,json.loads((ROOT/'public/search/index.json').read_text()))
    def test_unique_ids_and_provenance(self):
        docs=self.index['documents'];self.assertEqual(len(docs),len({d['id'] for d in docs}))
        for doc in docs:
            for sid in doc['source_ids']:
                self.assertIn(sid,self.index['sources']);self.assertTrue(self.index['sources'][sid]['sha256'])
    def test_b1_source_and_suspicious_values(self):
        b1=next(d for d in self.index['documents'] if d['id']=='PSI-25:B1')
        self.assertEqual(b1['conditions']['oxygen_initial_percent']['value'],22.2)
        self.assertEqual(b1['conditions']['co_initial_ppm']['value'],0)
        self.assertIn('below 21%',b1['warnings'][0])
        self.assertTrue(any('Suspicious' in w for d in self.index['documents'] for w in d['warnings']))
    def test_notes_are_not_test_rows_and_no_gravity_inheritance(self):
        tests=[d for d in self.index['documents'] if d['kind']=='test']
        self.assertEqual(len([d for d in tests if d['accession'] in {'PSI-25','PSI-26','PSI-69','PSI-98','PSI-99','PSI-100','PSI-101','PSI-102'}]),652)
        self.assertTrue(any(d['accession']=='PSI-159' for d in tests))
        self.assertTrue(all(d['conditions']['gravity']['value'] is None for d in tests))
        self.assertTrue(all(not d['content_indexed'] for d in self.index['documents'] if d['kind']=='file'))
    def test_html_is_plain_text(self):
        self.assertEqual(clean('<p>A &amp; B</p><script>bad()</script><p>C</p>'),'A & B C')

    def test_all_manifest_tables_are_indexed(self):
        manifest=json.loads((ROOT/'data/psi/manifest.json').read_text())
        paths={s['path'] for s in self.index['sources'].values()}
        for table in manifest['downloaded_tables']:self.assertIn(table['file'],paths)
        import gzip
        self.assertEqual(json.loads(gzip.decompress((ROOT/'public/search/index.json.gz').read_bytes())),self.index)

class SemanticTests(unittest.TestCase):
    def test_bounded_request_contract(self):
        self.assertEqual(validate({'query':' smoke ','index_version':'v'},'v'),'smoke')
        for body in [{}, {'query':'x','index_version':'v','path':'/etc/passwd'}, {'query':' '*2,'index_version':'v'}, {'query':'x'*751,'index_version':'v'}, {'query':[],'index_version':'v'}]:
            with self.assertRaises(RequestError):validate(body,'v')
        with self.assertRaises(RequestError) as cm:validate({'query':'smoke','index_version':'old'},'v')
        self.assertEqual(cm.exception.status,409)
    def test_http_failure_and_cors(self):
        try:server=ThreadingHTTPServer(('127.0.0.1',0),make_handler({'index_version':'v'},None,'model absent',{'http://localhost:5173'}))
        except PermissionError:self.skipTest('Local sockets blocked by sandbox')
        thread=threading.Thread(target=server.serve_forever,daemon=True);thread.start()
        try:
            url=f'http://127.0.0.1:{server.server_port}/search'
            for payload,origin,status in [({'query':'smoke','index_version':'v'},'http://localhost:5173',503),({'query':'smoke','index_version':'old'},'http://localhost:5173',409),({'query':'smoke','index_version':'v'},'https://evil.example',403)]:
                req=Request(url,json.dumps(payload).encode(),headers={'Content-Type':'application/json','Origin':origin})
                with self.assertRaises(HTTPError) as cm:urlopen(req)
                self.assertEqual(cm.exception.code,status)
                if status!=403:self.assertEqual(cm.exception.headers['Access-Control-Allow-Origin'],origin)
        finally:server.shutdown();server.server_close();thread.join()

if __name__=='__main__':unittest.main()
