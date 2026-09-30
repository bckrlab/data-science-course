[![bckrlab.org](https://img.shields.io/badge/bckrlab.org-blue?style=flat)](https://bckrlab.org/data-science-course/)
[![Binder](https://mybinder.org/badge_logo.svg)](https://mybinder.org/v2/gh/bckrlab/data-science-course/HEAD)

# Data Science Course

## Usage

### Building the book

If you'd like to develop and/or build the Data Science Course book, you should:

> 1. Clone this repository
> 2. Install [uv](https://docs.astral.sh/uv/) and run `uv sync` to create a virtual environment with all dependencies
> 3. (Optional) Edit the books source files located in the `chapters/` directory
> 4. Run `uv run jupyter book start` to remove any existing builds

A fully-rendered HTML version of the book will be available at `http://localhost:3000`.

Tip:
If `uv sync` fails while building `oapackage` (a dependency of `pylhd`) with an
error like `Could NOT find Python (missing: ... Development.Module ...)`, your
system's Python 3.12 is missing development headers. Fix this by using a
uv-managed Python instead of the system one:
```
uv python install 3.12
rm -rf .venv
uv sync -p 3.12
```

### Revealing the next session

The deployed book ships sessions progressively as the live course
progresses, one session at a time. To reveal sessions 1 through N (main
notebook + all extras), run:

```
uv run scripts/reveal.py N
```

This rewrites both `chapters/learning-path.json` (per-session visibility
on the landing page) and `myst.yml` (the `toc`, which controls what
mystmd actually builds) to match. Commit the result, and use
`uv run jupyter book start` to preview exactly what will be deployed
before pushing. Running the script again with the same N is a no-op.

## Credits

This project is created using the excellent open source [Jupyter Book project](https://jupyterbook.org/).

# Links

- https://jupyterbook.org/en/stable/customize/config.html
