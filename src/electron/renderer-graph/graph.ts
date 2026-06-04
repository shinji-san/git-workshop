import * as d3 from 'd3';
import type { RendererApi, TickBroadcast, CopyMenuEntry } from '../shared/ipc-contract';
import type { GraphLayout, PositionedNode, LayoutEdge, RefLabel, CommitDetail } from '../../core/graph/GraphLayout';
import { copyTargets, copyAll } from './copy';

declare global {
  interface Window {
    api: RendererApi;
  }
}

const ROW_H = 64;
const LANE_W = 64;
const MARGIN = 48;

const reduceMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
const DUR = reduceMotion ? 0 : 450;

const NODE_R = 9;
const ARROW_LEN = 8; // length of the arrowhead in pixels (= markerWidth)
// The path ends far enough above the parent node that the forward-pointing tip lands
// just above the node (line end = arrow base, the tip extends ARROW_LEN further).
const ARROW_GAP = NODE_R + 3 + ARROW_LEN;

const svg = d3.select<SVGSVGElement, unknown>('#graph');

// Subtle arrowhead: the base (refX=0) sits at the line end, the triangle points forward
// toward the parent node -> the line does not stick out past the tip (no rectangular
// cap). The color follows the respective edge via context-stroke.
svg
  .append('defs')
  .append('marker')
  .attr('id', 'arrow')
  .attr('viewBox', '0 0 10 10')
  .attr('refX', 0)
  .attr('refY', 5)
  .attr('markerWidth', ARROW_LEN)
  .attr('markerHeight', ARROW_LEN)
  .attr('markerUnits', 'userSpaceOnUse')
  .attr('orient', 'auto')
  .append('path')
  .attr('class', 'arrowhead')
  .attr('d', 'M0,1 L10,5 L0,9 Z');

// All graph content lives in a zoom layer so pan/zoom is one transform on the group.
// The legend is drawn directly on the svg (outside the layer) so it stays fixed.
const gZoom = svg.append('g').attr('class', 'zoom-layer');
const gEdges = gZoom.append('g');
const gNodes = gZoom.append('g');

// Zoom with Ctrl + mouse wheel (plain wheel does nothing); drag to pan. Double-click
// zoom is disabled to keep behaviour predictable.
const zoom = d3
  .zoom<SVGSVGElement, unknown>()
  .scaleExtent([0.2, 5])
  // Finer steps: d3 amplifies ctrl+wheel 10x (it reads it as a trackpad pinch). Since we
  // require ctrl for zooming, undo that amplification so each notch zooms gently.
  .wheelDelta((event) => -event.deltaY * (event.deltaMode === 1 ? 0.05 : event.deltaMode ? 1 : 0.002))
  // Wheel zooms only with Ctrl; a mousedown pans only with the LEFT button so a right-click can
  // raise the commit context menu without dragging the canvas. Other events (touch) pass through.
  .filter((event) =>
    event.type === 'wheel' ? event.ctrlKey : event.type === 'mousedown' ? !(event as MouseEvent).button : true,
  )
  .on('zoom', (event) => gZoom.attr('transform', event.transform.toString()));
svg.call(zoom).on('dblclick.zoom', null);

// Single source of truth for the graph's visual styles. Injected into the document for the
// live view AND reused (plus a couple of export-only tweaks) when rasterizing the PNG, so
// screen and export never drift apart.
// Colours come from CSS custom properties (defined per theme in index.html), so the live
// graph recolours automatically when the theme flips. The node ring uses the page
// background so circles read as cut-outs in either theme.
const GRAPH_CSS = `
.edge { stroke: var(--edge); stroke-width: 2; fill: none; marker-end: url(#arrow); }
.edge.unreachable { stroke: var(--edge-unreachable); stroke-dasharray: 4 3; }
.arrowhead { fill: var(--edge); fill: context-stroke; stroke: none; }
circle.node { stroke: var(--graph-bg); stroke-width: 2; }
circle.reachable { fill: var(--node-reachable); }
circle.unreachable { fill: var(--node-unreachable); }
text.summary { fill: var(--summary); font-size: 11px; }
.ref { font-size: 10px; }
.ref-branch { fill: var(--ref-branch); font-style: italic; }
.ref-tag { fill: var(--ref-tag); font-style: italic; }
.ref-head { fill: var(--ref-head); font-weight: bold; }
.legend { fill: var(--legend); font-size: 11px; }
`;
const liveStyle = document.createElement('style');
liveStyle.textContent = GRAPH_CSS;
document.head.appendChild(liveStyle);

