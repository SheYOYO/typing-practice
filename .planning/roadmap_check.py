#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
roadmap_check.py —— Layered-memory guard (L0/L1/L2/L3) for planning-with-files.

WHY THIS EXISTS
---------------
Once findings.md / task_plan.md pass ~100 KB and the auto-injected memory file hits its
own size cap, the agent starts spending turns rewording summaries instead of working,
and starts making mistakes. The fix is a short L1 ROADMAP.md that is the ONLY file read
every session — but a short file only stays short if a script enforces it.

WHAT IT CHECKS
--------------
  [hard] L0 memory file      <= limit_l0   (default 1500 chars)
  [hard] L1 ROADMAP.md       <= limit_l1   (default 6000 chars)
  [hard] every `Fxx`  pointer in L1 actually exists in some findings.md   (catches drift)
  [hard] every `§xx`  pointer in L1 actually exists in some task_plan.md
  [soft] path-like strings in L1 backticks resolve under some plausible prefix
  [hint] when L1 is over the cap, list which sections to move to ROADMAP.archive.md

EXIT CODE
---------
  0 = pass      1 = fail (hard check)      2 = nothing to check (no L1 found)

USAGE
-----
  python roadmap_check.py                    # auto-detect from cwd
  python roadmap_check.py --root /path/proj
  python roadmap_check.py --limit-l1 8000
  python roadmap_check.py --json             # machine-readable

