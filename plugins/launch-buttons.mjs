// MyST transform plugin: puts a one-click "launch Binder" badge at the top of
// every notebook page, deep-linking that page's own .ipynb into JupyterLab
// on mybinder.org.
//
// mystmd's built-in launch button (`project.jupyter: true`) isn't used: it
// isn't one-click (readers paste a hub URL into a menu), is marked
// experimental, and doesn't support Colab.
//
// The badge is emitted as link/image mdast nodes, not raw HTML, since the
// render pipeline strips raw <img> (see the constraints comment in
// learning-path.mjs). The notebooks themselves are untouched, so a newly
// revealed session gets its badges just by entering the toc.

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');
const MYST_YML = path.join(ROOT, 'myst.yml');

const BINDER_BADGE = 'https://mybinder.org/badge_logo.svg';

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

// Prepends the badge block to a notebook page's tree; other pages are left
// alone. `file` is the page's absolute source path, `root` the repo root.
// The block is tagged no-pdf since a link to a live notebook is meaningless
// on paper, and LaTeX can't include the remote SVG badge anyway.
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
          {
            type: 'link',
            url: binderUrl(config, notebookPath),
            children: [{ type: 'image', url: BINDER_BADGE, alt: 'Launch Binder' }],
          },
        ],
      },
    ],
  });
}

const launchBadgeTransform = {
  name: 'launch-buttons',
  doc: 'Prepends a launch-on-Binder badge to every notebook page.',
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
