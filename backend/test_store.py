import json
import tempfile
import unittest
from pathlib import Path
from . import store

def event(minute, **extra):
    return {'timestamp': f'2026-10-26T10:{minute:02d}:00Z', 'source_ip': '192.0.2.1', 'event': 'login_failed', 'asset': 'auth-01', **extra}

class StoreTests(unittest.TestCase):
    def setUp(self):
        self.directory = tempfile.TemporaryDirectory()
        self.path = Path(self.directory.name) / 'test.sqlite3'

    def tearDown(self):
        self.directory.cleanup()

    def test_cross_import_correlation_and_deduplication(self):
        first = store.ingest(self.path, json.dumps([event(i) for i in (0, 1, 2)]), 'first.json')
        self.assertEqual(first['findings'], [])
        second = store.ingest(self.path, json.dumps([event(i) for i in (2, 3, 4)]), 'second.json')
        self.assertEqual(second['new_events'], 2)
        self.assertEqual(second['duplicates'], 1)
        self.assertEqual(len(second['findings']), 1)
        self.assertEqual(store.workspace(self.path)['total_events'], 5)

    def test_notes_and_status_survive_reimports(self):
        content = json.dumps([event(i) for i in range(5)])
        first = store.ingest(self.path, content, 'logs.json')
        incident_id = first['findings'][0]['id']
        store.update_incident(self.path, incident_id, 'Resolved', 'Approved test activity.')
        repeated = store.ingest(self.path, content, 'logs.json')
        self.assertEqual(repeated['new_events'], 0)
        self.assertEqual(repeated['findings'], [])
        saved = store.workspace(self.path)['incidents'][0]
        self.assertEqual(saved['status'], 'Resolved')
        self.assertEqual(saved['notes'][0]['text'], 'Approved test activity.')
        self.assertEqual(len(saved['history']), 3)

    def test_invalid_upload_is_atomic(self):
        with self.assertRaises(ValueError):
            store.ingest(self.path, json.dumps([event(0), {'invalid': True}]), 'bad.json')
        self.assertEqual(store.workspace(self.path)['total_events'], 0)
        self.assertEqual(store.workspace(self.path)['batches'], [])

    def test_redaction_before_persistence(self):
        store.ingest(self.path, json.dumps([event(0, password='hidden-password')]), 'logs.json')
        with store.connection(self.path) as db:
            content = db.execute('SELECT data FROM event_records').fetchone()[0]
        self.assertNotIn('hidden-password', content)
        self.assertIn('[REDACTED]', content)

    def test_missing_incident(self):
        with self.assertRaises(KeyError):
            store.update_incident(self.path, 'missing', 'Resolved')

    def test_late_evidence_preserves_investigation_identity(self):
        first = store.ingest(self.path, json.dumps([event(i) for i in range(1, 6)]), 'first.json')
        incident_id = first['findings'][0]['id']
        store.update_incident(self.path, incident_id, 'Investigating', 'Review in progress.')
        second = store.ingest(self.path, json.dumps([event(0)]), 'late.json')
        self.assertEqual(second['findings'], [])
        incidents = store.workspace(self.path)['incidents']
        self.assertEqual(len(incidents), 1)
        self.assertEqual(incidents[0]['id'], incident_id)
        self.assertEqual(incidents[0]['events'], 6)
        self.assertEqual(len(incidents[0]['notes']), 1)
