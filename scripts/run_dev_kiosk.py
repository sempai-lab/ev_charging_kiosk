"""
Helper to start the Next.js dev server and open Chrome in fullscreen/kiosk.

Usage (Windows example):
  python scripts/run_dev_kiosk.py --url http://localhost:3000

Optional flags:
  --project-dir PATH   Path to the Next.js project (defaults to repo root).
  --command CMD ...    Override the dev command (defaults to: npm run dev).
  --no-open            Start the dev server but do not launch the browser.
  --wait-secs N        Seconds to wait for the dev server to respond (default 60).
  --chrome-path PATH   Explicit Chrome executable path if auto-detect fails.
"""

from __future__ import annotations

import argparse
import os
import subprocess
import sys
import time
import urllib.error
import urllib.request
from pathlib import Path
from typing import List, Optional


DEFAULT_COMMAND = ["npm", "run", "dev"]
DEFAULT_URL = "http://localhost:3000"
DEFAULT_WAIT_SECS = 60
# Common dev ports to probe if the primary URL is not responding (Vite often auto-increments).
FALLBACK_PORTS = [3000] + list(range(5173, 5184))


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(description="Start dev server and open Chrome fullscreen.")
    parser.add_argument("--project-dir", type=Path, default=Path(__file__).resolve().parents[1])
    parser.add_argument("--url", default=os.environ.get("DEV_URL", DEFAULT_URL))
    parser.add_argument(
        "--command",
        nargs=argparse.REMAINDER,
        default=None,
        help="Command to start the dev server (defaults to: npm run dev).",
    )
    parser.add_argument("--no-open", action="store_true", help="Do not open the browser.")
    parser.add_argument("--wait-secs", type=int, default=DEFAULT_WAIT_SECS, help="Max seconds to wait for server.")
    parser.add_argument("--chrome-path", default=os.environ.get("CHROME_PATH"), help="Explicit Chrome executable path.")
    return parser.parse_args()


def find_chrome(explicit_path: Optional[str]) -> Optional[str]:
    if explicit_path and Path(explicit_path).exists():
        return explicit_path

    candidates = [
        r"C:\Program Files\Google\Chrome\Application\chrome.exe",
        r"C:\Program Files (x86)\Google\Chrome\Application\chrome.exe",
        r"C:\Program Files\Microsoft\Edge\Application\msedge.exe",
        r"C:\Program Files (x86)\Microsoft\Edge\Application\msedge.exe",
        "/usr/bin/google-chrome",
        "/usr/bin/chromium",
        "/usr/bin/chromium-browser",
        "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome",
    ]
    for path in candidates:
        if Path(path).exists():
            return path
    return None


def wait_for_server(urls: List[str], timeout_secs: int) -> Optional[str]:
    """Poll a list of URLs until one responds; return the first responsive URL."""
    deadline = time.time() + timeout_secs
    while time.time() < deadline:
        for url in urls:
            try:
                with urllib.request.urlopen(url, timeout=2) as resp:  # noqa: S310
                    if resp.status < 500:
                        return url
            except (urllib.error.URLError, ConnectionError):
                continue
        time.sleep(1)
    return None


def open_browser(chrome_path: str, url: str) -> subprocess.Popen:
    args = [
        chrome_path,
        "--incognito",
        "--kiosk",
        "--start-fullscreen",
        "--disable-infobars",
        "--force-device-scale-factor=1.1",  # 110% zoom
        url,
    ]
    return subprocess.Popen(args, stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)


def run_dev_server(project_dir: Path, command: Optional[List[str]]) -> subprocess.Popen:
    cmd = command if command else DEFAULT_COMMAND
    return subprocess.Popen(cmd, cwd=project_dir)


def main() -> int:
    args = parse_args()
    project_dir: Path = args.project_dir
    dev_command = args.command if args.command else DEFAULT_COMMAND
    url = args.url
    fallback_urls = list({url} | {f"http://localhost:{p}" for p in FALLBACK_PORTS})

    if not project_dir.exists():
        print(f"[error] project dir does not exist: {project_dir}", file=sys.stderr)
        return 1

    print(f"[info] starting dev server in {project_dir} with: {' '.join(dev_command)}")
    dev_proc = run_dev_server(project_dir, args.command)

    responsive_url = wait_for_server(fallback_urls, args.wait_secs)
    if not responsive_url:
        print(f"[warn] server did not respond at any of {fallback_urls} within {args.wait_secs}s", file=sys.stderr)
        print("       If your dev server binds elsewhere, pass --url http://host:port", file=sys.stderr)
    else:
        print(f"[info] server is responding at {responsive_url}")
        url = responsive_url

    if args.no_open:
        return 0

    chrome = find_chrome(args.chrome_path)
    if not chrome:
        print("[error] could not find Chrome/Edge; set CHROME_PATH or use --chrome-path", file=sys.stderr)
        return 1

    print(f"[info] opening browser: {chrome} -> {url}")
    open_browser(chrome, url)
    return 0


if __name__ == "__main__":
    sys.exit(main())

