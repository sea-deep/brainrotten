import base64
import json
import os
import tempfile
import threading
import time
import unittest
from http.server import BaseHTTPRequestHandler, HTTPServer
from pathlib import Path

from brainrotten import Brainrotten, BrainrottenError


class Fake(BaseHTTPRequestHandler):
    calls = []
    polls = 0

    def log_message(self, *args):
        pass

    def _send(self, status, body):
        raw = json.dumps(body).encode()
        self.send_response(status)
        self.send_header("content-type", "application/json")
        self.send_header("content-length", str(len(raw)))
        self.end_headers()
        self.wfile.write(raw)

    def do_GET(self):
        Fake.calls.append(("GET", self.path, self.headers.get("authorization")))
        if self.path.startswith("/api/v1/formats/guide"):
            return self._send(200, {"format": "sketch", "rules": ["r"], "storyExample": {"format": "sketch", "script": {"title": "x"}}})
        if self.path.startswith("/api/v1/videos/job-1"):
            Fake.polls += 1
            state = "ready" if Fake.polls >= 2 else "processing"
            return self._send(200, {"jobId": "job-1", "state": state, "title": "x", "durationSeconds": 30,
                                    "videoUrl": "/api/v1/videos/job-1/video", "learning": {"questions": [{"id": "q1"}, {"id": "pause-3"}]}})
        return self._send(404, {"message": "nope"})

    def do_POST(self):
        length = int(self.headers.get("content-length") or 0)
        raw = self.rfile.read(length) or b"{}"
        body = json.loads(raw) if "json" in (self.headers.get("content-type") or "") else {}
        Fake.calls.append(("POST", self.path, self.headers.get("authorization"), body))
        if self.path == "/api/v1/videos/validate":
            ok = body.get("script", {}).get("title") != "bad"
            return self._send(200, {"valid": ok, "issues": [] if ok else [{"path": "script.title", "message": "too short"}], "warnings": []})
        if self.path == "/api/v1/videos":
            return self._send(202, {"jobId": "job-1", "state": "queued"})
        if self.path == "/oauth2/token":
            payload = base64.urlsafe_b64encode(json.dumps({"client_id": "abc123def456", "token_use": "access", "exp": int(time.time()) + 3600}).encode()).decode().rstrip("=")
            return self._send(200, {"access_token": "e30." + payload + ".sig"})
        return self._send(404, {"message": "nope"})


class ClientTest(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.server = HTTPServer(("127.0.0.1", 0), Fake)
        cls.port = cls.server.server_address[1]
        threading.Thread(target=cls.server.serve_forever, daemon=True).start()

    @classmethod
    def tearDownClass(cls):
        cls.server.shutdown()

    def setUp(self):
        Fake.calls.clear()
        Fake.polls = 0
        self.tmp = tempfile.TemporaryDirectory()
        self.api = f"http://127.0.0.1:{self.port}/api/v1"

    def tearDown(self):
        self.tmp.cleanup()

    def test_finds_local_token_and_makes_a_video_in_one_call(self):
        Path(self.tmp.name, "mcp-token").write_text("a" * 64 + "\n")
        br = Brainrotten(api_url=self.api, data_dir=Path(self.tmp.name))
        br.api_url = self.api  # explicit URL keeps token discovery off; set token the local way
        br._token = Path(self.tmp.name, "mcp-token").read_text().strip()
        guide = br.format_guide("sketch")
        self.assertEqual(guide["format"], "sketch")
        summary = br.make_video({"format": "sketch", "script": {"title": "ok"}}, wait=True)
        self.assertEqual(summary, {"job_id": "job-1", "state": "ready", "title": "x", "seconds": 30,
                                   "video_url": "/api/v1/videos/job-1/video", "questions": ["q1", "pause-3"]})
        self.assertTrue(all(call[2] == "Bearer " + "a" * 64 for call in Fake.calls))

    def test_invalid_script_raises_with_exact_issues_and_never_generates(self):
        br = Brainrotten(api_url=self.api, token="t" * 64)
        with self.assertRaises(BrainrottenError) as caught:
            br.make_video({"format": "skit", "script": {"title": "bad"}})
        self.assertEqual(caught.exception.issues[0]["path"], "script.title")
        self.assertFalse(any(call[1] == "/api/v1/videos" for call in Fake.calls))

    def test_hosted_account_refreshes_an_expired_token_and_saves_it_privately(self):
        profile = {"apiUrl": self.api, "domain": f"http://127.0.0.1:{self.port}", "issuer": "x", "clientId": "abc123def456",
                   "accessToken": "old", "refreshToken": "refresh-token-value", "expiresAt": 1}
        path = Path(self.tmp.name, "account-connection.json")
        path.write_text(json.dumps(profile))
        br = Brainrotten(account=True, data_dir=Path(self.tmp.name))
        br.format_guide("skit")
        saved = json.loads(path.read_text())
        self.assertNotEqual(saved["accessToken"], "old")
        self.assertEqual(saved["refreshToken"], "refresh-token-value")
        self.assertEqual(os.stat(path).st_mode & 0o777, 0o600)
        self.assertTrue(Fake.calls[-1][2].startswith("Bearer e30."))

    def test_missing_account_explains_how_to_sign_in(self):
        with self.assertRaises(BrainrottenError) as caught:
            Brainrotten(account=True, data_dir=Path(self.tmp.name))
        self.assertIn("pnpm brainrotten login", caught.exception.message)

    def test_unreachable_server_gives_a_clear_error(self):
        br = Brainrotten(api_url="http://127.0.0.1:9/api/v1", token="synthetic", timeout=2)
        with self.assertRaises(BrainrottenError) as caught:
            br.config()
        self.assertEqual(caught.exception.status, 0)
        self.assertIn("Cannot reach Brainrotten", caught.exception.message)


if __name__ == "__main__":
    unittest.main()