// Export-only additions: a standalone SVG has no inherited body font, and `context-stroke`
// does not rasterize reliably, so the arrowheads fall back to the (resolved) edge colour.
const EXPORT_CSS = `${GRAPH_CSS}
text { font-family: system-ui, sans-serif; }
.arrowhead { fill: var(--edge); }
`;

// The theme variables live on <html>; a serialized standalone SVG carries none of them, so
// the export inlines the current resolved values onto the clone (see exportPng).
const THEME_VARS = [
  '--graph-bg',
  '--edge',
  '--edge-unreachable',
  '--node-reachable',
  '--node-unreachable',
  '--summary',
  '--ref-branch',
  '--ref-tag',
  '--ref-head',
  '--legend',
] as const;

// main resolves the OS/menu preference to light|dark; we just reflect it onto <html>,
// which re-resolves the CSS variables and recolours the live graph.
window.api.onThemeChanged((theme) => {
  document.documentElement.dataset.theme = theme;
});
void window.api.getTheme().then((theme) => {
  document.documentElement.dataset.theme = theme;
});

const x = (lane: number) => MARGIN + lane * LANE_W;
const y = (row: number) => MARGIN + row * ROW_H;

// --- SHA tooltip (hover a commit node) ------------------------------------
// A plain DOM overlay (see index.html), positioned at the cursor. The full OID is shown with
// the first 7 chars emphasised and the rest dimmed. `pointer-events: none` keeps it from
// stealing the hover, so it never flickers.
const SHORT = 7;
const TIP_OFFSET = 14;
const tip = document.getElementById('sha-tip') as HTMLDivElement;
const tipShort = tip.querySelector('b') as HTMLElement;
const tipRest = tip.querySelector('span') as HTMLElement;

function moveTip(event: PointerEvent): void {
  const r = tip.getBoundingClientRect();
  let left = event.clientX + TIP_OFFSET;
  let top = event.clientY + TIP_OFFSET;
  // Flip to the other side of the cursor near the right/bottom edge so the tip stays on-screen.
  if (left + r.width > window.innerWidth) left = event.clientX - TIP_OFFSET - r.width;
  if (top + r.height > window.innerHeight) top = event.clientY - TIP_OFFSET - r.height;
  tip.style.left = `${left}px`;
  tip.style.top = `${top}px`;
}

function showTip(event: PointerEvent, oid: string): void {
  tipShort.textContent = oid.slice(0, SHORT);
  tipRest.textContent = oid.slice(SHORT);
  tip.classList.add('show');
  tip.setAttribute('aria-hidden', 'false');
  moveTip(event);
}

function hideTip(): void {
  tip.classList.remove('show');
  tip.setAttribute('aria-hidden', 'true');
}

// --- Commit detail popup (click a commit node) ----------------------------
// The full author/committer/message metadata travels in the layout sidecar (layout.commits);
// we index it by oid and show it in a positioned card on click.
const pop = document.getElementById('commit-pop') as HTMLDivElement;
const popBody = document.getElementById('commit-pop-body') as HTMLDivElement;
let commitByOid = new Map<string, CommitDetail>();

