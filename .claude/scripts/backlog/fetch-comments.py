#!/usr/bin/env python3

from __future__ import annotations

import sys
from pathlib import Path

SCRIPT_DIR = Path(__file__).resolve().parent
sys.path.insert(0, str(SCRIPT_DIR))

from common import dump_json, fetch_all_comments, resolve_backlog_config


def main() -> int:
    if len(sys.argv) < 2:
        print("Usage: python3 .claude/scripts/backlog/fetch-comments.py <ISSUE_KEY>", file=sys.stderr)
        return 1

    issue_key = sys.argv[1]
    config = resolve_backlog_config()
    comments = fetch_all_comments(issue_key, config)
    print(dump_json(comments))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
