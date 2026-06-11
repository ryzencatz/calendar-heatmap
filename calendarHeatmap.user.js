// ==UserScript==
// @name         calendarHeatmap
// @namespace    http://tampermonkey.net/
// @version      1.0.0
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
  const DAYS_BACK = 90; // how many days of history to pull

  // Palette — up to 20 distinct project colors (HSL spaced)
  const PALETTE = [
    '#e05c5c','#e08c5c','#e0c45c','#9de05c','#5ce07a',
    '#5ce0c4','#5cb4e0','#5c7ae0','#8c5ce0','#c45ce0',
    '#e05ca8','#b44040','#40a0b4','#6040b4','#40b460',
    '#b4a040','#4060b4','#b44080','#40b4a0','#80b440',
  ];

  // ─── Styles ───────────────────────────────────────────────────────────────
  GM_addStyle(`
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
      background: #1a1625;
      border-radius: 16px;
      border: 1px solid rgba(255,255,255,.08);
      box-shadow: 0 24px 80px rgba(0,0,0,.6);
      width: min(1080px, 96vw);
      max-height: 90vh;
      overflow: hidden;
      display: flex;
      flex-direction: column;
      font-family: 'Inter', system-ui, sans-serif;
      color: #e2dff0;
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
      font-weight: 700;
      color: #fff;
      letter-spacing: -.2px;
    }
    #tgh-header span { font-size: 12px; color: #8a83a8; font-weight: 400; margin-left: 10px; }

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
      border-bottom: 1px solid rgba(255,255,255,.07);
      flex-shrink: 0;
      flex-wrap: wrap;
    }
    #tgh-controls label { font-size: 12px; color: #8a83a8; }
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
      border-right: 1px solid rgba(255,255,255,.07);
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
    .tgh-project-label {
      font-size: 11px;
      font-weight: 600;
      text-transform: uppercase;
      letter-spacing: .7px;
    }

    .tgh-heatmap-row {
      position: relative;
      height: 44px;
      background: rgba(255,255,255,.04);
      border-radius: 8px;
      overflow: hidden;
    }
    /* Hour grid lines */
    .tgh-heatmap-row::before {
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
      max-width: 200px;
    }
    .tgh-tooltip strong { display: block; font-size: 13px; margin-bottom: 2px; }

    /* Combined heatmap */
    #tgh-combined-wrap { margin-bottom: 8px; }
    .tgh-combined-label {
      font-size: 12px;
      color: #8a83a8;
      margin-bottom: 6px;
      font-weight: 500;
    }
  `);

  // ─── State ────────────────────────────────────────────────────────────────
  let state = {
    entries: [],          // raw time entries
    projects: {},         // id -> { name, color }
    hiddenProjects: new Set(),
    loading: false,
    daysBack: DAYS_BACK,
    workspaceId: null,
  };

  // ─── DOM ──────────────────────────────────────────────────────────────────
  const btn = document.createElement('button');
  btn.id = 'tgh-btn';
  btn.textContent = '⬡ Heatmap';
  document.body.appendChild(btn);

  const panel = document.createElement('div');
  panel.id = 'tgh-panel';
  panel.innerHTML = `
    <div id="tgh-modal">
      <div id="tgh-header">
        <div>
          <h2>Daily Time Heatmap</h2>
          <span id="tgh-subtitle">Loading…</span>
        </div>
        <button id="tgh-close">✕</button>
      </div>
      <div id="tgh-controls">
        <label>Past
          <select id="tgh-days">
            <option value="30">30 days</option>
            <option value="60">60 days</option>
            <option value="90" selected>90 days</option>
            <option value="180">180 days</option>
            <option value="365">1 year</option>
          </select>
        </label>
        <button id="tgh-reload">Reload data</button>
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

  const $  = id => document.getElementById(id);
  const tooltip = $('tgh-tooltip');

  // ─── Open / Close ─────────────────────────────────────────────────────────
  btn.addEventListener('click', () => {
    panel.classList.add('open');
    if (!state.entries.length && !state.loading) loadData();
  });
  $('tgh-close').addEventListener('click', () => panel.classList.remove('open'));
  panel.addEventListener('click', e => { if (e.target === panel) panel.classList.remove('open'); });

  $('tgh-reload').addEventListener('click', () => loadData());
  $('tgh-days').addEventListener('change', e => {
    state.daysBack = +e.target.value;
    loadData();
  });

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
      // 1. Get current user + workspace
      const me = await apiFetch('/me');
      state.workspaceId = me.default_workspace_id;

      // 2. Fetch projects for workspace
      const projects = await apiFetch(`/workspaces/${state.workspaceId}/projects?per_page=200&active=both`);
      state.projects = {};
      if (Array.isArray(projects)) {
        projects.forEach((p, i) => {
          state.projects[p.id] = {
            name: p.name,
            color: p.color || PALETTE[i % PALETTE.length],
          };
        });
      }

      // 3. Fetch time entries (paginated by date range)
      const endDate   = new Date();
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

  // ─── Render ───────────────────────────────────────────────────────────────
  function renderAll() {
    renderSidebar();
    renderChart();
  }

  function renderSidebar() {
    const list = $('tgh-project-list');
    list.innerHTML = '';

    // Collect all project ids that appear in entries
    const usedIds = new Set(state.entries.map(e => e.project_id || 0));

    // "No project" pseudo-entry
    if (usedIds.has(0) || usedIds.has(null) || usedIds.has(undefined)) {
      usedIds.add(0);
    }

    [...usedIds].sort((a, b) => {
      const na = getProject(a).name;
      const nb = getProject(b).name;
      return na.localeCompare(nb);
    }).forEach(id => {
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

    // Group entries by project
    const byProject = {};
    state.entries.forEach(e => {
      const pid = e.project_id || 0;
      if (!byProject[pid]) byProject[pid] = [];
      byProject[pid].push(e);
    });

    // Hour axis (shared)
    const axisHTML = buildAxisHTML();

    // ── Combined heatmap ──
    const combinedSection = document.createElement('div');
    combinedSection.id = 'tgh-combined-wrap';
    combinedSection.innerHTML = `<div class="tgh-combined-label">All projects combined</div>`;
    const combinedRow = buildHeatmapRow(state.entries, null, true);
    combinedSection.appendChild(combinedRow);
    combinedSection.insertAdjacentHTML('beforeend', axisHTML);
    wrap.appendChild(combinedSection);

    // ── Per-project heatmaps ──
    const sortedPids = Object.keys(byProject).sort((a, b) =>
      getProject(+a).name.localeCompare(getProject(+b).name)
    );

    sortedPids.forEach(pid => {
      const numPid = +pid;
      if (state.hiddenProjects.has(numPid)) return;

      const proj = getProject(numPid);
      const entries = byProject[pid];

      const section = document.createElement('div');
      section.className = 'tgh-project-section';
      section.innerHTML = `<div class="tgh-project-label" style="color:${proj.color}">${escHtml(proj.name)}</div>`;
      const row = buildHeatmapRow(entries, proj.color, false);
      section.appendChild(row);
      section.insertAdjacentHTML('beforeend', axisHTML);
      wrap.appendChild(section);
    });

    if (sortedPids.every(pid => state.hiddenProjects.has(+pid))) {
      const empty = document.createElement('p');
      empty.style.cssText = 'color:#6a6388;font-size:13px;margin:0;padding-top:8px';
      empty.textContent = 'All projects hidden — click a project in the sidebar to show it.';
      wrap.appendChild(empty);
    }
  }

  function buildHeatmapRow(entries, color, isCombined) {
    // Build 24×1 minute-resolution map
    // minutes[h] = total minutes spent in that hour bucket across all entries
    const minutesInHour = new Array(24).fill(0);

    entries.forEach(e => {
      if (isCombined && state.hiddenProjects.has(e.project_id || 0)) return;
      const start  = new Date(e.start);
      const durSec = e.duration; // seconds
      let cursor   = start.getTime();
      const endMs  = cursor + durSec * 1000;

      while (cursor < endMs) {
        const h   = new Date(cursor).getHours();
        const nextHourMs = new Date(cursor).setMinutes(60, 0, 0);
        const blockEnd   = Math.min(endMs, nextHourMs);
        minutesInHour[h] += (blockEnd - cursor) / 60000;
        cursor = blockEnd;
      }
    });

    const maxMins = Math.max(...minutesInHour, 1);

    const row = document.createElement('div');
    row.className = 'tgh-heatmap-row';

    for (let h = 0; h < 24; h++) {
      if (!minutesInHour[h]) continue;
      const intensity = minutesInHour[h] / maxMins;
      const left  = (h / 24) * 100;
      const width = (1 / 24) * 100;

      const block = document.createElement('div');
      block.className = 'tgh-heat-block';
      block.style.cssText = `
        left: ${left}%;
        width: ${width}%;
        background: ${isCombined ? buildCombinedColor(h, entries, intensity) : color};
        opacity: ${0.08 + intensity * 0.92};
      `;
      block.dataset.hour = h;
      block.dataset.mins = Math.round(minutesInHour[h]);

      // Tooltip
      block.addEventListener('mousemove', e => showTooltip(e, block, isCombined, entries));
      block.addEventListener('mouseleave', () => { tooltip.style.display = 'none'; });

      row.appendChild(block);
    }

    return row;
  }

  function buildCombinedColor(h, entries, intensity) {
    // Mix project colors weighted by minutes in this hour
    const contrib = {};
    entries.forEach(e => {
      const pid = e.project_id || 0;
      if (state.hiddenProjects.has(pid)) return;
      const start  = new Date(e.start);
      const durSec = e.duration;
      let cursor   = start.getTime();
      const endMs  = cursor + durSec * 1000;
      while (cursor < endMs) {
        const eh = new Date(cursor).getHours();
        const nextHourMs = new Date(cursor).setMinutes(60, 0, 0);
        const blockEnd   = Math.min(endMs, nextHourMs);
        if (eh === h) {
          contrib[pid] = (contrib[pid] || 0) + (blockEnd - cursor) / 60000;
        }
        cursor = blockEnd;
      }
    });

    const total = Object.values(contrib).reduce((a, b) => a + b, 0) || 1;
    let r = 0, g = 0, b = 0;
    Object.entries(contrib).forEach(([pid, mins]) => {
      const c = hexToRgb(getProject(+pid).color);
      const w = mins / total;
      r += c.r * w; g += c.g * w; b += c.b * w;
    });
    return `rgb(${Math.round(r)},${Math.round(g)},${Math.round(b)})`;
  }

  function showTooltip(e, block, isCombined, entries) {
    const h    = +block.dataset.hour;
    const mins = +block.dataset.mins;
    const hStr = `${String(h).padStart(2,'0')}:00 – ${String(h+1).padStart(2,'0')}:00`;
    const dur  = formatMins(mins);

    let html = `<strong>${hStr}</strong>${dur} total`;

    if (isCombined) {
      // Show per-project breakdown
      const proj24 = {};
      entries.forEach(e => {
        const pid = e.project_id || 0;
        if (state.hiddenProjects.has(pid)) return;
        const start = new Date(e.start);
        let cursor  = start.getTime();
        const endMs = cursor + e.duration * 1000;
        while (cursor < endMs) {
          const eh = new Date(cursor).getHours();
          const next = new Date(cursor).setMinutes(60,0,0);
          const be   = Math.min(endMs, next);
          if (eh === h) proj24[pid] = (proj24[pid]||0) + (be - cursor)/60000;
          cursor = be;
        }
      });
      const sorted = Object.entries(proj24).sort((a,b)=>b[1]-a[1]).slice(0,5);
      if (sorted.length) {
        html += '<br><br>';
        sorted.forEach(([pid, m]) => {
          const p = getProject(+pid);
          html += `<span style="color:${p.color}">■</span> ${escHtml(p.name)}: ${formatMins(m)}<br>`;
        });
      }
    }

    tooltip.innerHTML = html;
    tooltip.style.display = 'block';
    tooltip.style.left = (e.clientX + 14) + 'px';
    tooltip.style.top  = (e.clientY - 10) + 'px';
  }

  function buildAxisHTML() {
    const ticks = Array.from({length: 25}, (_, i) => {
      const label = i % 6 === 0 ? `${String(i).padStart(2,'0')}` : '';
      return `<div class="tgh-hour-tick">${label}</div>`;
    }).join('');
    return `<div class="tgh-hour-axis">${ticks}</div>`;
  }

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

  // ─── Utilities ────────────────────────────────────────────────────────────
  let _pidColorCounter = 0;
  const _pidColorCache = {};
  function getProject(pid) {
    if (state.projects[pid]) return state.projects[pid];
    if (pid === 0 || pid == null) {
      return { name: 'No project', color: '#5a5278' };
    }
    // Unknown project (e.g., deleted)
    if (!_pidColorCache[pid]) {
      _pidColorCache[pid] = { name: `Project ${pid}`, color: PALETTE[(_pidColorCounter++) % PALETTE.length] };
    }
    return _pidColorCache[pid];
  }

  function formatMins(m) {
    if (m < 60) return `${Math.round(m)}m`;
    return `${Math.floor(m/60)}h ${Math.round(m%60)}m`;
  }

  function hexToRgb(hex) {
    const h = hex.replace('#','');
    if (h.length === 3) {
      return { r: parseInt(h[0]+h[0],16), g: parseInt(h[1]+h[1],16), b: parseInt(h[2]+h[2],16) };
    }
    return { r: parseInt(h.slice(0,2),16), g: parseInt(h.slice(2,4),16), b: parseInt(h.slice(4,6),16) };
  }

  function escHtml(s) {
    return String(s).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');
  }

})();
