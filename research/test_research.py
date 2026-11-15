import asyncio
import json
import os
from pathlib import Path
import stat
import tempfile
import time
import unittest
from unittest.mock import patch
from fastapi import FastAPI, HTTPException
from fastapi.testclient import TestClient
from research import api
from research.middleware import ResearchLimits
from research.models import Analysis, Ranking
from research.summaries import build, digest, ROOT
from research.config import save_key, read_settings, load_settings

INTERPRETATION={'goal':'smoke particle measurements for detector design','environment':'spacecraft','desired_data':'smoke measurements','unknowns':['measured gravity']}
READY={'status':'ready','interpretation':INTERPRETATION,'proposed_conditions':[],'questions':[],'remaining_ambiguity':[]}

class ResearchTests(unittest.TestCase):
    @classmethod
    def setUpClass(cls): cls.index,cls.artifact=api.corpus()
    def setUp(self):
        api.cache.clear();api.sessions.clear();api.inflight.clear();api.ip_history.clear()
        app=FastAPI();app.include_router(api.router);app.add_middleware(ResearchLimits)
        self.client=TestClient(app)
        self.env=patch.dict(os.environ,{'GEMINI_API_KEY':'offline-test-value','GEMINI_ELIGIBILITY_CONFIRMED':'true'})
        self.env.start()
        self.sdk=patch("research.api.importlib.util.find_spec",return_value=True);self.sdk.start()
        self.client.get('/api/research/status')
        self.body={'prompt':'Design a smoke detector using smoke particle measurements','index_version':self.index['index_version'],'summary_version':self.artifact['summary_version']}
    def tearDown(self): self.env.stop();self.sdk.stop();self.client.close()
    def post(self,path,**values): return self.client.post('/api/research/'+path,json={**self.body,**values})
    def rank_mock(self,task,data,schema):
        if schema is Analysis: return READY.copy(),{'calls':1}
        card=next(c for c in data['cards'] if c['id']=='PSI-101')
        source=card['sections']['objective']
        return {'ranked':[{'id':card['id'],'source_id':source['source_id'],'excerpt':source['excerpt'][:160]}]},{'calls':1}
    def test_summaries_cover_all_objectives_and_are_repeatable(self):
        built=build(self.index)
        self.assertEqual(built,self.artifact)
        for card in built['cards']:
            objective=card['sections'].get('objective')
            self.assertTrue(objective)
            self.assertTrue(self.index['sources'][objective['source_id']]['excerpt'].startswith(objective['excerpt']))
            self.assertIn('not findings',card['limitations'][-1])
        self.assertLess(len(json.dumps(built['cards'])),180000)
    @patch('research.api.generate')
    def test_no_provider_on_status_and_unconfigured(self,generate):
        self.client.get('/api/research/status')
        with patch.dict(os.environ,{'GEMINI_API_KEY':''}):
            self.assertEqual(self.post('analyze').status_code,503)
        generate.assert_not_called()
    def test_analyze_cache_is_exact_and_session_scoped(self):
        with patch('research.api.generate',return_value=(READY,{'calls':1})) as generate:
            self.assertEqual(self.post('analyze').status_code,200)
            repeated=self.post('analyze').json();self.assertTrue(repeated['cache_hit']);self.assertEqual(repeated['request_usage']['calls'],0)
            self.post('analyze',prompt=self.body['prompt']+' NOT PMMA')
            self.client.cookies.clear();self.client.get('/api/research/status');self.post('analyze')
            self.assertEqual(generate.call_count,3)
    def test_clarification_and_skip_cap(self):
        ambiguous={**READY,'status':'needs_clarification','questions':[{'question':'Which aspect?','why':'Different experiments support different goals.','options':['prevention','detection','suppression']}]}
        with patch('research.api.generate',return_value=(ambiguous,{'calls':1})):
            self.assertEqual(self.post('analyze').json()['status'],'needs_clarification')
            for values in ({'search_now':True},{'rounds':2},{'answers':[{'question':'Which aspect?','answer':'Not sure'}]}):
                result=self.post('analyze',**values).json()
                self.assertEqual(result['status'],'ready');self.assertEqual(result['questions'],[])
    def test_real_engine_recommendation_citations_and_cache(self):
        with patch('research.api.generate',side_effect=self.rank_mock) as generate:
            result=self.post('recommend',intent=INTERPRETATION)
            self.assertEqual(result.status_code,200,result.text)
            self.assertEqual(result.json()['ranked'][0]['id'],'PSI-101')
            self.assertEqual(self.post('recommend',intent=INTERPRETATION).json()['cache_hit'],True)
            self.assertEqual(generate.call_count,1)
    def test_invalid_ids_and_unquoted_claims_fail_closed(self):
        for rank in ({'id':'invented','source_id':'fake','excerpt':'safe at any oxygen'}, {'id':'PSI-101','source_id':self.index['investigations'][0]['source_ids'][0],'excerpt':'invented'}):
            with patch('research.api.generate',return_value=({'ranked':[rank]},{'calls':1})):
                self.assertEqual(self.post('recommend',intent=INTERPRETATION).status_code,503)
                self.assertFalse(api.cache)
    def test_local_vite_proxy_origin_is_allowed_but_remote_origins_are_not(self):
        for origin in ('http://127.0.0.1:5173', 'http://localhost:5173'):
            response=self.client.get('/api/research/status',headers={'host':'127.0.0.1:8000','origin':origin})
            self.assertEqual(response.status_code,200)
        for origin in ('https://evil.example','http://127.0.0.1:9999','http://localhost.evil.example:5173'):
            response=self.client.get('/api/research/status',headers={'host':'127.0.0.1:8000','origin':origin})
            self.assertEqual(response.status_code,403)

    def test_body_limits_origin_versions_and_schema(self):
        self.assertEqual(self.client.post('/api/research/analyze',content='x'*33000).status_code,413)
        self.assertEqual(self.client.post('/api/research/analyze',headers={'origin':'https://evil.example'},json=self.body).status_code,403)
        self.assertEqual(self.post('analyze',index_version='stale').status_code,409)
        self.assertEqual(self.post('analyze',prompt='x'*801).status_code,422)
        self.assertEqual(self.post('analyze',external_url='https://example.com').status_code,422)
    def test_service_error_is_not_no_data_and_is_not_cached(self):
        with patch('research.api.generate',side_effect=HTTPException(429,'quota')) as generate:
            for _ in range(2): self.assertEqual(self.post('analyze').status_code,429)
            self.assertEqual(generate.call_count,2);self.assertFalse(api.cache)
    def test_no_indexed_match_skips_ranking(self):
        with patch('research.api.generate') as generate:
            result=self.post('recommend',prompt='quantum banana investment',intent={'goal':'quantum banana investment'})
            self.assertEqual(result.json()['gap'],'no_indexed_match');generate.assert_not_called()
    def test_joint_conditions_are_still_engine_owned(self):
        options={'q':'PMMA','conditions':[{'field':'oxygen_initial_percent','value':22.2,'mode':'required','operator':'eq','unit':'% vol','tolerance':0},{'field':'material','value':'PMMA','mode':'required','operator':'contains'}]}
        result=asyncio.run(api.retrieve(options))
        bass=next(g for g in result['verified'] if g['id']=='PSI-25')
        self.assertGreater(bass['matchingTestCount'],0)
        options['conditions'].append({'field':'gravity','value':'lunar','mode':'required','operator':'contains'})
        self.assertEqual(asyncio.run(api.retrieve(options))['verified'],[])
    def test_secret_storage_permissions_replacement_and_loading(self):
        with tempfile.TemporaryDirectory() as tmp:
            path=Path(tmp)/'.env.server.local';path.write_text('OTHER="preserved"\n')
            save_key('test-private-value',path=path)
            self.assertEqual(stat.S_IMODE(path.stat().st_mode),0o600)
            self.assertEqual(read_settings(path)['OTHER'],'preserved')
            with self.assertRaises(ValueError): save_key('replacement',path=path)
            save_key('replacement',replace=True,path=path)
            with patch('research.config.read_settings',return_value={'GEMINI_MODEL':'test-model','OTHER':'not-loaded'}),patch.dict(os.environ,{},clear=True):
                load_settings();self.assertEqual(os.environ['GEMINI_MODEL'],'test-model');self.assertNotIn('OTHER',os.environ)
    def test_reset_clears_session_cache(self):
        with patch('research.api.generate',return_value=(READY,{'calls':1})):
            self.post('analyze');self.assertTrue(api.cache)
            self.client.delete('/api/research/session');self.assertFalse(api.cache)
            self.assertEqual(self.post('analyze').status_code,409)
    def test_concurrent_identical_calls_coalesce(self):
        from types import SimpleNamespace
        from fastapi import Response
        from research.models import Request
        async def run():
            calls=[];api.sessions['test']=__import__('collections').deque()
            async def work():
                calls.append(1);await asyncio.sleep(.03);return {'request_usage':{'calls':1}}
            req=SimpleNamespace(cookies={'research_session':'test'})
            await asyncio.gather(*(api.cached('same',Request(**self.body),req,Response(),work) for _ in range(2)))
            self.assertEqual(len(calls),1)
        asyncio.run(run())


