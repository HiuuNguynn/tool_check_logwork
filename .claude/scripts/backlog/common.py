#!/usr/bin/env python3

from __future__ import annotations

import json
import os
import re
import urllib.error
import urllib.parse
import urllib.request
from pathlib import Path
from typing import Any

try:
    import tomllib
except ModuleNotFoundError:  # pragma: no cover
    import tomli as tomllib  # type: ignore


TIMEOUT = 20
COMMENT_BATCH = 5
ALL_STATUS_PARAMS = "&statusId[]=1&statusId[]=2&statusId[]=3&statusId[]=4"
MCP_CONFIG_SOURCES = (
    ("codex", Path("~/.codex/config.toml").expanduser()),
    ("cursor", Path("~/.cursor/mcp.json").expanduser()),
    ("gemini", Path("~/.gemini/antigravity/mcp_config.json").expanduser()),
    ("kiro", Path("~/.kiro/settings/mcp.json").expanduser()),
    ("claude", Path("~/Library/Application Support/Claude/claude_desktop_config.json").expanduser()),
)


def normalize_domain(value: str) -> str:
    raw = (value or "").strip()
    if not raw:
        return ""
    raw = re.sub(r"^https?://", "", raw)
    raw = raw.split("/", 1)[0]
    if raw.endswith(".backlog.com"):
        return raw
    if "." not in raw:
        return f"{raw}.backlog.com"
    return raw


def domain_to_space(domain: str) -> str:
    normalized = normalize_domain(domain)
    return normalized.split(".", 1)[0] if normalized else ""


def mask_secret(value: str) -> str:
    if not value:
        return ""
    if len(value) <= 8:
        return "*" * len(value)
    return f"{value[:4]}...{value[-4:]}"


def _normalize_config(domain: str, api_key: str, source: str) -> dict[str, str]:
    normalized_domain = normalize_domain(domain)
    return {
        "source": source,
        "domain": normalized_domain,
        "space": domain_to_space(normalized_domain),
        "api_key": api_key.strip(),
    }


def _load_from_env() -> dict[str, str] | None:
    api_key = (os.getenv("BACKLOG_API_KEY") or "").strip()
    domain = normalize_domain(os.getenv("BACKLOG_DOMAIN") or os.getenv("BACKLOG_SPACE") or "")
    if api_key and domain:
        return _normalize_config(domain, api_key, "env")
    return None


def _load_codex_config(path: Path) -> dict[str, str] | None:
    data = tomllib.loads(path.read_text(encoding="utf-8"))
    backlog = (((data.get("mcp_servers") or {}).get("backlog")) or {})
    env = (backlog.get("env") or {})
    api_key = (env.get("BACKLOG_API_KEY") or "").strip()
    domain = normalize_domain(env.get("BACKLOG_DOMAIN") or env.get("BACKLOG_SPACE") or "")
    if api_key and domain:
        return _normalize_config(domain, api_key, str(path))
    return None


def _load_json_config(path: Path) -> dict[str, str] | None:
    data = json.loads(path.read_text(encoding="utf-8"))
    mcp_servers = data.get("mcpServers") or data.get("mcp_servers") or {}
    backlog = mcp_servers.get("backlog") or {}
    env = backlog.get("env") or {}
    api_key = (env.get("BACKLOG_API_KEY") or "").strip()
    domain = normalize_domain(env.get("BACKLOG_DOMAIN") or env.get("BACKLOG_SPACE") or "")
    if api_key and domain:
        return _normalize_config(domain, api_key, str(path))
    return None


def resolve_backlog_config() -> dict[str, str]:
    env_config = _load_from_env()
    if env_config:
        return env_config

    for source_name, path in MCP_CONFIG_SOURCES:
        if not path.is_file():
            continue
        try:
            if path.suffix == ".toml":
                config = _load_codex_config(path)
            else:
                config = _load_json_config(path)
        except Exception:
            continue
        if config:
            return config

    searched = ", ".join(str(path) for _, path in MCP_CONFIG_SOURCES)
    raise RuntimeError(
        "Backlog MCP config not found. Expected BACKLOG_DOMAIN/BACKLOG_API_KEY in env "
        f"or one of these files: {searched}"
    )