/** Format a commit timestamp in its ORIGINAL timezone, git-show style: `YYYY-MM-DD HH:MM:SS ±HHMM`. */
function formatGitDate(sec: number, tz: string): string {
  const m = tz.match(/^([+-])(\d{2})(\d{2})$/);
  const offMin = m ? (m[1] === '-' ? -1 : 1) * (parseInt(m[2], 10) * 60 + parseInt(m[3], 10)) : 0;
  const d = new Date((sec + offMin * 60) * 1000); // shift so the UTC getters read the original wall clock
  const p = (n: number) => String(n).padStart(2, '0');
  return `${d.getUTCFullYear()}-${p(d.getUTCMonth() + 1)}-${p(d.getUTCDate())} ${p(d.getUTCHours())}:${p(d.getUTCMinutes())}:${p(d.getUTCSeconds())} ${tz}`;
}

/**
 * Wire a button to copy `value` to the clipboard, with a brief "done" swap on its visible label.
 * Copy runs in main via window.api.clipboardWrite -> the SAME path the terminal shortcuts use.
 */
function wireCopy(btn: HTMLButtonElement, value: string, idle: string, done: string): void {
  btn.textContent = idle;
  btn.addEventListener('click', () => {
    window.api.clipboardWrite(value);
    btn.textContent = done;
    btn.classList.add('copied');
    window.setTimeout(() => {
      btn.textContent = idle;
      btn.classList.remove('copied');
    }, 1000);
  });
}

/** Small inline 📋 button that copies `value`; `label` is its accessible name (and tooltip). */
function copyIconButton(value: string, label: string): HTMLButtonElement {
  const btn = document.createElement('button');
  btn.type = 'button';
  btn.className = 'pop-copy';
  btn.title = label;
  btn.setAttribute('aria-label', label);
  wireCopy(btn, value, '📋', '✓');
  return btn;
}

/**
 * Build the popup body via DOM (textContent, never innerHTML) so commit text cannot inject markup.
 * The copy buttons reuse copyTargets/copyAll (the single source of truth shared with the right-click
 * context menu), so popup and menu copy exactly the same strings.
 */
function fillPopup(c: CommitDetail): void {
  popBody.replaceChildren();
  const targets = new Map(copyTargets(c).map((x) => [x.key, x]));
  const target = (key: string) => targets.get(key)!; // keys are fixed in copy.ts

  // SHA line: short bold + dimmed rest, with a copy button.
  const sha = document.createElement('div');
  sha.className = 'pop-sha';
  const short = document.createElement('b');
  short.textContent = c.oid.slice(0, SHORT);
  sha.append(
    short,
    document.createTextNode(c.oid.slice(SHORT)),
    copyIconButton(target('sha').value, target('sha').label),
  );

  // Author/committer + their dates. Only author and committer get a copy button (the dates ride
  // along in "Alles kopieren"). The displayed identity reuses the copy target's value, so the
  // shown text and the copied text are guaranteed identical.
  const dl = document.createElement('dl');
  const row = (label: string, value: string, copy?: { value: string; label: string }) => {
    const dt = document.createElement('dt');
    dt.textContent = label;
    const dd = document.createElement('dd');
    dd.append(document.createTextNode(value));
    if (copy) dd.append(copyIconButton(copy.value, copy.label));
    dl.append(dt, dd);
  };
  row('Autor', target('author').value, target('author'));
  row('Autor-Datum', formatGitDate(c.author.date, c.author.tz));
  row('Committer', target('committer').value, target('committer'));
  row('Committer-Datum', formatGitDate(c.committer.date, c.committer.tz));

  // Message block with a copy button anchored to its top-right corner (outside the scroll area).
  const msgWrap = document.createElement('div');
  msgWrap.className = 'pop-msg-wrap';
  const msgBtn = copyIconButton(target('message').value, target('message').label);
  msgBtn.classList.add('pop-copy-msg');
  const msg = document.createElement('div');
  msg.className = 'pop-msg';
  msg.textContent = c.message;
  msgWrap.append(msgBtn, msg);

  // Footer: copy all fields as one formatted block.
  const all = document.createElement('button');
  all.type = 'button';
  all.className = 'pop-copy-all';
  wireCopy(all, copyAll(c, formatGitDate), 'Alles kopieren', 'Kopiert ✓');

  popBody.append(sha, dl, msgWrap, all);
}