try:
    import importlib.util
    HAS_SDK = importlib.util.find_spec('google.genai') is not None
except ModuleNotFoundError:
    HAS_SDK = False

@unittest.skipUnless(HAS_SDK, 'Optional SDK not installed; provider-boundary tests only')
class ProviderBoundaryTests(unittest.TestCase):
    def test_sdk_sends_json_schema_without_legacy_schema_conversion(self):
        from google import genai
        from google.genai import types
        from unittest.mock import patch
        captured = {}
        def intercept(*args, **kwargs):
            captured.update(kwargs.get('request_dict') or args[2])
            raise RuntimeError('offline interception')
        with genai.Client(api_key='offline-placeholder') as client:
            with patch.object(client._api_client, 'request', side_effect=intercept):
                with self.assertRaises(RuntimeError):
                    client.models.generate_content(model='gemini-2.5-flash-lite', contents='offline schema test',
                        config=types.GenerateContentConfig(response_mime_type='application/json', response_json_schema=Analysis.model_json_schema()))
        config = captured['generationConfig']
        self.assertNotIn('responseSchema', config)
        self.assertEqual(config['responseJsonSchema'], Analysis.model_json_schema())

    def test_overlong_quote_is_bounded_without_rewriting(self):
        from research.provider import generate
        from unittest.mock import MagicMock
        quote='Exact source text. ' * 30
        client=MagicMock();client.__enter__.return_value=client
        client.models.generate_content.return_value.text=json.dumps({'ranked':[{'id':'PSI-101','source_id':'source','excerpt':quote}]})
        client.models.generate_content.return_value.usage_metadata=None
        with patch.dict(os.environ,{'GEMINI_API_KEY':'offline-value'}),patch('google.genai.Client',return_value=client):
            result,_=generate('test',{},Ranking)
        self.assertEqual(result['ranked'][0]['excerpt'],quote[:400])
        self.assertTrue(result['ranked'][0]['excerpt_truncated'])

    def test_provider_errors_are_sanitized(self):
        from research.provider import generate
        for code,expected in ((401,'credentials'),(403,'credentials_or_eligibility'),(404,'model_unavailable'),(429,'quota'),(500,'network_or_provider')):
            error=RuntimeError('secret-value and raw prompt must not escape');error.code=code
            with patch.dict(os.environ,{'GEMINI_API_KEY':'offline-value'}),patch('google.genai.Client',side_effect=error):
                with self.assertRaises(HTTPException) as caught: generate('test',{},Analysis)
                self.assertIn(expected,caught.exception.detail)
                self.assertNotIn('secret-value',caught.exception.detail)
    def test_invalid_structured_output_is_not_returned(self):
        from research.provider import generate
        from unittest.mock import MagicMock
        client=MagicMock();client.__enter__.return_value=client
        client.models.generate_content.return_value.text='{"status":"ready","invented":"field"}'
        with patch.dict(os.environ,{'GEMINI_API_KEY':'offline-value'}),patch('google.genai.Client',return_value=client):
            with self.assertRaises(HTTPException) as caught: generate('test',{},Analysis)
            self.assertIn('invalid_output',caught.exception.detail)

if __name__=='__main__': unittest.main()
