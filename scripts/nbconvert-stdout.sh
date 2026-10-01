#!/usr/bin/env bash
# lychee --preprocess hook: converts a notebook to Markdown on stdout so the
# link checker sees real text instead of raw, backslash-escaped JSON (which
# makes it misdetect URL boundaries, e.g. appending a stray trailing slash or
# swallowing an escaped newline into the URL).
set -euo pipefail
exec jupyter nbconvert --to markdown --stdout "$1"
