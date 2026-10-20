// Run with: node --test plugins/*.test.mjs
import assert from 'node:assert/strict';
import { test } from 'node:test';

import { addLaunchBadges, binderUrl, colabUrl, readLaunchConfig } from './launch-buttons.mjs';

const MYST_YML = `version: 1
project:
  title: Data Science Course
  github: some-org/some-repo
  thebe:
    binder:
      repo: other-org/ignored
      provider: github
      url: https://mybinder.org
      ref: some-branch
  toc:
    - file: index.md
`;

const CONFIG = { github: 'bckrlab/data-science-course', ref: 'main' };
const ROOT = '/repo';

function notebookTree() {
  return {
    type: 'root',
    children: [
      { type: 'block', children: [{ type: 'heading', depth: 1, children: [] }] },
      { type: 'block', children: [{ type: 'code', value: 'x = 1' }] },
    ],
  };
}

function badgeLinks(tree) {
  const first = tree.children[0];
  return first.children.flatMap((p) => p.children ?? []).filter((n) => n.type === 'link');
}

test('readLaunchConfig takes repo from project.github and ref from thebe binder', () => {
  assert.deepEqual(readLaunchConfig(MYST_YML), { github: 'some-org/some-repo', ref: 'some-branch' });
});

test('readLaunchConfig ignores same-named keys nested deeper', () => {
  const text = MYST_YML.replace('  github: some-org/some-repo\n', '  other:\n    github: wrong/repo\n  github: some-org/some-repo\n');
  assert.equal(readLaunchConfig(text).github, 'some-org/some-repo');
});

test('readLaunchConfig drops inline comments', () => {
  const text = MYST_YML.replace('ref: some-branch', 'ref: some-branch  # deploy branch');
  assert.equal(readLaunchConfig(text).ref, 'some-branch');
});

test('readLaunchConfig fails loudly when a key is missing', () => {
  assert.throws(() => readLaunchConfig('project:\n  title: x\n'), /project\.github/);
});

test('binderUrl deep-links the notebook into JupyterLab', () => {
  assert.equal(
    binderUrl(CONFIG, 'chapters/exercise_02/CURVE.ipynb'),
    'https://mybinder.org/v2/gh/bckrlab/data-science-course/main' +
      '?urlpath=lab/tree/chapters/exercise_02/CURVE.ipynb',
  );
});

test('colabUrl opens the Colab variant of the notebook from GitHub', () => {
  assert.equal(
    colabUrl(CONFIG, 'chapters/exercise_02/CURVE.ipynb'),
    'https://colab.research.google.com/github/bckrlab/data-science-course/blob/main' +
      '/colab/exercise_02/CURVE.ipynb',
  );
});

test('a notebook page gets a Binder badge as its first block', () => {
  const tree = notebookTree();
  addLaunchBadges(tree, '/repo/chapters/exercise_01/intro-to-python_tasks.ipynb', CONFIG, ROOT);

  assert.equal(tree.children.length, 3);
  const [link] = badgeLinks(tree);
  assert.equal(
    link.url,
    'https://mybinder.org/v2/gh/bckrlab/data-science-course/main' +
      '?urlpath=lab/tree/chapters/exercise_01/intro-to-python_tasks.ipynb',
  );
  assert.equal(link.children[0].type, 'image');
  assert.equal(link.children[0].url, 'https://mybinder.org/badge_logo.svg');
  assert.ok(link.children[0].alt);
});

test('a notebook page gets a Colab badge next to the Binder badge', () => {
  const tree = notebookTree();
  addLaunchBadges(tree, '/repo/chapters/exercise_01/intro-to-python_tasks.ipynb', CONFIG, ROOT);

  assert.equal(tree.children.length, 3);
  assert.equal(tree.children[0].children.length, 1, 'both badges share one paragraph');
  const [, colab] = badgeLinks(tree);
  assert.equal(
    colab.url,
    'https://colab.research.google.com/github/bckrlab/data-science-course/blob/main' +
      '/colab/exercise_01/intro-to-python_tasks.ipynb',
  );
  assert.equal(colab.children[0].type, 'image');
  assert.equal(colab.children[0].url, 'https://colab.research.google.com/assets/colab-badge.svg');
  assert.ok(colab.children[0].alt);
});

test('the badges are kept out of PDF exports', () => {
  const tree = notebookTree();
  addLaunchBadges(tree, '/repo/chapters/exercise_01/intro-to-python_tasks.ipynb', CONFIG, ROOT);
  assert.deepEqual(tree.children[0].data.tags, ['no-pdf']);
});

test('a markdown page gets no badges', () => {
  const tree = notebookTree();
  addLaunchBadges(tree, '/repo/index.md', CONFIG, ROOT);
  assert.deepEqual(tree, notebookTree());
});
