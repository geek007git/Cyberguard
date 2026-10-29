"""Validated ingestion, deterministic detection, and local reference retrieval."""
import csv
import io
import hashlib
import ipaddress
import json
import math
import re
import struct
from collections import defaultdict, deque
from datetime import datetime, timezone
from pathlib import Path

CATALOG = json.loads((Path(__file__).resolve().parent.parent / 'shared' / 'catalog.json').read_text(encoding='utf-8'))
KNOWLEDGE, RULES = CATALOG['knowledge'], CATALOG['rules']
MAX_EVENTS, MAX_RETAINED = 10_000, 20_000
SECRET_KEY = re.compile(r'^(password|passwd|pwd|secret|client_secret|token|access_token|refresh_token|api[_-]?key|authorization|cookie|set-cookie|private[_-]?key)$', re.I)

def canonical(value):
    if value is None:
        return 'n'
    if isinstance(value, bool):
        return 'b1' if value else 'b0'
    if isinstance(value, (int, float)):
        return 'd' + struct.pack('>d', 0 if value == 0 else value).hex()
    if isinstance(value, dict):
        return 'o{' + ','.join(canonical(k) + ':' + canonical(value[k]) for k in sorted(value, key=lambda s: s.encode('utf-16-be'))) + '}'
    if isinstance(value, list):
        return 'a[' + ','.join(canonical(v) for v in value) + ']'
    return 's' + json.dumps(value, ensure_ascii=False, separators=(',', ':'))

def fingerprint(value):
    return hashlib.sha256(canonical(value).encode('utf-8')).hexdigest()[:24].upper()

def redact(value, depth=0):
    if depth > 12:
        raise ValueError('Log objects may be nested at most 12 levels.')
    if isinstance(value, str) and re.search('[\ud800-\udfff]', value):
        raise ValueError('Log text must contain valid Unicode.')
    if isinstance(value, (int, float)) and not isinstance(value, bool) and (abs(value) > 9007199254740991 or not math.isfinite(value)):
        raise ValueError('Log numbers must be finite and within the safe integer range.')
    if isinstance(value, dict):
        if any(re.search('[\ud800-\udfff]', key) for key in value):
            raise ValueError('Log field names must contain valid Unicode.')
        return {k: '[REDACTED]' if SECRET_KEY.match(k) else redact(v, depth + 1) for k, v in value.items() if not k.startswith('_')}
    if isinstance(value, list):
        return [redact(v, depth + 1) for v in value]
    return value

def parse_logs(raw):
    if len(raw.encode()) > 2_000_000:
        raise ValueError('Log upload exceeds the 2 MB limit.')
    raw = raw.lstrip('\ufeff').strip()
    if not raw:
        raise ValueError('Provide at least one log event.')
    if raw[0] not in '[{' and ',' in raw.splitlines()[0]:
        try:
            rows = list(csv.reader(io.StringIO(raw), strict=True))
            headers = [h.strip() for h in rows[0]]
            if len(set(headers)) != len(headers) or not all(k in headers for k in ('timestamp', 'source_ip', 'event')):
                raise ValueError('CSV needs unique headers including timestamp, source_ip, and event.')
            data = []
            for index, row in enumerate(rows[1:], 2):
                if not any(c.strip() for c in row):
                    continue
                if len(row) != len(headers):
                    raise ValueError(f'CSV row {index} has {len(row)} fields; expected {len(headers)}.')
                item = dict(zip(headers, row))
                if item.get('bytes', '').strip():
                    try:
                        item['bytes'] = float(item['bytes'])
                    except ValueError as error:
                        raise ValueError(f'CSV row {index}: bytes must be numeric.') from error
                data.append(item)
        except csv.Error as error:
            raise ValueError('Malformed CSV quoting.') from error
    else:
        try:
            parsed = json.loads(raw)
            data = parsed if isinstance(parsed, list) else [parsed]
        except json.JSONDecodeError:
            data = []
            for index, line in enumerate(raw.splitlines(), 1):
                if not line.strip():
                    continue
                try:
                    data.append(json.loads(line))
                except json.JSONDecodeError as error:
                    raise ValueError(f'Invalid JSON on line {index}. Use JSON, JSON Lines, or CSV.') from error
    if not data or len(data) > MAX_EVENTS:
        raise ValueError('Provide between 1 and 10,000 events.')
    events = []
    for index, item in enumerate(data, 1):
        if not isinstance(item, dict):
            raise ValueError(f'Event {index}: expected an object.')
        if not all(isinstance(item.get(k), str) and item[k].strip() for k in ('timestamp', 'source_ip', 'event')):
            raise ValueError(f'Event {index}: timestamp, source_ip, and event strings are required.')
        event = redact(item)
        if event.get('asset') is not None and not isinstance(event['asset'], str):
            raise ValueError(f'Event {index}: asset must be a string.')
        event['source_ip'] = event['source_ip'].strip().lower()
        event['event'] = event['event'].strip().lower()
        event['asset'] = str(event.get('asset') or 'Unspecified asset').strip()
        if len(event['asset']) > 200 or len(event['event']) > 100 or (isinstance(event.get('username'), str) and len(event['username']) > 200):
            raise ValueError(f'Event {index}: asset and username may contain at most 200 characters; event at most 100.')
        try:
            parsed_ip = ipaddress.ip_address(event['source_ip'])
            if '%' in event['source_ip']:
                raise ValueError()
            event['source_ip'] = str(parsed_ip)
        except ValueError as error:
            raise ValueError(f'Event {index}: source_ip must be a valid IPv4 or IPv6 address.') from error
        try:
            if not re.fullmatch(r'\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{1,6})?(?:Z|[+-]\d{2}:\d{2})', event['timestamp']):
                raise ValueError()
            dt = datetime.fromisoformat(event['timestamp'].replace('Z', '+00:00'))
            if dt.year < 1970 or dt.tzinfo is None or dt.timestamp() < 0:
                raise ValueError()
            event['timestamp'] = dt.astimezone(timezone.utc).isoformat(timespec='milliseconds').replace('+00:00', 'Z')
        except ValueError as error:
            raise ValueError(f'Event {index}: timestamp must be a valid ISO 8601 date with timezone (minimum year 1970).') from error
        if 'bytes' in event:
            value = event['bytes']
            if isinstance(value, bool) or not isinstance(value, (float, int)) or value < 0 or value != int(value):
                raise ValueError(f'Event {index}: bytes must be a non-negative integer.')
            event['bytes'] = int(value)
        if event.get('username') is not None and not isinstance(event['username'], str):
            raise ValueError(f'Event {index}: username must be a string.')
        if event.get('username'):
            event['username'] = event['username'].strip()
        event['asset'] = event['asset'] or 'Unspecified asset'
        events.append(event)
    return sorted(events, key=lambda e: (e['timestamp'], fingerprint(e)))

