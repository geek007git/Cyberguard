"""SQLite transactions shared by ingestion and incident investigation."""
from contextlib import contextmanager
from datetime import datetime, timezone
import json
import sqlite3
from .engine import MAX_RETAINED, detect, fingerprint, parse_logs

def utcnow():
    return datetime.now(timezone.utc).isoformat(timespec='milliseconds').replace('+00:00', 'Z')

@contextmanager
def connection(path):
    db = sqlite3.connect(path, timeout=15)
    db.execute('PRAGMA journal_mode=WAL')
    try:
        with db:
            db.execute('CREATE TABLE IF NOT EXISTS incidents (id TEXT PRIMARY KEY, data TEXT NOT NULL)')
            db.execute('CREATE TABLE IF NOT EXISTS event_records (id TEXT PRIMARY KEY, data TEXT NOT NULL)')
            db.execute('CREATE TABLE IF NOT EXISTS import_history (id TEXT PRIMARY KEY, data TEXT NOT NULL)')
            yield db
    finally:
        db.close()

def workspace(path, include_events=False):
    with connection(path) as db:
        db.execute('BEGIN')
        result = {'version': 2, 'incidents': [json.loads(r[0]) for r in db.execute('SELECT data FROM incidents ORDER BY rowid DESC')], 'total_events': db.execute('SELECT COUNT(*) FROM event_records').fetchone()[0], 'batches': [json.loads(r[0]) for r in db.execute('SELECT data FROM import_history ORDER BY rowid DESC')]}
        if include_events:
            result['events'] = [json.loads(r[0]) for r in db.execute('SELECT data FROM event_records')]
        return result

def ingest(path, content, filename):
    parsed = parse_logs(content)
    now = utcnow()
    with connection(path) as db:
        # Serialize the read/merge/write sequence so simultaneous imports cannot lose updates.
        db.execute('BEGIN IMMEDIATE')
        old = {r[0]: json.loads(r[1]) for r in db.execute('SELECT id, data FROM incidents')}
        before = db.execute('SELECT COUNT(*) FROM event_records').fetchone()[0]
        for event in parsed:
            db.execute('INSERT OR IGNORE INTO event_records VALUES (?, ?)', (fingerprint(event), json.dumps(event)))
        total = db.execute('SELECT COUNT(*) FROM event_records').fetchone()[0]
        if total > MAX_RETAINED:
            raise ValueError('This workspace retains up to 20,000 unique events. Export your workspace before starting another workspace.')
        all_events = [json.loads(r[0]) for r in db.execute('SELECT data FROM event_records')]
        findings = detect(all_events)
        created, matched = [], set()
        for finding in findings:
            previous = old.get(finding['id'])
            if not previous:
                evidence = {fingerprint(e) for e in finding['evidence']}
                previous = next((i for i in old.values() if i['id'] not in matched and i.get('rule_id') == finding['rule_id'] and i['source_ip'] == finding['source_ip'] and i['asset'] == finding['asset'] and any(fingerprint(e) in evidence for e in i['evidence'])), None)
            if previous:
                matched.add(previous['id'])
                history = list(previous.get('history', []))
                if previous['events'] != finding['events'] or previous.get('first_seen') != finding['first_seen']:
                    history.append({'at': now, 'type': 'evidence', 'text': f"Evidence refreshed: {finding['events']} correlated events"})
                finding.update(id=previous['id'], status=previous['status'], notes=previous.get('notes', []), history=history)
            else:
                finding['history'] = [{'at': now, 'type': 'created', 'text': 'Detected by ' + finding['rule_id']}]
                created.append(finding)
            db.execute('INSERT INTO incidents VALUES (?, ?) ON CONFLICT(id) DO UPDATE SET data=excluded.data', (finding['id'], json.dumps(finding)))
        batch = {'id': 'B-' + fingerprint([filename, now, db.execute('SELECT COUNT(*) FROM import_history').fetchone()[0]]), 'filename': filename, 'imported_at': now, 'submitted': len(parsed), 'added': total - before, 'duplicates': len(parsed) - (total - before), 'findings': len(created)}
        db.execute('INSERT INTO import_history VALUES (?, ?)', (batch['id'], json.dumps(batch)))
    return {'findings': created, 'events_analyzed': len(parsed), 'new_events': total - before, 'duplicates': batch['duplicates'], 'batch': batch}

def update_incident(path, incident_id, status=None, note=None):
    now = utcnow()
    with connection(path) as db:
        db.execute('BEGIN IMMEDIATE')
        row = db.execute('SELECT data FROM incidents WHERE id=?', (incident_id,)).fetchone()
        if not row:
            raise KeyError('Incident not found.')
        incident = json.loads(row[0])
        history = incident.setdefault('history', [])
        notes = incident.setdefault('notes', [])
        if status and status not in ('Open', 'Investigating', 'Resolved'):
            raise ValueError('Invalid incident status.')
        if status and status != incident['status']:
            history.append({'at': now, 'type': 'status', 'text': f"Status changed from {incident['status']} to {status}"})
            incident['status'] = status
        if note and note.strip():
            note = note.strip()
            if len(note) > 2000:
                raise ValueError('Notes can contain at most 2,000 characters.')
            notes.append({'id': fingerprint([incident_id, note, now, len(notes)]), 'at': now, 'text': note})
            history.append({'at': now, 'type': 'note', 'text': 'Analyst note added'})
        db.execute('UPDATE incidents SET data=? WHERE id=?', (json.dumps(incident), incident_id))
    return incident
