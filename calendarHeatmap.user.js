// ==UserScript==
// @name         calendarHeatmap
// @namespace    http://tampermonkey.net/
// @version      1.3.0
// @description  heatmap overlay to Toggl Track showing when you work on each project
// @author       ryzencatz
// @match        https://track.toggl.com/*
// @grant        GM_addStyle
// @grant        GM_xmlhttpRequest
// @connect      api.track.toggl.com
// @run-at       document-idle
// ==/UserScript==

(function () {
  'use strict';

  // ─── Constants ────────────────────────────────────────────────────────────
  const API_BASE = 'https://api.track.toggl.com/api/v9';
  const DAYS_BACK = 90;

  const PALETTE = [
    '#e05c5c','#e08c5c','#e0c45c','#9de05c','#5ce07a',
    '#5ce0c4','#5cb4e0','#5c7ae0','#8c5ce0','#c45ce0',
    '#e05ca8','#b44040','#40a0b4','#6040b4','#40b460',
    '#b4a040','#4060b4','#b44080','#40b4a0','#80b440',
  ];

  // ─── Styles ───────────────────────────────────────────────────────────────
  GM_addStyle(`
    @import url('https://fonts.googleapis.com/css2?family=Poppins:wght@400;500;600;700&display=swap');
    #tgh-btn {
      position: fixed;
      bottom: 24px;
      right: 24px;
      z-index: 99999;
      background: #7b68ee;
      color: #fff;
      border: none;
      border-radius: 50px;
      padding: 10px 20px;
      font: 600 13px/1 'Inter', sans-serif;
      cursor: pointer;
      box-shadow: 0 4px 18px rgba(0,0,0,.35);
      transition: transform .15s, box-shadow .15s;
      letter-spacing: .4px;
    }
    #tgh-btn:hover { transform: translateY(-2px); box-shadow: 0 6px 22px rgba(0,0,0,.4); }

    #tgh-panel {
      position: fixed;
      inset: 0;
      z-index: 100000;
      display: none;
      align-items: center;
      justify-content: center;
      background: rgba(10,8,18,.72);
      backdrop-filter: blur(4px);
    }
    #tgh-panel.open { display: flex; }

    #tgh-modal {
      background: #0000002e;
      border-radius: 16px;
      border: 3px solid rgb(151 141 204);
      box-shadow: 0 24px 80px rgba(0,0,0,.6);
      width: 60vw;
      max-height: 90vh;
      overflow: hidden;
      display: flex;
      flex-direction: column;
      font-family: 'poppins';
      color: #afa2eb;
    }

    #tgh-header {
      display: flex;
      align-items: center;
      justify-content: space-between;
      padding: 18px 24px 14px;
      border-bottom: 1px solid rgba(255,255,255,.07);
      flex-shrink: 0;
    }
    #tgh-header h2 {
      margin: 0;
      font-size: 17px;
      margin-bottom: 6px;
      font-weight: 600;
      color: #fff;
    }
    #tgh-header span { font-size: 12px; color: #8a83a8; font-weight: 400; }

    #tgh-close {
      background: none;
      border: none;
      color: #8a83a8;
      font-size: 22px;
      cursor: pointer;
      padding: 0 4px;
      line-height: 1;
      transition: color .15s;
    }
    #tgh-close:hover { color: #fff; }

    #tgh-controls {
      display: flex;
      gap: 8px;
      align-items: center;
      padding: 12px 24px;
      border-bottom: 3px solid rgb(151 141 204);
      flex-shrink: 0;
      flex-wrap: wrap;
      justify-content: space-between;
    }
    #tgh-controls label { font-size: 12px; color: #8a83a8; display: flex; align-items: center; gap: 9px;}
    #tgh-days {
      background: #2a2238;
      border: 1px solid rgba(255,255,255,.1);
      border-radius: 8px;
      color: #e2dff0;
      font-size: 12px;
      padding: 5px 10px;
      cursor: pointer;
    }
    #tgh-reload {
      background: #7b68ee;
      border: none;
      border-radius: 8px;
      color: #fff;
      font-size: 12px;
      font-weight: 600;
      padding: 6px 14px;
      cursor: pointer;
      transition: background .15s;
    }
    #tgh-reload:hover { background: #6a57dd; }
    #tgh-reload:disabled { background: #3a3258; color: #6a6388; cursor: default; }

    #tgh-body {
      display: flex;
      flex: 1;
      overflow: hidden;
      min-height: 0;
    }

    #tgh-sidebar {
      width: 200px;
      min-width: 160px;
      border-right: 3px solid rgb(151 141 204);
      padding: 16px 12px;
      overflow-y: auto;
      flex-shrink: 0;
    }
    #tgh-sidebar h3 {
      margin: 0 0 10px;
      font-size: 11px;
      font-weight: 600;
      text-transform: uppercase;
      letter-spacing: .8px;
      color: #6a6388;
    }

    .tgh-project-item {
      display: flex;
      align-items: center;
      gap: 8px;
      padding: 6px 8px;
      border-radius: 8px;
      cursor: pointer;
      transition: background .12s;
      user-select: none;
      margin-bottom: 2px;
    }
    .tgh-project-item:hover { background: rgba(255,255,255,.06); }
    .tgh-project-item.hidden { opacity: .38; }

    .tgh-swatch {
      width: 10px;
      height: 10px;
      border-radius: 3px;
      flex-shrink: 0;
    }
    .tgh-pname {
      font-size: 12px;
      white-space: nowrap;
      overflow: hidden;
      text-overflow: ellipsis;
      flex: 1;
    }
    .tgh-eye {
      font-size: 14px;
      opacity: .5;
      flex-shrink: 0;
    }

    #tgh-chart-wrap {
      flex: 1;
      overflow-y: auto;
      padding: 20px 24px;
      display: flex;
      flex-direction: column;
      gap: 24px;
    }

    .tgh-project-section { display: flex; flex-direction: column; gap: 6px; }

    /* Project label row: name + peak time badges side by side */
    .tgh-project-label-row {
      display: flex;
      align-items: baseline;
      gap: 8px;
      flex-wrap: wrap;
    }
    .tgh-project-label {
      font-size: 11px;
      font-weight: 600;
      text-transform: uppercase;
      letter-spacing: .7px;
      flex-shrink: 0;
    }
    .tgh-peak-badges {
      display: flex;
      gap: 6px;
      flex-wrap: wrap;
      align-items: center;
    }
    .tgh-peak-badge {
      font-size: 10px;
      font-weight: 500;
      padding: 1px 6px;
      border-radius: 4px;
      white-space: nowrap;
      line-height: 1.6;
    }
    .tgh-peak-badge.primary {
      background: rgba(255,255,255,.1);
      color: #d0cae8;
    }
    .tgh-peak-badge.secondary {
      background: rgba(255,255,255,.05);
      color: #7a7398;
    }
    .tgh-peak-badge .tgh-peak-n {
      opacity: .65;
      margin-left: 3px;
      font-size: 9px;
    }

    /* Row wrapper used for both canvas and block rows */
    .tgh-heatmap-row {
      position: relative;
      height: 44px;
      background: rgba(255,255,255,.04);
      border-radius: 8px;
      overflow: hidden;
    }
    /* Hour grid lines — only on non-canvas rows */
    .tgh-heatmap-row.tgh-block-row::before {
      content: '';
      position: absolute;
      inset: 0;
      background: repeating-linear-gradient(
        90deg,
        transparent,
        transparent calc(100%/24 - 1px),
        rgba(255,255,255,.05) calc(100%/24 - 1px),
        rgba(255,255,255,.05) calc(100%/24)
      );
      pointer-events: none;
      z-index: 10;
    }

    .tgh-heat-block {
      position: absolute;
      top: 0;
      height: 100%;
      mix-blend-mode: screen;
    }

    /* Canvas-based combined row */
    .tgh-canvas-row {
      display: block;
      width: 100%;
      height: 100%;
      border-radius: 8px;
    }

    .tgh-hour-axis {
      display: flex;
      padding: 0 0 4px;
    }
    .tgh-hour-tick {
      flex: 1;
      text-align: center;
      font-size: 9px;
      color: #504868;
      font-variant-numeric: tabular-nums;
    }

    #tgh-loading {
      display: flex;
      flex-direction: column;
      align-items: center;
      justify-content: center;
      gap: 14px;
      flex: 1;
      color: #6a6388;
      font-size: 13px;
    }
    .tgh-spinner {
      width: 32px;
      height: 32px;
      border: 3px solid rgba(123,104,238,.2);
      border-top-color: #7b68ee;
      border-radius: 50%;
      animation: tgh-spin .8s linear infinite;
    }
    @keyframes tgh-spin { to { transform: rotate(360deg); } }

    #tgh-error {
      background: rgba(224,92,92,.12);
      border: 1px solid rgba(224,92,92,.3);
      border-radius: 10px;
      padding: 14px 18px;
      font-size: 13px;
      color: #e05c5c;
      display: none;
    }

    .tgh-tooltip {
      position: fixed;
      z-index: 200000;
      background: #2a2238;
      border: 1px solid rgba(255,255,255,.12);
      border-radius: 8px;
      padding: 7px 12px;
      font-size: 12px;
      color: #e2dff0;
      pointer-events: none;
      display: none;
      box-shadow: 0 6px 20px rgba(0,0,0,.5);
      max-width: 220px;
      line-height: 1.6;
    }
    .tgh-tooltip strong { display: block; font-size: 13px; margin-bottom: 2px; }
    .tgh-tooltip .tgh-layers {
      font-size: 11px;
      color: #8a83a8;
      margin-bottom: 4px;
    }
  `);

  // ─── State ────────────────────────────────────────────────────────────────
  let state = {
    entries: [],
    projects: {},
    hiddenProjects: new Set(),
    loading: false,
    daysBack: DAYS_BACK,
    workspaceId: null,
  };

  // ─── DOM ──────────────────────────────────────────────────────────────────
  const btn = document.createElement('button');
  btn.id = 'tgh-btn';
  btn.textContent = 'heatmap';
  document.body.appendChild(btn);

  const panel = document.createElement('div');
  panel.id = 'tgh-panel';
  panel.innerHTML = `
    <div id="tgh-modal">
      <div id="tgh-header">
        <div>
          <h2>24hr heatmap</h2>
          <span id="tgh-subtitle">loading…</span>
        </div>
        <button id="tgh-close">✕</button>
      </div>
      <div id="tgh-controls">
        <label>Past
          <select id="tgh-days">
            <option value="15">15 days</option>
            <option value="30">30 days</option>
            <option value="60">60 days</option>
            <option value="90" selected>90 days</option>
            <option value="180">180 days</option>
            <option value="365">1 year</option>
          </select>
        </label>
        <button id="tgh-reload">reload data</button>
        <div id="tgh-error"></div>
      </div>
      <div id="tgh-body">
        <div id="tgh-sidebar">
          <h3>Projects</h3>
          <div id="tgh-project-list"></div>
        </div>
        <div id="tgh-chart-wrap">
          <div id="tgh-loading">
            <div class="tgh-spinner"></div>
            Fetching your time entries…
          </div>
        </div>
      </div>
    </div>
    <div class="tgh-tooltip" id="tgh-tooltip"></div>
  `;
  document.body.appendChild(panel);

  const $ = id => document.getElementById(id);
  const tooltip = $('tgh-tooltip');

  // ─── Open / Close ─────────────────────────────────────────────────────────
  btn.addEventListener('click', () => {
    panel.classList.add('open');
    if (!state.entries.length && !state.loading) loadData();
  });
  $('tgh-close').addEventListener('click', () => panel.classList.remove('open'));
  panel.addEventListener('click', e => { if (e.target === panel) panel.classList.remove('open'); });
  $('tgh-reload').addEventListener('click', () => loadData());
  $('tgh-days').addEventListener('change', e => { state.daysBack = +e.target.value; loadData(); });

  // ─── API helpers ──────────────────────────────────────────────────────────
  function apiFetch(path) {
    return new Promise((resolve, reject) => {
      GM_xmlhttpRequest({
        method: 'GET',
        url: API_BASE + path,
        withCredentials: true,
        headers: { 'Content-Type': 'application/json' },
        onload: res => {
          if (res.status === 200) {
            try { resolve(JSON.parse(res.responseText)); }
            catch (e) { reject(new Error('JSON parse error')); }
          } else {
            reject(new Error(`HTTP ${res.status}: ${res.statusText}`));
          }
        },
        onerror: () => reject(new Error('Network error')),
      });
    });
  }

  // ─── Load data ────────────────────────────────────────────────────────────
  async function loadData() {
    state.loading = true;
    $('tgh-reload').disabled = true;
    $('tgh-error').style.display = 'none';
    showLoading();

    try {
      const me = await apiFetch('/me');
      state.workspaceId = me.default_workspace_id;

      const projects = await apiFetch(`/workspaces/${state.workspaceId}/projects?per_page=200&active=both`);
      state.projects = {};
      if (Array.isArray(projects)) {
        projects.forEach((p, i) => {
          state.projects[p.id] = { name: p.name, color: p.color || PALETTE[i % PALETTE.length] };
        });
      }

      const endDate = new Date();
      const startDate = new Date();
      startDate.setDate(endDate.getDate() - state.daysBack);
      const start = startDate.toISOString().split('T')[0];
      const end   = endDate.toISOString().split('T')[0];

      const entries = await apiFetch(`/me/time_entries?start_date=${start}&end_date=${end}`);
      state.entries = Array.isArray(entries) ? entries.filter(e => e.start && e.duration > 0) : [];

      $('tgh-subtitle').textContent =
        `${state.entries.length} entries over the past ${state.daysBack} days`;

      renderAll();
    } catch (err) {
      showError(err.message);
      console.error('[Toggl Heatmap]', err);
    } finally {
      state.loading = false;
      $('tgh-reload').disabled = false;
    }
  }

  // ─── Peak window finder ───────────────────────────────────────────────────
  // Finds the contiguous block of hours with the highest total minutes worked,
  // then an optional secondary peak from the remaining hours.
  function findPeakWindows(entries) {
    if (!entries.length) return [];

    // Accumulate total minutes worked per hour-of-day across all entries
    const minutesInHour = new Array(24).fill(0);
    entries.forEach(e => {
      let cursor = new Date(e.start).getTime();
      const endMs = cursor + e.duration * 1000;
      while (cursor < endMs) {
        const h = new Date(cursor).getHours();
        const nextHourMs = new Date(cursor).setMinutes(60, 0, 0);
        const blockEnd = Math.min(endMs, nextHourMs);
        minutesInHour[h] += (blockEnd - cursor) / 60000;
        cursor = blockEnd;
      }
    });

    // Count distinct entries that touch a given hour (used for the ×N badge)
    function countEntriesInHour(h) {
      return entries.filter(e => {
        let cursor = new Date(e.start).getTime();
        const endMs = cursor + e.duration * 1000;
        while (cursor < endMs) {
          if (new Date(cursor).getHours() === h) return true;
          cursor = new Date(cursor).setMinutes(60, 0, 0);
        }
        return false;
      }).length;
    }

    // Grow a contiguous window outward from the peak hour while neighbours
    // still contribute at least 15% of the peak hour's total minutes.
    function buildWindow(mins) {
      const peakVal = Math.max(...mins);
      if (peakVal === 0) return null;
      const peakH = mins.indexOf(peakVal);
      const threshold = peakVal * 0.15;
      let lo = peakH, hi = peakH;
      while (lo > 0  && mins[lo - 1] >= threshold) lo--;
      while (hi < 23 && mins[hi + 1] >= threshold) hi++;
      return {
        startMin: lo * 60,
        endMin:   (hi + 1) * 60,
        count:    countEntriesInHour(peakH),
      };
    }

    const peak1 = buildWindow(minutesInHour);
    if (!peak1) return [];

    // Zero out peak1 hours then look for a secondary peak
    const remaining = [...minutesInHour];
    for (let h = peak1.startMin / 60; h < peak1.endMin / 60; h++) remaining[h] = 0;

    const peak2 = buildWindow(remaining);
    const results = [peak1];
    if (peak2 && peak2.count >= 2 && peak2.count >= Math.ceil(peak1.count * 0.4)) {
      results.push(peak2);
    }
    return results;
  }

  // Convert a minute-of-day (float) → "2:14pm"
  function fmtMin(totalMins) {
    const m = Math.round(totalMins) % 1440;
    const h = Math.floor(m / 60);
    const min = m % 60;
    return fmt12(h, min);
  }

  // ─── Render ───────────────────────────────────────────────────────────────
  function renderAll() {
    renderSidebar();
    renderChart();
  }

  function renderSidebar() {
    const list = $('tgh-project-list');
    list.innerHTML = '';

    const usedIds = new Set(state.entries.map(e => e.project_id || 0));
    usedIds.add(0);

    const filtered = [...usedIds].filter(id =>
      id === 0 ? state.entries.some(e => !e.project_id) : state.entries.some(e => e.project_id === id)
    );

    filtered.sort((a, b) => getProject(a).name.localeCompare(getProject(b).name))
      .forEach(id => {
        const proj = getProject(id);
        const item = document.createElement('div');
        item.className = 'tgh-project-item' + (state.hiddenProjects.has(id) ? ' hidden' : '');
        item.dataset.pid = id;
        item.innerHTML = `
          <div class="tgh-swatch" style="background:${proj.color}"></div>
          <span class="tgh-pname">${escHtml(proj.name)}</span>
          <span class="tgh-eye">${state.hiddenProjects.has(id) ? '○' : '●'}</span>
        `;
        item.addEventListener('click', () => toggleProject(id));
        list.appendChild(item);
      });
  }

  function toggleProject(id) {
    if (state.hiddenProjects.has(id)) state.hiddenProjects.delete(id);
    else state.hiddenProjects.add(id);
    renderAll();
  }

  function renderChart() {
    const wrap = $('tgh-chart-wrap');
    wrap.innerHTML = '';

    const byProject = {};
    state.entries.forEach(e => {
      const pid = e.project_id || 0;
      if (!byProject[pid]) byProject[pid] = [];
      byProject[pid].push(e);
    });

    const axisHTML = buildAxisHTML();

    // ── Per-project heatmaps ──
    const sortedPids = Object.keys(byProject).sort((a, b) =>
      getProject(+a).name.localeCompare(getProject(+b).name)
    );

    sortedPids.forEach(pid => {
      const numPid = +pid;
      if (state.hiddenProjects.has(numPid)) return;

      const proj    = getProject(numPid);
      const entries = byProject[pid];
      const peaks   = findPeakWindows(entries);

      // Build the label row: project name + peak badges
      const labelRow = document.createElement('div');
      labelRow.className = 'tgh-project-label-row';

      const nameEl = document.createElement('div');
      nameEl.className = 'tgh-project-label';
      nameEl.style.color = proj.color;
      nameEl.textContent = proj.name;
      labelRow.appendChild(nameEl);

      if (peaks.length) {
        const badgesEl = document.createElement('div');
        badgesEl.className = 'tgh-peak-badges';
        peaks.forEach((pk, i) => {
          const badge = document.createElement('span');
          badge.className = 'tgh-peak-badge ' + (i === 0 ? 'primary' : 'secondary');
          badge.style.borderColor = proj.color;
          badge.innerHTML =
            `${escHtml(fmtMin(pk.startMin))}–${escHtml(fmtMin(pk.endMin))}` +
            `<span class="tgh-peak-n">×${pk.count}</span>`;
          badgesEl.appendChild(badge);
        });
        labelRow.appendChild(badgesEl);
      }

      const section = document.createElement('div');
      section.className = 'tgh-project-section';
      section.appendChild(labelRow);
      section.appendChild(buildBlockRow(entries, proj.color));
      section.insertAdjacentHTML('beforeend', axisHTML);
      wrap.appendChild(section);
    });

    if (sortedPids.length && sortedPids.every(pid => state.hiddenProjects.has(+pid))) {
      const empty = document.createElement('p');
      empty.style.cssText = 'color:#6a6388;font-size:13px;margin:0;padding-top:8px';
      empty.textContent = 'All projects hidden — click a project in the sidebar to show it.';
      wrap.appendChild(empty);
    }
  }

  // ── Per-minute resolution data builder ────────────────────────────────────
  function buildHourData(entries, filterHidden) {
    const minutesInHour = new Array(24).fill(0);
    const layersInHour  = new Array(24).fill(0);

    entries.forEach(e => {
      if (filterHidden && state.hiddenProjects.has(e.project_id || 0)) return;
      const start  = new Date(e.start);
      const durSec = e.duration;
      let cursor   = start.getTime();
      const endMs  = cursor + durSec * 1000;
      const touchedHours = new Set();

      while (cursor < endMs) {
        const h          = new Date(cursor).getHours();
        const nextHourMs = new Date(cursor).setMinutes(60, 0, 0);
        const blockEnd   = Math.min(endMs, nextHourMs);
        minutesInHour[h] += (blockEnd - cursor) / 60000;
        touchedHours.add(h);
        cursor = blockEnd;
      }
      touchedHours.forEach(h => layersInHour[h]++);
    });

    return { minutesInHour, layersInHour };
  }

  // ── Block row (per-project) ────────────────────────────────────────────────
  function buildBlockRow(entries, color) {
    const { minutesInHour, layersInHour } = buildHourData(entries, false);
    const maxMins = Math.max(...minutesInHour, 1);

    const row = document.createElement('div');
    row.className = 'tgh-heatmap-row tgh-block-row';

    for (let h = 0; h < 24; h++) {
      if (!minutesInHour[h]) continue;
      const intensity = minutesInHour[h] / maxMins;

      const block = document.createElement('div');
      block.className = 'tgh-heat-block';
      block.style.cssText = `
        left: ${(h / 24) * 100}%;
        width: ${(1 / 24) * 100}%;
        background: ${color};
        opacity: ${0.08 + intensity * 0.92};
      `;
      block.dataset.hour   = h;
      block.dataset.mins   = Math.round(minutesInHour[h]);
      block.dataset.layers = layersInHour[h];

      block.addEventListener('mousemove', ev => showBlockTooltip(ev, block));
      block.addEventListener('mouseleave', () => { tooltip.style.display = 'none'; });
      row.appendChild(block);
    }

    return row;
  }

  // ── Canvas row (combined, continuous) — kept for potential reuse ───────────
  function buildCombinedCanvasRow(entries) {
    const MINS = 1440;
    const minuteData = new Array(MINS).fill(null).map(() => ({ total: 0, contrib: {} }));

    entries.forEach(e => {
      const pid = e.project_id || 0;
      if (state.hiddenProjects.has(pid)) return;
      const start  = new Date(e.start);
      const durSec = e.duration;
      let cursor   = start.getTime();
      const endMs  = cursor + durSec * 1000;

      while (cursor < endMs) {
        const d        = new Date(cursor);
        const m        = d.getHours() * 60 + d.getMinutes();
        const nextMin  = cursor + (60 - d.getSeconds()) * 1000;
        const blockEnd = Math.min(endMs, nextMin);
        const secs     = (blockEnd - cursor) / 1000;
        minuteData[m].total += secs;
        minuteData[m].contrib[pid] = (minuteData[m].contrib[pid] || 0) + secs;
        cursor = blockEnd;
      }
    });

    const sigma = 8;
    const kernelRadius = Math.ceil(sigma * 3);
    const smoothed = new Array(MINS).fill(null).map(() => ({ total: 0, contrib: {} }));
    for (let m = 0; m < MINS; m++) {
      let wSum = 0;
      for (let k = -kernelRadius; k <= kernelRadius; k++) {
        const src = ((m + k) % MINS + MINS) % MINS;
        const w   = Math.exp(-(k * k) / (2 * sigma * sigma));
        smoothed[m].total += minuteData[src].total * w;
        for (const [pid, secs] of Object.entries(minuteData[src].contrib)) {
          smoothed[m].contrib[pid] = (smoothed[m].contrib[pid] || 0) + secs * w;
        }
        wSum += w;
      }
      smoothed[m].total /= wSum;
      for (const pid of Object.keys(smoothed[m].contrib)) {
        smoothed[m].contrib[pid] /= wSum;
      }
    }

    const maxTotal = Math.max(...smoothed.map(d => d.total), 1);

    const rowWrap = document.createElement('div');
    rowWrap.className = 'tgh-heatmap-row';

    const canvas = document.createElement('canvas');
    canvas.className = 'tgh-canvas-row';
    const W = 1440, H = 88;
    canvas.width  = W;
    canvas.height = H;
    canvas.style.width  = '100%';
    canvas.style.height = '44px';

    const ctx = canvas.getContext('2d');
    ctx.fillStyle = 'rgba(255,255,255,0.04)';
    ctx.fillRect(0, 0, W, H);

    for (let m = 0; m < MINS; m++) {
      const d         = smoothed[m];
      const intensity = d.total / maxTotal;
      if (intensity < 0.005) continue;

      const x = (m / MINS) * W;
      const w = W / MINS + 0.5;

      const totalSecs = Object.values(d.contrib).reduce((a, b) => a + b, 0) || 1;
      let r = 0, g = 0, bl = 0;
      for (const [pid, secs] of Object.entries(d.contrib)) {
        const c  = hexToRgb(getProject(+pid).color);
        const wt = secs / totalSecs;
        r += c.r * wt; g += c.g * wt; bl += c.b * wt;
      }

      ctx.fillStyle = `rgba(${Math.round(r)},${Math.round(g)},${Math.round(bl)},${0.08 + intensity * 0.92})`;
      ctx.fillRect(x, 0, w, H);
    }

    ctx.strokeStyle = 'rgba(255,255,255,0.05)';
    ctx.lineWidth = 1;
    for (let h = 0; h < 24; h++) {
      const x = (h / 24) * W;
      ctx.beginPath();
      ctx.moveTo(x, 0);
      ctx.lineTo(x, H);
      ctx.stroke();
    }

    rowWrap.appendChild(canvas);

    const { minutesInHour, layersInHour } = buildHourData(entries, true);

    rowWrap.addEventListener('mousemove', ev => {
      const rect = canvas.getBoundingClientRect();
      const frac = (ev.clientX - rect.left) / rect.width;
      const h    = Math.min(23, Math.floor(frac * 24));
      showCombinedTooltip(ev, h, minutesInHour, layersInHour, entries);
    });
    rowWrap.addEventListener('mouseleave', () => { tooltip.style.display = 'none'; });

    return rowWrap;
  }

  // ── Tooltips ──────────────────────────────────────────────────────────────
  function showBlockTooltip(ev, block) {
    const h      = +block.dataset.hour;
    const mins   = +block.dataset.mins;
    const layers = +block.dataset.layers;
    const hStr   = formatHourRange(h);

    let html = `<strong>${hStr}</strong>`;
    html += `<div class="tgh-layers">${layers} session${layers !== 1 ? 's' : ''} in this hour</div>`;
    html += formatMins(mins) + ' total';

    tooltip.innerHTML = html;
    tooltip.style.display = 'block';
    positionTooltip(ev);
  }

  function showCombinedTooltip(ev, h, minutesInHour, layersInHour, entries) {
    const mins   = Math.round(minutesInHour[h]);
    const layers = layersInHour[h];
    const hStr   = formatHourRange(h);

    let html = `<strong>${hStr}</strong>`;
    html += `<div class="tgh-layers">${layers} session${layers !== 1 ? 's' : ''} in this hour</div>`;
    if (mins > 0) html += formatMins(mins) + ' total';

    const proj24 = {};
    entries.forEach(e => {
      const pid = e.project_id || 0;
      if (state.hiddenProjects.has(pid)) return;
      const start = new Date(e.start);
      let cursor  = start.getTime();
      const endMs = cursor + e.duration * 1000;
      while (cursor < endMs) {
        const eh   = new Date(cursor).getHours();
        const next = new Date(cursor).setMinutes(60, 0, 0);
        const be   = Math.min(endMs, next);
        if (eh === h) proj24[pid] = (proj24[pid] || 0) + (be - cursor) / 60000;
        cursor = be;
      }
    });

    const sorted = Object.entries(proj24).sort((a, b) => b[1] - a[1]).slice(0, 5);
    if (sorted.length) {
      html += '<br>';
      sorted.forEach(([pid, m]) => {
        const p = getProject(+pid);
        html += `<span style="color:${p.color}">■</span> ${escHtml(p.name)}: ${formatMins(m)}<br>`;
      });
    }

    tooltip.innerHTML = html;
    tooltip.style.display = 'block';
    positionTooltip(ev);
  }

  function positionTooltip(ev) {
    const tw = tooltip.offsetWidth  || 200;
    const th = tooltip.offsetHeight || 80;
    let left = ev.clientX + 14;
    let top  = ev.clientY - 10;
    if (left + tw > window.innerWidth  - 8) left = ev.clientX - tw - 14;
    if (top  + th > window.innerHeight - 8) top  = ev.clientY - th - 10;
    tooltip.style.left = left + 'px';
    tooltip.style.top  = top  + 'px';
  }

  // ─── Axis ─────────────────────────────────────────────────────────────────
  function buildAxisHTML() {
    const ticks = Array.from({ length: 25 }, (_, i) => {
      const label = i % 6 === 0 ? formatHour12(i % 24) : '';
      return `<div class="tgh-hour-tick">${label}</div>`;
    }).join('');
    return `<div class="tgh-hour-axis">${ticks}</div>`;
  }

  // ─── Time formatting ──────────────────────────────────────────────────────
  function formatHour12(h) {
    if (h === 0)  return '12am';
    if (h === 12) return '12pm';
    return h < 12 ? `${h}am` : `${h - 12}pm`;
  }

  function fmt12(h, m) {
    const suffix = h < 12 ? 'am' : 'pm';
    const h12    = h === 0 ? 12 : h > 12 ? h - 12 : h;
    return m === 0 ? `${h12}${suffix}` : `${h12}:${String(m).padStart(2,'0')}${suffix}`;
  }

  function fmtMin(totalMins) {
    const m = Math.round(totalMins) % 1440;
    return fmt12(Math.floor(m / 60), m % 60);
  }

  function formatHourRange(h) {
    return `${formatHour12(h)} – ${formatHour12((h + 1) % 24)}`;
  }

  function formatMins(m) {
    if (m < 60) return `${Math.round(m)}m`;
    return `${Math.floor(m / 60)}h ${Math.round(m % 60)}m`;
  }

  // ─── Utilities ────────────────────────────────────────────────────────────
  function showLoading() {
    $('tgh-chart-wrap').innerHTML = `
      <div id="tgh-loading">
        <div class="tgh-spinner"></div>
        Fetching your time entries…
      </div>`;
    $('tgh-project-list').innerHTML = '';
  }

  function showError(msg) {
    $('tgh-chart-wrap').innerHTML = '';
    const err = $('tgh-error') || document.createElement('div');
    err.id = 'tgh-error';
    err.style.display = 'block';
    err.textContent = `Error loading data: ${msg}. Make sure you're logged in to Toggl Track.`;
    $('tgh-controls').appendChild(err);
  }

  let _pidColorCounter = 0;
  const _pidColorCache = {};
  function getProject(pid) {
    if (state.projects[pid]) return state.projects[pid];
    if (pid === 0 || pid == null) return { name: 'No project', color: '#5a5278' };
    if (!_pidColorCache[pid]) {
      _pidColorCache[pid] = { name: `Project ${pid}`, color: PALETTE[(_pidColorCounter++) % PALETTE.length] };
    }
    return _pidColorCache[pid];
  }

  function hexToRgb(hex) {
    const h = hex.replace('#', '');
    if (h.length === 3) {
      return { r: parseInt(h[0]+h[0],16), g: parseInt(h[1]+h[1],16), b: parseInt(h[2]+h[2],16) };
    }
    return { r: parseInt(h.slice(0,2),16), g: parseInt(h.slice(2,4),16), b: parseInt(h.slice(4,6),16) };
  }

  function escHtml(s) {
    return String(s).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');
  }

})();
