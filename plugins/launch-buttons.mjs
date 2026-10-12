// MyST transform plugin: puts one-click "launch Binder" and "Open in Colab"
// badges at the top of every notebook page, deep-linking that page's own
// .ipynb into JupyterLab on mybinder.org and into Google Colab.
//
// mystmd's built-in launch button (`project.jupyter: true`) isn't used: it
// isn't one-click (readers paste a hub URL into a menu), is marked
// experimental, and doesn't support Colab.
//
// The badges are emitted as link/image mdast nodes, not raw HTML, since the
// render pipeline strips raw <img> (see the constraints comment in
// learning-path.mjs). The notebooks themselves are untouched, so a newly
// revealed session gets its badges just by entering the toc.

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');
const MYST_YML = path.join(ROOT, 'myst.yml');

const BINDER_BADGE = 'https://mybinder.org/badge_logo.svg';
const COLAB_BADGE = 'https://colab.research.google.com/assets/colab-badge.svg';

// Value of the scalar at `keys` (a path of nested mapping keys) in a block-
// style YAML document. Plugins aren't handed the project config and there's
// no YAML parser to import here, so this covers just the nested-mapping
// subset myst.yml uses for the keys read below.
function yamlScalar(text, keys) {
  let depth = 0;
  let parentIndent = -1;
  let childIndent = 0;
  for (const line of text.split('\n')) {
    const match = /^( *)([\w-]+):\s*(.*?)\s*$/.exec(line);
    if (!match) continue;
    const [, lead, key, value] = match;
    if (lead.length <= parentIndent) return undefined; // left the enclosing mapping
    childIndent ??= lead.length;
    if (lead.length !== childIndent || key !== keys[depth]) continue;
    if (depth === keys.length - 1) {
      return value.replace(/\s+#.*$/, '').replace(/^(['"])(.*)\1$/, '$2');
    }
    depth += 1;
    parentIndent = lead.length;
    childIndent = undefined;
  }
  return undefined;
}

// Repo comes from project.github and the branch from the thebe binder ref,
// so a fork or a branch switch in myst.yml carries over to every badge.
export function readLaunchConfig(mystYmlText) {
  const keyPaths = {
    github: ['project', 'github'],
    ref: ['project', 'thebe', 'binder', 'ref'],
  };
  const config = {};
  for (const [name, keys] of Object.entries(keyPaths)) {
    config[name] = yamlScalar(mystYmlText, keys);
    if (!config[name]) throw new Error(`launch-buttons: myst.yml has no ${keys.join('.')}`);
  }
  return config;
}

export function binderUrl({ github, ref }, notebookPath) {
  return `https://mybinder.org/v2/gh/${github}/${ref}?urlpath=lab/tree/${encodeURI(notebookPath)}`;
}

// Colab has no environment config of its own, so it opens the notebook
// straight from GitHub at the same repo/ref as Binder.
export function colabUrl({ github, ref }, notebookPath) {
  return `https://colab.research.google.com/github/${github}/blob/${ref}/${encodeURI(notebookPath)}`;
}

function badge(url, imageUrl, alt) {
  return { type: 'link', url, children: [{ type: 'image', url: imageUrl, alt }] };
}

// Prepends the badge block to a notebook page's tree; other pages are left
// alone. `file` is the page's absolute source path, `root` the repo root.
// The block is tagged no-pdf since a link to a live notebook is meaningless
// on paper, and LaTeX can't include the remote SVG badges anyway.
export function addLaunchBadges(tree, file, config, root) {
  if (path.extname(file) !== '.ipynb') return;
  const notebookPath = path.relative(root, file).split(path.sep).join('/');
  tree.children.unshift({
    type: 'block',
    data: { tags: ['no-pdf'] },
    children: [
      {
        type: 'paragraph',
        children: [
          badge(binderUrl(config, notebookPath), BINDER_BADGE, 'Launch Binder'),
          { type: 'text', value: ' ' },
          badge(colabUrl(config, notebookPath), COLAB_BADGE, 'Open in Colab'),
        ],
      },
    ],
  });
}

const launchBadgeTransform = {
  name: 'launch-buttons',
  doc: 'Prepends launch-on-Binder and open-in-Colab badges to every notebook page.',
  stage: 'document',
  plugin: () => {
    const config = readLaunchConfig(fs.readFileSync(MYST_YML, 'utf-8'));
    return (tree, vfile) => addLaunchBadges(tree, vfile.path, config, ROOT);
  },
};

/** @type {import('myst-common').MystPlugin} */
const plugin = {
  name: 'Launch Buttons',
  author: 'bckrlab',
  license: 'MIT',
  directives: [],
  roles: [],
  transforms: [launchBadgeTransform],
};

export default plugin;
