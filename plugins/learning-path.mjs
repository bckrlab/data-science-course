// MyST directive plugin: renders the Duolingo-style session learning path
// on the landing page, driven by chapters/learning-path.json.
//
// A build-time directive (not raw HTML in index.md) is required because
// mystmd doesn't reliably support embedded <script>/HTML in markdown
// sources — see the decisions log in CONTEXT.md.
//
// Constraints on the raw HTML this directive emits (verified empirically
// against mystmd 1.11's render pipeline, which sanitizes/reprocesses
// `{type: 'html'}` node content rather than passing it through verbatim):
//   - Only <div>, <span> and <a> survive. <section>, <style> and <svg> are
//     stripped (or, for <section>, silently downgraded to <p>).
//   - <div>/<span> keep arbitrary `style`/`class` attributes, so all layout
//     (absolute positioning, line segments) is done via inline styles on
//     divs, with cosmetics in an external stylesheet (site.options.style)
//     since <style> blocks don't survive.
//   - <a> loses any inline `style` attribute (class is kept and merged with
//     mystmd's own auto-added "link" class), and an <a> with more than one
//     *element* child gets split into one <a> per child. So every link here
//     wraps exactly one child element (nesting further inside that one
//     child, e.g. two spans under a single wrapping span, is fine).
//   - Internal-looking hrefs (relative, no leading slash) are resolved and
//     BASE_URL-prefixed by mystmd itself, same as native TOC links.

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const DATA_FILE = path.join(
  path.dirname(fileURLToPath(import.meta.url)),
  '..',
  'chapters',
  'learning-path.json',
);

// Layout constants (px). The main line follows a sine wave through session
// nodes; extras branch left/right off their session's main node, alternating
// so the path doesn't lean to one side. NODE_MAIN/NODE_EXTRA must match the
// square sizes in styles/learning-path.css — they're only used here to keep
// nodes from clipping the container edge.
const AMPLITUDE = 100;
const PERIOD = 6; // sessions per full wave cycle
const ROW_HEIGHT = 180;
const TOP_PAD = 90;
const EXTRA_GAP_X = 140;
const EXTRA_Y_STAGGER = 36;
const MARGIN = 40;
const NODE_MAIN = 90;
const NODE_EXTRA = 74;
const CURVE_SAMPLES = 8; // straight segments used to approximate each curve

// Trailing "more to come" cloud, shown after the last revealed session's
// main node whenever any session isn't revealed yet. CLOUD_WIDTH/HEIGHT
// must match the .lp-cloud box in styles/learning-path.css — they're used
// here only to keep the cloud from clipping the container edge.
const CLOUD_WIDTH = 420;
const CLOUD_HEIGHT = 270;
const CLOUD_GAP_Y = 330; // vertical distance from the last revealed main node to the cloud's center