function openPopup(event: PointerEvent, oid: string): void {
  const c = commitByOid.get(oid);
  if (!c) return;
  hideTip();
  fillPopup(c);
  pop.hidden = false;
  // Position at the cursor; flip past it near the right/bottom edge so the card stays on-screen.
  const r = pop.getBoundingClientRect();
  let left = event.clientX + TIP_OFFSET;
  let top = event.clientY + TIP_OFFSET;
  if (left + r.width > window.innerWidth) left = Math.max(4, event.clientX - TIP_OFFSET - r.width);
  if (top + r.height > window.innerHeight) top = Math.max(4, event.clientY - TIP_OFFSET - r.height);
  pop.style.left = `${left}px`;
  pop.style.top = `${top}px`;
}

function closePopup(): void {
  pop.hidden = true;
}

/**
 * Right-click a commit node: show a NATIVE copy context menu (built in main). Entries come from the
 * same copyTargets/copyAll source as the popup buttons, so both copy identical strings.
 */
function openCopyMenu(oid: string): void {
  const c = commitByOid.get(oid);
  if (!c) return;
  hideTip();
  const entries: CopyMenuEntry[] = [
    ...copyTargets(c).map((t): CopyMenuEntry => ({ type: 'copy', label: t.label, value: t.value })),
    { type: 'separator' },
    { type: 'copy', label: 'Alles kopieren', value: copyAll(c, formatGitDate) },
  ];
  void window.api.showCopyMenu(entries);
}

document.getElementById('commit-pop-close')!.addEventListener('click', closePopup);
// A click on the empty SVG background dismisses the popup (node clicks stopPropagation, so they
// reach openPopup without also closing it). d3-zoom only binds mousedown/wheel/dblclick.
svg.on('click', closePopup);
window.addEventListener('keydown', (e) => {
  if (e.key === 'Escape') closePopup();
});

/**
 * Keyed join by OID (stable key, since layout positions change but OIDs do not).
 * Nodes animate cx/cy; edges interpolate their endpoints via attrTween (not the
 * d-string) so the seam stays calm when re-sorting. Transitions are interruptible
 * (last-one-wins) – a new tick tears down a running one cleanly.
 */
