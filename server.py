#!/usr/bin/env python3
"""Local server for the BD tax return helper.

Serves the static UI from ./static and stores one JSON file per person and
assessment year in ./data/people/<person>/<year>.json. No third-party dependencies. Binds to 127.0.0.1 by default
(--host 0.0.0.0 inside Docker, where the port is published to localhost only).

    python3 server.py            # http://127.0.0.1:8765
    python3 server.py --port 9000
"""
import argparse
import json
import os
import re
import shutil
import time
import webbrowser
from http import HTTPStatus
from http.server import SimpleHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path

import pdftext

ROOT = Path(__file__).resolve().parent
STATIC = ROOT / "static"
DATA = ROOT / "data"
PEOPLE = DATA / "people"
REMOVED = DATA / "removed"
MAX_PDF_BYTES = 20 * 1024 * 1024
YEAR_RE = re.compile(r"^\d{4}-\d{4}$")  # e.g. 2026-2027 (assessment year)
PID_RE = re.compile(r"^[a-z0-9][a-z0-9-]{0,39}$")
MAX_BACKUPS_PER_YEAR = 30
YEARS_URL = re.compile(r"^/api/people/([^/]+)/years(?:/([^/?]+))?/?(?:\?.*)?$")
PERSON_URL = re.compile(r"^/api/people/([^/?]+)/?(?:\?.*)?$")


def person_dir(pid):
    return PEOPLE / pid


def person_name(pid):
    try:
        return json.loads((person_dir(pid) / "person.json").read_text("utf-8")).get("name") or pid
    except (OSError, ValueError):
        return pid


def person_years(pid):
    return sorted(p.stem for p in person_dir(pid).glob("*.json") if YEAR_RE.match(p.stem))


def list_people():
    if not PEOPLE.exists():
        return []
    out = [{"id": d.name, "name": person_name(d.name), "years": person_years(d.name)}
           for d in PEOPLE.iterdir() if d.is_dir() and PID_RE.match(d.name)]
    return sorted(out, key=lambda x: x["name"].lower())


def write_json(path, obj):
    tmp = path.with_suffix(".json.tmp")
    tmp.write_text(json.dumps(obj, ensure_ascii=False, indent=2), "utf-8")
    os.replace(tmp, path)


def slugify(name):
    base = re.sub(r"[^a-z0-9]+", "-", name.lower()).strip("-")[:30] or "person"
    pid, n = base, 2
    while person_dir(pid).exists():
        pid, n = f"{base}-{n}", n + 1
    return pid


def migrate_single_user():
    """Older versions kept one person's years directly in ./data. Move them into a "me" profile."""
    old = [p for p in DATA.glob("*.json") if YEAR_RE.match(p.stem)]
    if not old:
        return
    me = person_dir("me")
    if me.exists():
        print(f"Not migrating {len(old)} year file(s) in {DATA}: {me} already exists.", flush=True)
        return
    me.mkdir(parents=True)
    write_json(me / "person.json", {"name": "Me"})
    for p in old:
        os.replace(p, me / p.name)
    if (DATA / "backups").exists():
        os.replace(DATA / "backups", me / "backups")
    print(f"Moved {len(old)} year file(s) into {me}", flush=True)


