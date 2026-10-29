import json
import unittest
from .engine import parse_logs, detect

class DetectionTests(unittest.TestCase):
    def events(self, minutes):
        return parse_logs(json.dumps([{"timestamp": f"2026-10-26T10:{m:02d}:00Z", "source_ip": "192.0.2.1", "event": "login_failed"} for m in minutes]))

    def test_threshold_and_window(self):
        self.assertEqual(len(detect(self.events([0, 1, 2, 3, 4]))), 1)
        self.assertEqual(detect(self.events([0, 1, 2, 3])), [])
        self.assertEqual(detect(self.events([0, 11, 22, 33, 44])), [])

    def test_unordered_input_and_stable_identity(self):
        a = detect(self.events([4, 0, 3, 1, 2]))
        self.assertEqual(a[0]["id"], detect(self.events([0, 1, 2, 3, 4]))[0]["id"])

    def test_invalid_input(self):
        for raw in ('bad', '[]', '[{}]', 'null'):
            with self.assertRaises(ValueError):
                parse_logs(raw)

    def test_source_isolation(self):
        events = self.events([0, 1, 2, 3, 4])
        events[-1]["source_ip"] = "192.0.2.2"
        self.assertEqual(detect(events), [])

if __name__ == "__main__":
    unittest.main()