function render(layout: GraphLayout): void {
  commitByOid = new Map(layout.commits.map((c) => [c.oid, c]));
  const nodeByOid = new Map(layout.nodes.map((n) => [n.oid, n]));
  const ex = layout.edges.filter((e) => nodeByOid.has(e.child) && nodeByOid.has(e.parent));

  // Edges
  gEdges
    .selectAll<SVGPathElement, LayoutEdge>('path.edge')
    .data(ex, (e) => `${e.child}->${e.parent}`)
    .join(
      (enter) => enter.append('path').attr('class', edgeClass(nodeByOid)).attr('d', (e) => edgePath(e, nodeByOid)),
      (update) => update,
      (exit) => exit.transition().duration(DUR).style('opacity', 0).remove(),
    )
    .attr('class', edgeClass(nodeByOid))
    .transition()
    .duration(DUR)
    .attrTween('d', function (e) {
      const prev = this.getAttribute('d') ?? edgePath(e, nodeByOid);
      const next = edgePath(e, nodeByOid);
      return () => (DUR === 0 ? next : prev === next ? next : next);
    });

  // Nodes
  const g = gNodes
    .selectAll<SVGGElement, PositionedNode>('g.node-group')
    .data(layout.nodes, (n) => n.oid)
    .join((enter) => {
      const ng = enter.append('g').attr('class', 'node-group');
      ng.append('circle').attr('class', (n) => `node ${n.reachable ? 'reachable' : 'unreachable'}`).attr('r', 9);
      ng.append('text').attr('class', 'summary').attr('x', 14).attr('dy', '0.32em');
      ng.append('text').attr('class', 'ref').attr('x', 14).attr('dy', '1.6em');
      // Reveal the commit's SHA on hover and the full detail popup on click. d3 invokes the
      // listener with the element's current datum, so n.oid is always right (the OID is the
      // stable join key anyway). stopPropagation keeps the background click-to-close from firing.
      ng.on('pointerenter', (event: PointerEvent, n) => showTip(event, n.oid))
        .on('pointermove', (event: PointerEvent) => moveTip(event))
        .on('pointerleave', hideTip)
        .on('click', (event: PointerEvent, n) => {
          event.stopPropagation();
          openPopup(event, n.oid);
        })
        .on('contextmenu', (event: MouseEvent, n) => {
          event.preventDefault(); // suppress the default (empty) menu; show our copy menu instead
          openCopyMenu(n.oid);
        });
      return ng;
    });

  g.select('circle').attr('class', (n) => `node ${n.reachable ? 'reachable' : 'unreachable'}`);
  g.select<SVGTextElement>('text.summary').text((n) => truncate(n.summary));

  // One tspan per ref so each can be styled on its own: branches/tags italic, HEAD as "(HEAD)".
  g.select<SVGTextElement>('text.ref')
    .selectAll<SVGTSpanElement, RefLabel>('tspan')
    .data(
      (n) => n.refs,
      (r) => `${r.kind}:${r.name}`,
    )
    .join('tspan')
    .attr('class', (r) => refClass(r))
    .attr('dx', (_r, i) => (i === 0 ? null : '0.7em'))
    .text((r) => (r.kind === 'head' ? '(HEAD)' : r.name));

  g.transition().duration(DUR).attr('transform', (n) => `translate(${x(n.lane)},${y(n.row)})`);

  const maxRow = d3.max(layout.nodes, (n) => n.row) ?? 0;
  const maxLane = d3.max(layout.nodes, (n) => n.lane) ?? 0;
  svg.attr('viewBox', `0 0 ${x(maxLane) + 220} ${y(maxRow) + MARGIN}`);
  // The legend reflects reachability, not connectedness: a dangling commit usually shares
  // an ancestor with the main history (same component), so counting unreachable nodes is
  // what actually tells the learner whether orphans exist.
  drawLegend(layout.nodes.filter((n) => !n.reachable).length);
}

function edgePath(e: LayoutEdge, nodes: Map<string, PositionedNode>): string {
  const c = nodes.get(e.child)!;
  const p = nodes.get(e.parent)!;
  const x1 = x(c.lane);
  const y1 = y(c.row);
  const x2 = x(p.lane);
  const yp = y(p.row);
  const my = (y1 + yp) / 2;
  // End just above the parent node (the parent sits lower): the arrowhead stays visible,
  // the approach to the node is vertical -> the arrow points cleanly down into the parent.
  const y2 = yp - ARROW_GAP;
  return `M${x1},${y1} C${x1},${my} ${x2},${my} ${x2},${y2}`;
}

function edgeClass(nodes: Map<string, PositionedNode>) {
  return (e: LayoutEdge) => {
    const c = nodes.get(e.child);
    const p = nodes.get(e.parent);
    const unreachable = (c && !c.reachable) || (p && !p.reachable);
    return `edge ${unreachable ? 'unreachable' : ''}`;
  };
}

function truncate(s: string): string {
  return s.length > 30 ? s.slice(0, 29) + '…' : s;
}

/** CSS class for a ref label (drives colour and italics). Remotes render like branches. */
function refClass(r: RefLabel): string {
  return r.kind === 'head' ? 'ref-head' : r.kind === 'tag' ? 'ref-tag' : 'ref-branch';
}

function drawLegend(orphanCount: number): void {
  svg.selectAll('text.legend').remove();
  svg
    .append('text')
    .attr('class', 'legend')
    .attr('x', 12)
    .attr('y', 18)
    .text(
      orphanCount > 0
        ? `${orphanCount} verwaiste${orphanCount === 1 ? 'r' : ''} Commit${orphanCount === 1 ? '' : 's'} – nicht erreichbar`
        : 'alle Commits erreichbar (keine verwaisten)',
    );
}