def api_base(config: dict[str, str]) -> str:
    return f"https://{config['domain']}/api/v2"


def fetch_json(url: str, timeout: int = TIMEOUT) -> Any:
    with urllib.request.urlopen(url, timeout=timeout) as response:
        return json.loads(response.read().decode())


def fetch_json_or_empty(url: str, timeout: int = TIMEOUT) -> Any:
    try:
        return fetch_json(url, timeout=timeout)
    except urllib.error.HTTPError:
        return []


def build_url(config: dict[str, str], path: str, **params: Any) -> str:
    query = {"apiKey": config["api_key"]}
    query.update({key: value for key, value in params.items() if value is not None})
    encoded = urllib.parse.urlencode(query, doseq=True)
    return f"{api_base(config)}{path}?{encoded}"


def fetch_issue(issue_key_or_id: str | int, config: dict[str, str]) -> dict[str, Any]:
    issue_ref = urllib.parse.quote(str(issue_key_or_id), safe="")
    return fetch_json(build_url(config, f"/issues/{issue_ref}"))


def fetch_all_comments(issue_key_or_id: str | int, config: dict[str, str]) -> list[dict[str, Any]]:
    comments: list[dict[str, Any]] = []
    min_id = 0

    while True:
        params: dict[str, Any] = {"count": COMMENT_BATCH, "order": "asc"}
        if min_id:
            params["minId"] = min_id
        batch = fetch_json_or_empty(build_url(config, f"/issues/{issue_key_or_id}/comments", **params))
        if not batch:
            break
        comments.extend(batch)
        min_id = batch[-1]["id"] + 1
        if len(batch) < COMMENT_BATCH:
            break

    return comments


def fetch_all_attachments(issue_key_or_id: str | int, config: dict[str, str]) -> list[dict[str, Any]]:
    attachments: list[dict[str, Any]] = []

    issue_attachments = fetch_json_or_empty(build_url(config, f"/issues/{issue_key_or_id}/attachments"))
    for attachment in issue_attachments:
        attachment["_source"] = "issue"
    attachments.extend(issue_attachments)

    comments = fetch_all_comments(issue_key_or_id, config)
    for comment in comments:
        comment_id = comment["id"]
        comment_attachments = fetch_json_or_empty(
            build_url(config, f"/issues/{issue_key_or_id}/comments/{comment_id}/attachments")
        )
        for attachment in comment_attachments:
            attachment["_source"] = f"comment:{comment_id}"
        attachments.extend(comment_attachments)

    return attachments


def fetch_child_issues(issue_key_or_id: str | int, config: dict[str, str]) -> list[dict[str, Any]]:
    issue = fetch_issue(issue_key_or_id, config)
    issue_id = issue["id"]
    children: list[dict[str, Any]] = []
    offset = 0
    count = 100

    while True:
        url = (
            f"{api_base(config)}/issues?apiKey={config['api_key']}"
            f"&parentIssueId[]={issue_id}"
            f"{ALL_STATUS_PARAMS}"
            f"&count={count}&offset={offset}&order=asc"
        )
        batch = fetch_json(url)
        children.extend(batch)
        if len(batch) < count:
            break
        offset += count

    return children


def fetch_parent_issue(issue: dict[str, Any], config: dict[str, str]) -> dict[str, Any] | None:
    parent_issue_id = issue.get("parentIssueId")
    if not parent_issue_id:
        return None
    return fetch_issue(parent_issue_id, config)


def dump_json(data: Any) -> str:
    return json.dumps(data, ensure_ascii=False, indent=2)