class Handler(SimpleHTTPRequestHandler):
    def __init__(self, *args, **kwargs):
        super().__init__(*args, directory=str(STATIC), **kwargs)

    def log_message(self, fmt, *args):
        pass  # keep the terminal quiet

    def end_headers(self):
        # make browsers revalidate the UI files so app updates show up on refresh
        if not self.path.startswith("/api/"):
            self.send_header("Cache-Control", "no-cache")
        super().end_headers()

    def send_json(self, obj, status=HTTPStatus.OK):
        body = json.dumps(obj, ensure_ascii=False).encode("utf-8")
        self.send_response(status)
        self.send_header("Content-Type", "application/json; charset=utf-8")
        self.send_header("Content-Length", str(len(body)))
        self.send_header("Cache-Control", "no-store")
        self.end_headers()
        self.wfile.write(body)

    def read_body(self):
        length = int(self.headers.get("Content-Length", 0))
        try:
            return json.loads(self.rfile.read(length).decode("utf-8"))
        except (ValueError, UnicodeDecodeError):
            self.send_json({"error": "invalid JSON"}, HTTPStatus.BAD_REQUEST)
            return None

    def match_years(self):
        """(person id, year or None) for /api/people/<id>/years[/<year>], else None after an error."""
        m = YEARS_URL.match(self.path)
        if not m or not PID_RE.match(m.group(1)) or (m.group(2) and not YEAR_RE.match(m.group(2))):
            self.send_json({"error": "bad path"}, HTTPStatus.BAD_REQUEST)
            return None
        if not person_dir(m.group(1)).is_dir():
            self.send_json({"error": "no such person"}, HTTPStatus.NOT_FOUND)
            return None
        return m.group(1), m.group(2)

    def match_person(self):
        m = PERSON_URL.match(self.path)
        if not m or not PID_RE.match(m.group(1)) or not person_dir(m.group(1)).is_dir():
            self.send_json({"error": "no such person"}, HTTPStatus.NOT_FOUND)
            return None
        return m.group(1)

    def do_GET(self):
        if self.path.split("?")[0] in ("/api/people", "/api/people/"):
            return self.send_json({"people": list_people()})
        if YEARS_URL.match(self.path):
            got = self.match_years()
            if got is None:
                return
            pid, year = got
            if year is None:
                return self.send_json({"years": person_years(pid)})
            p = person_dir(pid) / f"{year}.json"
            if not p.exists():
                return self.send_json({"error": "not found"}, HTTPStatus.NOT_FOUND)
            return self.send_json(json.loads(p.read_text("utf-8")))
        if self.path.startswith("/api/"):
            return self.send_json({"error": "not found"}, HTTPStatus.NOT_FOUND)
        return super().do_GET()

    def do_POST(self):
        if self.path.split("?")[0] == "/api/pdf-text":
            return self.pdf_text()
        # add a person: {"name": "..."}
        if self.path.split("?")[0] not in ("/api/people", "/api/people/"):
            return self.send_json({"error": "not found"}, HTTPStatus.NOT_FOUND)
        body = self.read_body()
        if body is None:
            return
        name = str(body.get("name", "")).strip()[:80]
        if not name:
            return self.send_json({"error": "name required"}, HTTPStatus.BAD_REQUEST)
        pid = slugify(name)
        person_dir(pid).mkdir(parents=True)
        write_json(person_dir(pid) / "person.json", {"name": name})
        return self.send_json({"id": pid, "name": name, "years": []})

    def pdf_text(self):
        # text of an uploaded PDF (a filed return), read in memory and never written to disk
        length = int(self.headers.get("Content-Length", 0))
        if not 0 < length <= MAX_PDF_BYTES:
            return self.send_json({"error": "The file is empty or larger than 20 MB."}, HTTPStatus.BAD_REQUEST)
        data = self.rfile.read(length)
        try:
            return self.send_json({"pages": pdftext.extract(data)})
        except pdftext.PDFError as e:
            return self.send_json({"error": f"Couldn't read the PDF: {e}."}, HTTPStatus.BAD_REQUEST)
        except Exception:  # malformed or unusual PDF
            return self.send_json({"error": "Couldn't read the PDF. Save the return from the website's Return View as a PDF and try that file."}, HTTPStatus.BAD_REQUEST)

    def do_DELETE(self):
        # remove a person: their folder moves to data/removed/, nothing is deleted
        if not PERSON_URL.match(self.path):
            return self.send_json({"error": "not found"}, HTTPStatus.NOT_FOUND)
        pid = self.match_person()
        if pid is None:
            return
        REMOVED.mkdir(parents=True, exist_ok=True)
        os.replace(person_dir(pid), REMOVED / f"{pid}-{time.strftime('%Y%m%d-%H%M%S')}")
        return self.send_json({"ok": True})

    def do_PUT(self):
        if PERSON_URL.match(self.path):  # rename: {"name": "..."}
            pid = self.match_person()
            if pid is None:
                return
            body = self.read_body()
            if body is None:
                return
            name = str(body.get("name", "")).strip()[:80]
            if not name:
                return self.send_json({"error": "name required"}, HTTPStatus.BAD_REQUEST)
            write_json(person_dir(pid) / "person.json", {"name": name})
            return self.send_json({"id": pid, "name": name})
        if not YEARS_URL.match(self.path):
            return self.send_json({"error": "not found"}, HTTPStatus.NOT_FOUND)
        got = self.match_years()
        if got is None:
            return
        pid, year = got
        if year is None:
            return self.send_json({"error": "bad path"}, HTTPStatus.BAD_REQUEST)
        doc = self.read_body()
        if doc is None:
            return
        p = person_dir(pid) / f"{year}.json"
        if p.exists():
            backup_dir = person_dir(pid) / "backups" / year
            backup_dir.mkdir(parents=True, exist_ok=True)
            # at most one backup per minute so autosave doesn't flood the folder
            stamp = time.strftime("%Y%m%d-%H%M")
            shutil.copy2(p, backup_dir / f"{stamp}.json")
            for old in sorted(backup_dir.glob("*.json"))[:-MAX_BACKUPS_PER_YEAR]:
                old.unlink()
        write_json(p, doc)
        return self.send_json({"ok": True, "savedAt": time.strftime("%Y-%m-%d %H:%M:%S")})


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--host", default=os.environ.get("TAX_HOST", "127.0.0.1"))
    ap.add_argument("--port", type=int, default=int(os.environ.get("TAX_PORT", 8765)))
    ap.add_argument("--no-browser", action="store_true")
    args = ap.parse_args()
    DATA.mkdir(exist_ok=True)
    migrate_single_user()
    PEOPLE.mkdir(exist_ok=True)
    server = ThreadingHTTPServer((args.host, args.port), Handler)
    url = f"http://127.0.0.1:{args.port}/"
    print(f"Tax helper running at {url}  (Ctrl+C to stop)", flush=True)
    if not args.no_browser:
        webbrowser.open(url)
    try:
        server.serve_forever()
    except KeyboardInterrupt:
        pass


if __name__ == "__main__":
    main()