AUTO-DETECTION (no config needed in most projects)
--------------------------------------------------
  L0   <root>/.workbuddy/memory/MEMORY.md   |  <root>/MEMORY.md   | <root>/.codebuddy/MEMORY.md
  L1   <root>/.planning/ROADMAP.md          |  <root>/ROADMAP.md  | <root>/.planning/*/ROADMAP.md
  L1.5 <root>/.planning/ROADMAP.archive.md  |  <root>/ROADMAP.archive.md
  L2   any findings.md / task_plan.md under <root> (depth <= 4, VCS dirs skipped)
"""
from __future__ import annotations

import argparse
import json
import os
import re
import sys

SKIP_DIRS = {".git", "__pycache__", "node_modules", ".venv", "venv",
             ".svn", ".hg", ".idea", ".vscode", "dist", "build"}
MAX_DEPTH = 4

RE_F = re.compile(r"\bF(\d{1,4})\b")
RE_SEC = re.compile(r"§\s?(\d+(?:\.\d+)*)")
RE_BACKTICK = re.compile(r"`([^`\n]+)`")
RE_PATHISH = re.compile(r"^[\w\u4e00-\u9fff\-_.\\/]+(?:\.[A-Za-z0-9]{1,5})?[\\/]?$")

DEFAULT_LIMIT_L0 = 1500
DEFAULT_LIMIT_L1 = 6000


# ---------------------------------------------------------------- helpers

def read(path: str) -> str:
    if not path or not os.path.isfile(path):
        return ""
    try:
        with open(path, "r", encoding="utf-8", errors="replace") as f:
            return f.read()
    except OSError:
        return ""


def human(n: int) -> str:
    return "%d chars" % n if n < 10240 else "%.1f KB" % (n / 1024.0)


def find_first(root: str, candidates: list[str]) -> str:
    for rel in candidates:
        p = os.path.join(root, rel)
        if os.path.isfile(p):
            return p
    return ""


def find_named(root: str, names: set[str], limit: int = 8) -> list[str]:
    """Find files by basename under root (depth-limited)."""
    hits: list[str] = []
    root = os.path.abspath(root)
    for base, dirs, files in os.walk(root):
        depth = os.path.relpath(base, root).count(os.sep)
        if depth >= MAX_DEPTH:
            dirs[:] = []
        dirs[:] = [d for d in dirs if d not in SKIP_DIRS]
        for fn in files:
            if fn in names:
                hits.append(os.path.join(base, fn))
                if len(hits) >= limit:
                    return hits
    return hits


def resolve_layers(root: str):
    root = os.path.abspath(root)
    l0 = find_first(root, [
        os.path.join(".workbuddy", "memory", "MEMORY.md"),
        os.path.join(".codebuddy", "memory", "MEMORY.md"),
        "MEMORY.md",
        os.path.join(".claude", "CLAUDE.md"),
        "CLAUDE.md",
    ])
    l1 = find_first(root, [
        os.path.join(".planning", "ROADMAP.md"),
        "ROADMAP.md",
        "ROADMAP.MD",
    ])
    if not l1:
        hits = find_named(root, {"ROADMAP.md", "roadmap.md"}, limit=1)
        l1 = hits[0] if hits else ""
    l15 = find_first(root, [
        os.path.join(".planning", "ROADMAP.archive.md"),
        "ROADMAP.archive.md",
    ])
    if not l15 and l1:
        cand = os.path.join(os.path.dirname(l1), "ROADMAP.archive.md")
        l15 = cand if os.path.isfile(cand) else ""
    findings = find_named(root, {"findings.md"}, limit=8)
    plans = find_named(root, {"task_plan.md"}, limit=8)
    return l0, l1, l15, findings, plans


def path_prefixes(root: str, l1: str) -> list[str]:
    pres = ["", root + os.sep]
    if l1:
        pd = os.path.dirname(l1)
        pres += [pd + os.sep, os.path.dirname(pd) + os.sep]
    pres += [os.path.join(root, ".planning") + os.sep,
             os.path.join(root, "shell", "assets") + os.sep,
             os.path.join(root, "tools") + os.sep]
    # Generic: every directory up to depth 2 under root is a plausible prefix.
    # (Without this, a bare `_engine/probe.js` can never be located and floods warnings.)
    try:
        for base, dirs, _ in os.walk(root):
            if os.path.relpath(base, root).count(os.sep) >= 2:
                dirs[:] = []
            dirs[:] = [d for d in dirs if d not in SKIP_DIRS]
            for d in dirs:
                pres.append(os.path.join(base, d) + os.sep)
            if len(pres) > 80:
                break
    except OSError:
        pass
    # dedupe, keep order
    seen, out = set(), []
    for p in pres:
        if p not in seen:
            seen.add(p)
            out.append(p)
    return out


# ---------------------------------------------------------------- main

def main() -> int:
    ap = argparse.ArgumentParser(
        description="Layered-memory guard: keep the L1 roadmap small and its pointers alive.")
    ap.add_argument("--root", default=".", help="project root (default: cwd)")
    ap.add_argument("--limit-l0", type=int, default=DEFAULT_LIMIT_L0)
    ap.add_argument("--limit-l1", type=int, default=DEFAULT_LIMIT_L1)
    ap.add_argument("--json", action="store_true", dest="as_json")
    args = ap.parse_args()

    root = os.path.abspath(args.root)
    if not os.path.isdir(root):
        print("not a directory: %s" % root)
        return 2

    l0, l1, l15, findings, plans = resolve_layers(root)
    if not l1:
        msg = ("No ROADMAP.md found under %s.\n"
               "Create one from the skill template (templates/ROADMAP.md) first.\n"
               "Nothing to check." % root)
        print(msg)
        return 2

    out: list[str] = []
    errs: list[str] = []
    warns: list[str] = []

    def L(s: str = "") -> None:
        out.append(s)

    L("=" * 68)
    L("roadmap_check —— layered memory guard (L0/L1/L2/L3)")
    L("root = %s" % root)
    L("=" * 68)

    # ---- 1. sizes
    L("")
    L("[sizes]")
    n0, n1, n15 = len(read(l0)), len(read(l1)), len(read(l15))
    for name, path, n, lim in (
            ("L0  pointer", l0, n0, args.limit_l0),
            ("L1  roadmap", l1, n1, args.limit_l1)):
        if not path:
            L("   %-14s (not found — skipped)" % name)
            continue
        ok = n <= lim
        if not ok:
            errs.append("%s over cap: %d > %d" % (name, n, lim))
        L("   %-14s %10s / cap %-6d %s   %s"
          % (name, human(n), lim, "OK " if ok else "OVER", os.path.basename(path)))
    if l15:
        L("   %-14s %10s   (archive, uncapped)" % ("L1.5 archive", human(n15)))
    for p in findings + plans:
        L("   %-14s %10s   (L2 — grep only)"
          % ("L2 " + os.path.basename(p), human(os.path.getsize(p))))

    t1 = read(l1)

    # ---- 2. Fxx pointers
    L("")
    L("[pointers -> findings.md]")
    f_nums = sorted({int(m) for m in RE_F.findall(t1)})
    if f_nums:
        corpus = "\n".join(read(p) for p in findings)
        bad = ["F%d" % n for n in f_nums
               if not re.search(r"\bF%d\b" % n, corpus)]
        if bad:
            errs.append("%d F-pointer(s) not found in findings.md: %s"
                        % (len(bad), ", ".join(bad)))
            L("   * dangling: %s" % ", ".join(bad))
        else:
            L("   %d pointer(s) all resolve (F%d–F%d)"
              % (len(f_nums), min(f_nums), max(f_nums)))
    else:
        L("   (no Fxx pointers in L1)")

    # ---- 3. §xx pointers
    L("")
    L("[pointers -> task_plan.md]")
    secs = sorted(set(RE_SEC.findall(t1)))
    if secs:
        pcorpus = "\n".join(read(p) for p in plans)
        bad_s = [s for s in secs if s not in pcorpus]
        if bad_s:
            errs.append("section pointer(s) not found in task_plan.md: %s" % ", ".join(bad_s))
            L("   * dangling: %s" % ", ".join(bad_s))
        else:
            L("   %d pointer(s) all resolve (%s)" % (len(secs), ", ".join(secs)))
    else:
        L("   (no §xx pointers in L1)")

    # ---- 4. paths (soft)
    L("")
    L("[paths] (soft — a bare filename is not an error)")
    pres = path_prefixes(root, l1)
    miss, checked = [], 0
    for m in RE_BACKTICK.findall(t1):
        s = m.strip()
        if not s or len(s) > 90 or s.startswith(("http", "#", "$", "%", "<")):
            continue
        # Only check things that LOOK like a path. A bare filename (`rules.js`,
        # `github.com`) is a generic reference, not a path — checking it only adds noise.
        if "/" not in s and "\\" not in s:
            continue
        if not RE_PATHISH.match(s):
            continue
        checked += 1
        if not any(os.path.exists(os.path.join(pre, s.replace("/", os.sep))) for pre in pres):
            miss.append(s)
    for s in miss:
        L("   ! unlocated  %s" % s)
    if miss:
        warns.append("%d unlocated path(s)" % len(miss))
    L("   checked %d, unlocated %d" % (checked, len(miss)))

    # ---- 5. split advice when over cap
    if n1 > args.limit_l1:
        L("")
        L("[split advice] L1 is over cap — move these to ROADMAP.archive.md, largest first:")
        paras, cur = [], []
        for line in t1.split("\n"):
            if line.startswith("## "):
                if cur:
                    paras.append("\n".join(cur))
                cur = [line]
            else:
                cur.append(line)
        if cur:
            paras.append("\n".join(cur))
        for p in sorted(paras, key=lambda x: -len(x))[:5]:
            L("   %8d chars  %s" % (len(p), p.split("\n")[0][:56]))

    # ---- verdict
    L("")
    L("=" * 68)
    if errs:
        L("* FAIL (%d hard)" % len(errs))
        for e in errs:
            L("   - " + e)
    else:
        L("PASS: L0/L1 within caps, all pointers resolve")
    if warns:
        L("! %d soft warning(s)" % len(warns))
    L("=" * 68)

    if args.as_json:
        print(json.dumps({"ok": not errs, "errors": errs, "warnings": warns,
                          "l0": n0, "l1": n1, "l15": n15,
                          "files": {"l0": l0, "l1": l1, "l15": l15}},
                         ensure_ascii=False, indent=2))
    else:
        print("\n".join(out))
    return 0 if not errs else 1


if __name__ == "__main__":
    sys.exit(main())