function escapeHtml(value) {
  return String(value)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

// chapters/exercise_03/pca-dimensionality-reduction.ipynb
//   -> chapters/exercise-03/pca-dimensionality-reduction
function fileToHref(file) {
  const slug = file
    .replace(/^chapters\//, '')
    .replace(/\.ipynb$/, '')
    .split('/')
    .map((part) => part.replace(/_/g, '-').toLowerCase())
    .join('/');
  return `chapters/${slug}`;
}

// Main line offset around x=0; shifted to a positive, centered coordinate
// system once the full layout (including branches) is known.
function mainOffset(sessionIndex) {
  const offsetX = AMPLITUDE * Math.sin((2 * Math.PI * sessionIndex) / PERIOD);
  return { x: offsetX, y: TOP_PAD + sessionIndex * ROW_HEIGHT };
}

function cubicBezierPoint(p0, p1, p2, p3, t) {
  const mt = 1 - t;
  return {
    x: mt ** 3 * p0.x + 3 * mt ** 2 * t * p1.x + 3 * mt * t ** 2 * p2.x + t ** 3 * p3.x,
    y: mt ** 3 * p0.y + 3 * mt ** 2 * t * p1.y + 3 * mt * t ** 2 * p2.y + t ** 3 * p3.y,
  };
}

// A straight dashed <div> rotated/stretched between two points — the only
// way to draw a line here, since <svg> doesn't survive the render pipeline.
function lineSegmentHtml(p1, p2, extraClass = '') {
  const dx = p2.x - p1.x;
  const dy = p2.y - p1.y;
  const length = Math.sqrt(dx * dx + dy * dy);
  const angleDeg = (Math.atan2(dy, dx) * 180) / Math.PI;
  return (
    `<div class="lp-line ${extraClass}" style="left:${p1.x}px;top:${p1.y}px;` +
    `width:${length}px;transform:rotate(${angleDeg}deg);"></div>`
  );
}

function curveSegmentsHtml(prev, curr) {
  const midY = (prev.y + curr.y) / 2;
  const control1 = { x: prev.x, y: midY };
  const control2 = { x: curr.x, y: midY };
  const points = [];
  for (let s = 0; s <= CURVE_SAMPLES; s += 1) {
    points.push(cubicBezierPoint(prev, control1, control2, curr, s / CURVE_SAMPLES));
  }
  const segments = [];
  for (let s = 1; s < points.length; s += 1) {
    segments.push(lineSegmentHtml(points[s - 1], points[s], 'lp-mainline'));
  }
  return segments.join('');
}

// Pure-CSS cumulus blob (a body plus a few overlapping circular puffs) — no
// per-call geometry beyond the one translate, since <svg> doesn't survive
// the render pipeline. Shape/sizing lives in styles/learning-path.css.
function cloudHtml(x, y) {
  return (
    `<div class="lp-cloud" style="left:${x}px;top:${y}px;">` +
    `<div class="lp-cloud-puff lp-cloud-puff-1"></div>` +
    `<div class="lp-cloud-puff lp-cloud-puff-2"></div>` +
    `<div class="lp-cloud-puff lp-cloud-puff-3"></div>` +
    `<div class="lp-cloud-body"></div>` +
    `</div>`
  );
}

function nodeHtml(subtopic, x, y) {
  const roleClass = subtopic.role === 'main' ? 'lp-main' : 'lp-extra';
  return (
    `<div class="lp-node ${roleClass}" style="left:${x}px;top:${y}px;">` +
    `<a class="lp-link" href="${escapeHtml(fileToHref(subtopic.file))}">` +
    `<span class="lp-inner">` +
    `<span class="lp-emoji">${subtopic.emoji}</span>` +
    `<span class="lp-text">${escapeHtml(subtopic.title)}</span>` +
    `</span></a></div>`
  );
}

// Lay out one session's main node plus its extras (unshifted x). Extras
// alternate left/right, starting side depending on session+extra index, so
// consecutive branches and multi-extra sessions don't all lean the same way.
function layoutSession(session, sessionIndex) {
  const main = mainOffset(sessionIndex);
  const extras = session.subtopics.filter((s) => s.role === 'extra');
  const mains = session.subtopics.filter((s) => s.role === 'main');
  if (mains.length !== 1) {
    throw new Error(
      `learning-path.json: session ${session.number} has ${mains.length} ` +
        "subtopics with role 'main' (expected exactly 1)",
    );
  }
  if (typeof session.revealed !== 'boolean') {
    throw new Error(
      `learning-path.json: session ${session.number}'s "revealed" must be a ` +
        `JSON boolean, got ${JSON.stringify(session.revealed)}`,
    );
  }

  let leftCount = 0;
  let rightCount = 0;
  const extraPositions = extras.map((extra, j) => {
    const goRight = (sessionIndex + j) % 2 === 0;
    const dist = goRight ? (rightCount += 1) : (leftCount += 1);
    const x = main.x + (goRight ? 1 : -1) * dist * EXTRA_GAP_X;
    const y = main.y + (j % 2 === 0 ? -EXTRA_Y_STAGGER : EXTRA_Y_STAGGER);
    return { subtopic: extra, x, y };
  });

  return { mainSubtopic: mains[0], main, extraPositions };
}

function buildLearningPathHtml() {
  const { sessions } = JSON.parse(fs.readFileSync(DATA_FILE, 'utf-8'));
  const layouts = sessions.map(layoutSession);

  // Once every session for the year is revealed, the path just ends at the
  // final notebook — no cloud, no trailing line. Until then, it ends in a
  // CSS-only cloud right after the last revealed session's main node, with
  // the dashed line disappearing behind it. Everything strictly after that
  // node (a trailing unrevealed suffix — the only shape reveal takes,
  // per-session in order) is simply not rendered at all: no row, no
  // mainline segment. A session hidden earlier in the sequence with later
  // sessions still revealed (e.g. a one-off manual edit, not the normal
  // weekly reveal) is unaffected — it still renders as today's blank,
  // unlabeled row, since it's before the last revealed node.
  let lastRevealedIndex = -1;
  for (let i = sessions.length - 1; i >= 0; i -= 1) {
    if (sessions[i].revealed) {
      lastRevealedIndex = i;
      break;
    }
  }
  const hasUnrevealed = sessions.some((s) => !s.revealed);
  const renderCount = hasUnrevealed ? lastRevealedIndex + 1 : sessions.length;
  const visibleSessions = sessions.slice(0, renderCount);
  const visibleLayouts = layouts.slice(0, renderCount);

  // Shift everything so the leftmost *rendered* edge (a node/extra, or the
  // cloud's own footprint) sits at MARGIN, centering the visible path
  // within its container. An unrevealed session's main point still counts
  // (the line passes through it), but its extras don't — they're never
  // rendered, so they mustn't widen/off-center the container. A trailing
  // unrevealed suffix beyond renderCount doesn't count at all — its rows
  // aren't rendered, so its geometry doesn't exist.
  const allX = visibleLayouts.flatMap((l, i) => [
    l.main.x,
    ...(visibleSessions[i].revealed ? l.extraPositions.map((p) => p.x) : []),
  ]);
  const nodeHalfMax = Math.max(NODE_MAIN, NODE_EXTRA) / 2;
  const minX = allX.length ? Math.min(...allX) : 0;
  const maxX = allX.length ? Math.max(...allX) : 0;
  let leftEdge = minX - nodeHalfMax;
  let rightEdge = maxX + nodeHalfMax;
  // The cloud sits at the last revealed session's raw x (0 if there is
  // none revealed at all). Fold its own left/right footprint into the
  // bounds here instead of padding *both* sides of the node extremes by
  // its half-width — the cloud is rarely at the extreme, so a blanket pad
  // wastes space on whichever side it doesn't actually reach, and with a
  // wide cloud that can push the container noticeably past what the
  // node/extra layout alone needs.
  const cloudCenterXRaw = lastRevealedIndex >= 0 ? visibleLayouts[lastRevealedIndex].main.x : 0;
  if (hasUnrevealed) {
    leftEdge = Math.min(leftEdge, cloudCenterXRaw - CLOUD_WIDTH / 2);
    rightEdge = Math.max(rightEdge, cloudCenterXRaw + CLOUD_WIDTH / 2);
  }
  const shift = MARGIN - leftEdge;
  const width = Math.round(rightEdge + shift + MARGIN);
  const baseHeight =
    renderCount > 0 ? TOP_PAD * 2 + (renderCount - 1) * ROW_HEIGHT : TOP_PAD * 2;
  const height = Math.round(baseHeight + (hasUnrevealed ? CLOUD_GAP_Y + CLOUD_HEIGHT / 2 : 0));

  const mainPoints = visibleLayouts.map((l) => ({ x: l.main.x + shift, y: l.main.y }));
  let mainLineHtml = '';
  for (let i = 1; i < mainPoints.length; i += 1) {
    mainLineHtml += curveSegmentsHtml(mainPoints[i - 1], mainPoints[i]);
  }

  // An unrevealed session (before the last revealed one) renders no node,
  // label, emoji, or extras — the main-line points above are still computed
  // for its row, so the dashed line passes through it as a blank, unlabeled
  // segment instead of stopping short or leaving a gap.
  const sessionsHtml = visibleLayouts
    .map((layout, i) => {
      if (!visibleSessions[i].revealed) {
        return '<div class="lp-session"></div>';
      }

      const main = { x: layout.main.x + shift, y: layout.main.y };
      let branchesHtml = '';
      const extraNodesHtml = layout.extraPositions
        .map(({ subtopic, x, y }) => {
          const shifted = { x: x + shift, y };
          branchesHtml += lineSegmentHtml(main, shifted, 'lp-branch');
          return nodeHtml(subtopic, shifted.x, shifted.y);
        })
        .join('');

      return (
        `<div class="lp-session">${branchesHtml}` +
        `${nodeHtml(layout.mainSubtopic, main.x, main.y)}${extraNodesHtml}</div>`
      );
    })
    .join('');

  // The cloud is appended to the HTML *after* the line segment leading into
  // it, so later DOM paint order draws the cloud over the line's tail end —
  // that's what makes the line "disappear behind" the cloud, no z-index
  // needed.
  let cloudBlockHtml = '';
  if (hasUnrevealed) {
    const lastPoint = mainPoints.length > 0 ? mainPoints[mainPoints.length - 1] : null;
    const cloudCenter = lastPoint
      ? { x: lastPoint.x, y: lastPoint.y + CLOUD_GAP_Y }
      : { x: shift, y: TOP_PAD };
    if (lastPoint) {
      mainLineHtml += lineSegmentHtml(lastPoint, cloudCenter, 'lp-mainline');
    }
    cloudBlockHtml = cloudHtml(cloudCenter.x, cloudCenter.y);
  }

  return (
    `<div class="lp-wrap" style="max-width:${width}px;height:${height}px;">` +
    `${mainLineHtml}${sessionsHtml}${cloudBlockHtml}</div>`
  );
}

const learningPathDirective = {
  name: 'learning-path',
  doc: 'Renders the Duolingo-style session learning path, driven by chapters/learning-path.json.',
  run() {
    return [{ type: 'html', value: buildLearningPathHtml() }];
  },
};

/** @type {import('myst-common').MystPlugin} */
const plugin = {
  name: 'Learning Path',
  author: 'bckrlab',
  license: 'MIT',
  directives: [learningPathDirective],
  roles: [],
  transforms: [],
};

export default plugin;