def unique_events(events):
    return sorted({fingerprint(e): e for e in events}.values(), key=lambda e: (e['timestamp'], fingerprint(e)))

def seconds(event):
    return datetime.fromisoformat(event['timestamp'].replace('Z', '+00:00')).timestamp()

def detect(events):
    groups, findings = defaultdict(list), []
    rules = {r['id']: r for r in RULES}
    for event in unique_events(events):
        groups[(event['source_ip'], event['asset'])].append(event)
    def add(rule, evidence, explanation):
        first, last = evidence[0], evidence[-1]
        identity = [rule['id'], first['source_ip'], first['asset'], first['timestamp'], fingerprint(last) if rule['id'] == 'AUTH-003' else '']
        findings.append({'id': 'CG-' + fingerprint(identity), 'rule_id': rule['id'], 'title': rule['title'], 'severity': rule['severity'], 'risk_score': {'Critical': 95, 'High': 75, 'Medium': 45, 'Low': 20}[rule['severity']], 'source_ip': first['source_ip'], 'asset': first['asset'], 'timestamp': last['timestamp'], 'first_seen': first['timestamp'], 'events': len(evidence), 'status': 'Open', 'explanation': explanation, 'knowledge_id': rule['knowledge_id'], 'evidence': evidence, 'recommendations': rule['recommendations'], 'notes': [], 'history': []})
    for group in groups.values():
        for rule_id in ('AUTH-001', 'AUTH-002', 'ACCESS-001'):
            rule = rules[rule_id]
            matches = [e for e in group if e['event'] == rule['event'] and (rule_id != 'AUTH-002' or e.get('username'))]
            start, end = 0, 0
            names = defaultdict(int)
            times = [seconds(e) for e in matches]
            while start < len(matches):
                while end < len(matches) and times[end] - times[start] <= rule['window_seconds']:
                    names[matches[end].get('username')] += 1
                    end += 1
                count = len(names) if rule_id == 'AUTH-002' else end - start
                if count >= rule['threshold']:
                    window = matches[start:end]
                    description = f'{count} distinct usernames received failed logins from this source on this asset within ten minutes. This may indicate password spraying; validate expected automation.' if rule_id == 'AUTH-002' else f"{count} {'failed logins' if rule_id == 'AUTH-001' else 'access denials'} from this source on this asset within ten minutes. Validate whether the activity is malicious or a configuration issue."
                    add(rule, window, description)
                    start = end
                    names.clear()
                else:
                    name = matches[start].get('username')
                    names[name] -= 1
                    if names[name] == 0:
                        del names[name]
                    start += 1
        accounts = {}
        for event in group:
            if event.get('username') and event['event'] in ('login_failed', 'login_success'):
                failed = accounts.get(event['username'], deque())
                while failed and seconds(event) - seconds(failed[0]) > 600:
                    failed.popleft()
                if event['event'] == 'login_failed':
                    failed.append(event)
                    accounts[event['username']] = failed
                else:
                    if len(failed) >= 5:
                        add(rules['AUTH-003'], list(failed) + [event], f'A successful login followed {len(failed)} failures for the same account, source, and asset within ten minutes. Confirm the session with the account owner; legitimate password recovery can produce the same pattern.')
                    accounts.pop(event['username'], None)
            if event['event'] == 'privilege_escalation':
                add(rules['PRIV-001'], [event], 'A privilege escalation event was recorded. Confirm whether this elevation was approved before treating it as compromise.')
            if event['event'] == 'large_transfer' and event.get('bytes', 0) >= 100_000_000:
                add(rules['DATA-001'], [event], f"An outbound transfer of {math.floor(event['bytes'] / 1_000_000 + 0.5)} MB exceeded the 100 MB review threshold. Volume alone does not establish exfiltration.")
    return sorted(findings, key=lambda f: (-seconds(f), f['id']))

def retrieve(query, limit=2):
    stop = {'what', 'this', 'that', 'with', 'from', 'have', 'does', 'about', 'should', 'could', 'please', 'explain', 'would', 'into', 'your', 'they', 'them', 'then'}
    terms = {w for w in re.findall(r'[a-z0-9]+', query.lower()) if len(w) > 2 and w not in stop}
    ranked = []
    for doc in KNOWLEDGE:
        title, body = (doc['title'] + ' ' + ' '.join(doc['tags'])).lower(), doc['text'].lower()
        score = sum(3 if word in title else 1 if word in body else 0 for word in terms)
        if score:
            ranked.append({**doc, 'relevance': score})
    return sorted(ranked, key=lambda d: (-d['relevance'], d['id']))[:limit]
