#!/usr/bin/env python3
"""Reveal sessions 1..N on the deployed book, in one command.

Rewrites chapters/learning-path.json's per-session "revealed" flags and
myst.yml's project.toc to match a single cutoff value. Both files are
edited as text (not parsed and re-dumped) so untouched parts of each file
keep their exact existing formatting, and running the script twice with
the same cutoff produces no further diff.

project.exclude is never written to -- per ADR 0001, it has no effect for
this project's explicit `file:` toc entries, and toc membership alone
controls what mystmd builds.
"""

import argparse
import json
import re
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
LEARNING_PATH = ROOT / "chapters" / "learning-path.json"
MYST_YML = ROOT / "myst.yml"

INDEX_MARKER = "    - file: index.md\n"

# A JSON string: any run of non-quote/non-backslash chars, or a backslash
# escape (\" included), repeated -- so an escaped quote in a title can't
# truncate the match early.
JSON_STRING = r'"(?:[^"\\]|\\.)*"'

REVEALED_FIELD_RE = re.compile(
    r'("number":\s*"(?P<number>\d+)",\s*\n\s*"title":\s*' + JSON_STRING + r',\s*\n\s*)'
    r'"revealed":\s*(?:true|false)'
)


def load_sessions():
    return json.loads(LEARNING_PATH.read_text())["sessions"]


def build_learning_path_text(cutoff, total):
    text = LEARNING_PATH.read_text()

    def repl(match):
        revealed = int(match.group("number")) <= cutoff
        return f'{match.group(1)}"revealed": {"true" if revealed else "false"}'

    new_text, count = REVEALED_FIELD_RE.subn(repl, text)
    if count != total:
        raise RuntimeError(
            f"{LEARNING_PATH}: matched {count} session 'revealed' fields, "
            f"expected {total} -- has the file's schema changed?"
        )
    return new_text


def toc_block(session):
    lines = [
        f'    - title: Exercise {session["number"]}',
        "      children:",
    ]
    for subtopic in session["subtopics"]:
        lines.append(f'        - file: {subtopic["file"]}')
    return "\n".join(lines)


def build_myst_yml_text(sessions, cutoff):
    text = MYST_YML.read_text()
    start = text.index(INDEX_MARKER) + len(INDEX_MARKER)
    end = text.index("site:\n", start)

    revealed = [s for s in sessions if int(s["number"]) <= cutoff]
    blocks = "\n".join(toc_block(s) for s in revealed)
    blocks = f"{blocks}\n" if blocks else ""

    return text[:start] + blocks + text[end:]


def main():
    sessions = load_sessions()
    total = len(sessions)

    parser = argparse.ArgumentParser(
        description="Reveal sessions 1..N on the deployed book.",
    )
    parser.add_argument(
        "cutoff",
        type=int,
        help=f"Reveal sessions 1 through this number (0-{total}).",
    )
    args = parser.parse_args()

    if not 0 <= args.cutoff <= total:
        parser.error(f"cutoff must be between 0 and {total} (got {args.cutoff})")

    # Build both new file contents before writing either one, so a failure
    # (e.g. an unexpected schema) can't leave learning-path.json and
    # myst.yml disagreeing about the reveal cutoff.
    new_learning_path_text = build_learning_path_text(args.cutoff, total)
    new_myst_yml_text = build_myst_yml_text(sessions, args.cutoff)

    LEARNING_PATH.write_text(new_learning_path_text)
    MYST_YML.write_text(new_myst_yml_text)

    print(f"Revealed sessions 1-{args.cutoff:02d} of {total:02d}.")
    print("Preview with `uv run jupyter book start` before committing.")


if __name__ == "__main__":
    sys.exit(main())
