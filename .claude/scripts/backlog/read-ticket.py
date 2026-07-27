#!/usr/bin/env python3

from __future__ import annotations

import argparse
import json
import sys
from pathlib import Path

SCRIPT_DIR = Path(__file__).resolve().parent
sys.path.insert(0, str(SCRIPT_DIR))

from common import (
    dump_json,
    fetch_all_attachments,
    fetch_all_comments,
    fetch_child_issues,
    fetch_issue,
    fetch_parent_issue,
    mask_secret,
    resolve_backlog_config,
)


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(
        description="Read a Backlog ticket context using API credentials auto-loaded from local MCP config."
    )
    parser.add_argument("issue_key", help="Backlog issue key, for example PIPC-4090")
    parser.add_argument(
        "--out-dir",
        help="Optional directory to write issue/comments/parent/children/attachments JSON files",
    )
    return parser.parse_args()


def write_outputs(output_dir: Path, bundle: dict) -> None:
    output_dir.mkdir(parents=True, exist_ok=True)
    files = {
        "issue.json": bundle["issue"],
        "comments.json": bundle["comments"],
        "parent.json": bundle["parentIssue"],
        "children.json": bundle["childIssues"],
        "attachments.json": bundle["attachments"],
        "bundle.json": bundle,
    }
    for file_name, payload in files.items():
        (output_dir / file_name).write_text(json.dumps(payload, ensure_ascii=False, indent=2), encoding="utf-8")


def main() -> int:
    args = parse_args()
    config = resolve_backlog_config()
    issue = fetch_issue(args.issue_key, config)
    comments = fetch_all_comments(args.issue_key, config)
    parent_issue = fetch_parent_issue(issue, config)
    child_issues = fetch_child_issues(args.issue_key, config)
    attachments = fetch_all_attachments(args.issue_key, config)

    bundle = {
        "issueKey": issue.get("issueKey") or args.issue_key,
        "config": {
            "source": config["source"],
            "domain": config["domain"],
            "space": config["space"],
            "apiKey": mask_secret(config["api_key"]),
        },
        "coverage": {
            "descriptionRead": bool(issue.get("description")),
            "commentsRead": True,
            "parentRead": parent_issue is not None or not issue.get("parentIssueId"),
            "childRead": True,
            "attachmentsRead": True,
        },
        "issue": issue,
        "comments": comments,
        "parentIssue": parent_issue,
        "childIssues": child_issues,
        "attachments": attachments,
    }

    if args.out_dir:
        write_outputs(Path(args.out_dir).expanduser(), bundle)

    print(dump_json(bundle))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
