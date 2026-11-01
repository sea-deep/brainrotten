"""Brainrotten Python SDK: the MCP tools as plain functions.

An agent can write one short script (guide -> validate -> generate -> wait) instead of
several tool calls, and print only a small summary. Standard library only.
"""
from __future__ import annotations

import json
import os
import time
import urllib.error
import urllib.parse
import urllib.request
from pathlib import Path
from typing import Any, Optional

DATA_DIR = Path(os.environ.get("BRAINROT_DATA_DIR", Path.home() / ".local/share/brainrot"))
LOCAL_URL = f"http://127.0.0.1:{os.environ.get('BRAINROT_PORT', '3001')}/api/v1"
FINAL_STATES = {"ready", "failed", "needs_review"}


class BrainrottenError(RuntimeError):
    """An API error with the server's message (never includes tokens)."""

    def __init__(self, status: int, message: str, issues: Optional[list] = None):
        super().__init__(f"{status}: {message}")
        self.status, self.message, self.issues = status, message, issues or []


class Brainrotten:
    """Client for a local Brainrotten Studio or the hosted API.

    Connection order:
      1. explicit ``api_url`` / ``token``
      2. env ``BRAINROTTEN_API_URL`` / ``BRAINROTTEN_TOKEN``
      3. ``account=True``: the hosted account saved by ``pnpm brainrotten login`` (auto-refresh)
      4. local Studio at 127.0.0.1 with this installation's private MCP token
    """

    def __init__(self, api_url: Optional[str] = None, token: Optional[str] = None, account: bool = False,
                 data_dir: Optional[Path] = None, timeout: float = 60.0):
        self.data_dir = Path(data_dir) if data_dir else DATA_DIR
        self.timeout = timeout
        self._account = None
        api_url = api_url or os.environ.get("BRAINROTTEN_API_URL")
        token = token or os.environ.get("BRAINROTTEN_TOKEN")
        if account and not token:
            self._account = self._read_account()
            api_url = api_url or self._account["apiUrl"]
        self.api_url = (api_url or LOCAL_URL).rstrip("/")
        self._token = token
        if not self._token and not self._account and self.api_url.startswith("http://127.0.0.1"):
            token_file = self.data_dir / "mcp-token"
            if token_file.exists():
                self._token = token_file.read_text().strip()

    # ---- connection -------------------------------------------------------------------------
    def _read_account(self) -> dict:
        path = self.data_dir / "account-connection.json"
        if not path.exists():
            raise BrainrottenError(401, "No hosted account saved. Run: pnpm brainrotten login --api-url <API>")
        return json.loads(path.read_text())

    def _bearer(self) -> Optional[str]:
        if not self._account:
            return self._token
        if self._account["expiresAt"] > (time.time() + 60) * 1000:
            return self._account["accessToken"]
        # Refresh with the saved refresh token (public client, no secret) and save it privately.
        body = urllib.parse.urlencode({"grant_type": "refresh_token", "client_id": self._account["clientId"],
                                       "refresh_token": self._account["refreshToken"]}).encode()
        req = urllib.request.Request(self._account["domain"].rstrip("/") + "/oauth2/token", data=body,
                                     headers={"content-type": "application/x-www-form-urlencoded"})
        try:
            with urllib.request.urlopen(req, timeout=30) as res:
                tokens = json.loads(res.read())
        except urllib.error.HTTPError as err:
            raise BrainrottenError(401, "Account sign-in expired. Run pnpm brainrotten login again.") from err
        access = tokens.get("access_token", "")
        claims = _claims(access)
        if claims.get("client_id") != self._account["clientId"] or claims.get("token_use") != "access":
            raise BrainrottenError(401, "The sign-in service returned a token for a different client.")
        self._account = {**self._account, "accessToken": access, "expiresAt": int(claims["exp"]) * 1000,
                         "refreshToken": tokens.get("refresh_token", self._account["refreshToken"])}
        path = self.data_dir / "account-connection.json"
        tmp = path.with_suffix(".tmp")
        tmp.write_text(json.dumps(self._account))
        os.chmod(tmp, 0o600)
        os.replace(tmp, path)
        return access

    def _request(self, method: str, route: str, body: Any = None) -> Any:
        headers = {"content-type": "application/json", "accept": "application/json"}
        bearer = self._bearer()
        if bearer:
            headers["authorization"] = "Bearer " + bearer
        data = json.dumps(body).encode() if body is not None else None
        req = urllib.request.Request(self.api_url + route, data=data, method=method, headers=headers)
        try:
            with urllib.request.urlopen(req, timeout=self.timeout) as res:
                raw = res.read()
                return json.loads(raw) if raw else None
        except urllib.error.HTTPError as err:
            try:
                payload = json.loads(err.read() or b"{}")
            except json.JSONDecodeError:
                payload = {}
            raise BrainrottenError(err.code, payload.get("message", err.reason), payload.get("issues")) from None

    # ---- discovery (same as the MCP tools) ---------------------------------------------------
    def config(self) -> dict:
        """Formats, ready voices and readiness flags (list_video_voices)."""
        return self._request("GET", "/studio/config")

    def format_guide(self, format: Optional[str] = None, language: str = "hinglish") -> dict:
        """Rules and a complete valid example for one format (get_video_formats).
        Defaults: sketch for systems/flows/bugs, skit for concepts."""
        query = urllib.parse.urlencode({k: v for k, v in {"format": format, "language": language}.items() if v})
        return self._request("GET", "/formats/guide?" + query)

    def learning_guide(self, session_id: Optional[str] = None) -> dict:
        return self._request("GET", f"/sessions/{session_id}/guide" if session_id else "/learning-guide")

    def search_image(self, query: str) -> dict:
        return self._request("POST", "/images/search", {"query": query})

    # ---- videos ------------------------------------------------------------------------------
    def validate(self, request: dict) -> dict:
        """validate_video_script: issues, warnings, estimated seconds. No paid calls."""
        return self._request("POST", "/videos/validate", request)

    def generate(self, request: dict) -> dict:
        """generate_short_video: queues the video and returns the job at once."""
        return self._request("POST", "/videos", request)

    def status(self, job_id: str) -> dict:
        return self._request("GET", f"/videos/{job_id}")

    def wait(self, job_id: str, timeout: float = 900, interval: float = 5) -> dict:
        deadline = time.time() + timeout
        while True:
            job = self.status(job_id)
            if job.get("state") in FINAL_STATES or time.time() > deadline:
                return job
            time.sleep(interval)

    def learning_pack(self, job_id: str) -> dict:
        return self._request("GET", f"/videos/{job_id}/learning")

    def list_videos(self, **filters: Any) -> dict:
        query = urllib.parse.urlencode({k: v for k, v in filters.items() if v is not None})
        return self._request("GET", "/library" + (f"?{query}" if query else ""))

    def download(self, job: dict, path: str) -> str:
        """Save a ready video's MP4. Works for local and hosted (signed URL) videos."""
        url = job["videoUrl"]
        if url.startswith("/"):
            url = self.api_url.split("/api/v1")[0] + url
        headers = {} if "X-Amz-Signature" in url else {"authorization": "Bearer " + (self._bearer() or "")}
        with urllib.request.urlopen(urllib.request.Request(url, headers=headers), timeout=300) as res, open(path, "wb") as out:
            out.write(res.read())
        return path

    def make_video(self, request: dict, wait: bool = True, download_to: Optional[str] = None) -> dict:
        """Validate, generate and (optionally) wait in one call. Returns a small summary dict,
        so an agent's context stays small. Raises BrainrottenError with the issues if invalid."""
        checked = self.validate(request)
        if not checked.get("valid"):
            raise BrainrottenError(422, "Script is not valid", checked.get("issues"))
        job = self.generate(request)
        if wait:
            job = self.wait(job["jobId"])
        summary = _summary(job, checked)
        if download_to and job.get("state") == "ready":
            summary["saved_to"] = self.download(job, download_to)
        return summary

    # ---- learning sessions -------------------------------------------------------------------
    def record_session(self, checkpoint: dict) -> dict:
        return self._request("POST", "/sessions", checkpoint)

    def get_session(self, session_id: str) -> dict:
        return self._request("GET", f"/sessions/{session_id}")

    def list_sessions(self, limit: int = 10, cursor: Optional[str] = None) -> dict:
        query = urllib.parse.urlencode({k: v for k, v in {"limit": limit, "cursor": cursor}.items() if v is not None})
        return self._request("GET", "/sessions?" + query)

    def publish_lesson(self, session_id: str, video: dict, wait: bool = True) -> dict:
        """publish_session_lesson, then optionally wait. Returns a small summary."""
        job = self._request("POST", f"/sessions/{session_id}/videos", video)
        if wait:
            job = self.wait(job["jobId"])
        return _summary(job, None)

    def quota(self) -> dict:
        """Hosted only: free videos used and remaining."""
        return self._request("GET", "/me")


def _summary(job: dict, checked: Optional[dict]) -> dict:
    out = {"job_id": job.get("jobId"), "state": job.get("state"), "title": job.get("title"),
           "seconds": job.get("durationSeconds"), "error": job.get("error")}
    if job.get("state") == "ready":
        out["video_url"] = job.get("videoUrl")
        questions = (job.get("learning") or {}).get("questions") or []
        out["questions"] = [q.get("id") for q in questions]
    if checked and checked.get("warnings"):
        out["warnings"] = checked["warnings"]
    return {k: v for k, v in out.items() if v is not None}


def _claims(token: str) -> dict:
    import base64
    try:
        part = token.split(".")[1]
        return json.loads(base64.urlsafe_b64decode(part + "=" * (-len(part) % 4)))
    except (IndexError, ValueError):
        return {}