/** Remove all nodes, edges and the legend – used when the learner leaves an exercise. */
function clearGraph(): void {
  hideTip(); // a node may vanish from under the cursor without a pointerleave
  closePopup();
  gNodes.selectAll('*').remove();
  gEdges.selectAll('*').remove();
  svg.selectAll('text.legend').remove();
  svg.call(zoom.transform, d3.zoomIdentity); // reset pan/zoom for the next exercise
}

window.api.onTick((b: TickBroadcast) => render(b.graph));
window.api.onGraphClear(clearGraph);

// --- PNG export -----------------------------------------------------------
// A standalone serialized SVG carries no external CSS, so we inline EXPORT_CSS (the shared
// GRAPH_CSS plus the export tweaks) and a background into a clone before rasterizing it.
const SVG_NS = 'http://www.w3.org/2000/svg';

async function exportPng(): Promise<void> {
  const source = svg.node();
  if (!source) return;
  const vb = source.viewBox.baseVal;
  const width = vb && vb.width ? vb.width : source.clientWidth || 800;
  const height = vb && vb.height ? vb.height : source.clientHeight || 600;
  const x = vb ? vb.x : 0;
  const y = vb ? vb.y : 0;

  const clone = source.cloneNode(true) as SVGSVGElement;
  clone.setAttribute('xmlns', SVG_NS);
  clone.setAttribute('width', String(width));
  clone.setAttribute('height', String(height));
  // Export the full graph regardless of the current on-screen pan/zoom.
  clone.querySelectorAll('.zoom-layer').forEach((el) => el.removeAttribute('transform'));

  // Inline the current theme's resolved colours onto the clone so var() references in
  // EXPORT_CSS resolve in the standalone SVG (the export thus follows the on-screen theme).
  const cs = getComputedStyle(document.documentElement);
  const v = (name: string) => cs.getPropertyValue(name).trim();
  for (const name of THEME_VARS) clone.style.setProperty(name, v(name));

  const style = document.createElementNS(SVG_NS, 'style');
  style.textContent = EXPORT_CSS;
  clone.insertBefore(style, clone.firstChild);

  const bg = document.createElementNS(SVG_NS, 'rect');
  bg.setAttribute('x', String(x));
  bg.setAttribute('y', String(y));
  bg.setAttribute('width', String(width));
  bg.setAttribute('height', String(height));
  bg.setAttribute('fill', v('--graph-bg') || '#16181c');
  clone.insertBefore(bg, style.nextSibling);

  // Watermark in the bottom-right corner (export only).
  const watermark = document.createElementNS(SVG_NS, 'text');
  watermark.setAttribute('x', String(x + width - 8));
  watermark.setAttribute('y', String(y + height - 6));
  watermark.setAttribute('text-anchor', 'end');
  watermark.setAttribute('fill', v('--legend') || '#6b7280');
  watermark.setAttribute('font-size', '8');
  watermark.setAttribute('font-family', 'system-ui, sans-serif');
  watermark.textContent = `Generated by Git-Workshop ${new Date().getFullYear()}`;
  clone.appendChild(watermark);

  const url = URL.createObjectURL(new Blob([new XMLSerializer().serializeToString(clone)], { type: 'image/svg+xml;charset=utf-8' }));
  try {
    const img = new Image();
    await new Promise<void>((resolve, reject) => {
      img.onload = () => resolve();
      img.onerror = () => reject(new Error('SVG konnte nicht gerendert werden'));
      img.src = url;
    });
    const scale = 2; // crisper output than 1:1
    const canvas = document.createElement('canvas');
    canvas.width = Math.ceil(width * scale);
    canvas.height = Math.ceil(height * scale);
    const ctx = canvas.getContext('2d');
    if (!ctx) return;
    ctx.scale(scale, scale);
    ctx.drawImage(img, 0, 0);
    const pngBlob = await new Promise<Blob | null>((res) => canvas.toBlob(res, 'image/png'));
    if (!pngBlob) return;
    await window.api.exportGraphPng(new Uint8Array(await pngBlob.arrayBuffer()));
  } finally {
    URL.revokeObjectURL(url);
  }
}

window.api.onGraphExportRequest(() => void exportPng());
