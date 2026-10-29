import os
import tempfile
import unittest
from pathlib import Path
from unittest.mock import patch
from fastapi.testclient import TestClient
from . import main

class ApiTests(unittest.TestCase):
    def setUp(self):
        self.directory = tempfile.TemporaryDirectory()
        self.db_patch = patch.object(main, 'DB', Path(self.directory.name) / 'api.sqlite3')
        self.env_patch = patch.dict(os.environ, {'CYBERGUARD_TOKEN': '', 'LLM_API_KEY': ''})
        self.db_patch.start()
        self.env_patch.start()
        self.client = TestClient(main.app)

    def tearDown(self):
        self.client.close()
        self.env_patch.stop()
        self.db_patch.stop()
        self.directory.cleanup()

    def test_complete_investigation_workflow(self):
        content = '{"timestamp":"2026-10-26T10:00:00Z","source_ip":"192.0.2.1","event":"privilege_escalation","asset":"prod-api"}'
        response = self.client.post('/api/analyze', json={'content': content, 'filename': 'logs.json'})
        self.assertEqual(response.status_code, 200)
        incident_id = response.json()['findings'][0]['id']
        updated = self.client.patch('/api/incidents/' + incident_id, json={'status': 'Investigating', 'note': 'Verifying the deployment record.'})
        self.assertEqual(updated.status_code, 200)
        self.assertEqual(len(updated.json()['notes']), 1)
        answer = self.client.post('/api/assistant', json={'question': 'Explain this incident.', 'incident_id': incident_id})
        self.assertEqual(answer.status_code, 200)
        self.assertIn('not AI-generated', answer.json()['mode'])
        exported = self.client.get('/api/workspace/export').json()
        self.assertEqual(len(exported['events']), 1)
        self.assertEqual(exported['incidents'][0]['status'], 'Investigating')

    def test_optional_access_token(self):
        with patch.dict(os.environ, {'CYBERGUARD_TOKEN': 'test-only-token'}):
            self.assertEqual(self.client.get('/api/health').status_code, 200)
            self.assertTrue(self.client.get('/api/health').json()['authentication_required'])
            self.assertEqual(self.client.get('/api/incidents').status_code, 401)
            self.assertEqual(self.client.get('/api/incidents', headers={'X-Workspace-Token': 'test-only-token'}).status_code, 200)

    def test_invalid_requests_and_origins(self):
        self.assertEqual(self.client.post('/api/analyze', json={'content': 'not json'}).status_code, 422)
        self.assertEqual(self.client.patch('/api/incidents/missing', json={'status': 'Resolved'}).status_code, 404)
        self.assertEqual(self.client.patch('/api/incidents/missing', json={}).status_code, 422)
        self.assertEqual(self.client.post('/api/analyze', json={'content': '[]'}, headers={'Origin': 'https://untrusted.example'}).status_code, 403)
        self.assertEqual(self.client.post('/api/analyze', content='{}', headers={'Content-Length': '4000001'}).status_code, 413)

    def test_unmatched_reference_abstention(self):
        response = self.client.post('/api/assistant', json={'question': 'How do I bake blueberry muffins?'})
        self.assertEqual(response.json()['sources'], [])
        self.assertEqual(response.json()['mode'], 'No matching reference')

    def test_provider_error_is_explicit(self):
        with patch.dict(os.environ, {'LLM_API_KEY': 'test-only-key'}), patch('httpx.AsyncClient.post', side_effect=main.httpx.ConnectError('unavailable')):
            response = self.client.post('/api/assistant', json={'question': 'Explain authentication hardening.'})
        self.assertEqual(response.status_code, 502)
        self.assertNotIn('test-only-key', response.text)
