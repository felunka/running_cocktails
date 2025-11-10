import { Compressor } from './compressor.js';

// Parses URL parameter `data` (url-encoded JSON) and renders a travel plan timeline
// Assumptions: the JSON has the format provided in the example. We focus on rendering
// `event.groupToDisplay.routeSteps` as a timeline. For each route step we show header
// with start/end addresses, times, duration, distance, hostGroup info, a Google Maps
// link for start and end, and an expandable list of step instructions.

(function () {
  'use strict';

  // Utility: get URL parameter by name
  function getQueryParam(name) {
    const params = new URLSearchParams(window.location.search);
    return params.get(name);
  }

  // Safe JSON parse with try/catch
  async function parseDataParam() {
    const raw = getQueryParam('data');
    if (!raw) return null;
    try {
      // The parameter is expected to be URL-encoded JSON. decodeURIComponent once.
      const decoded = decodeURIComponent(raw);
      const decompressed = await Compressor.decode(decoded);
      return JSON.parse(decompressed);
    } catch (e) {
      console.error('Failed to parse data param', e);
      return null;
    }
  }

  // Normalize compact short-key payloads to the full structure expected by the renderer.
  // Accepts both compact (s,e,t,g:{m:members,r:routeSteps}) and full payloads.
  function normalizeCompactPlan(payload) {
    if (!payload) return payload;

    // If payload already looks like the expanded form (has groupToDisplay), return as-is
    if (payload.groupToDisplay) return payload;

    const MAPS_PREFIX = 'https://maps.gstatic.com/mapfiles/transit';

    const expandMember = (m) => ({
      name: m.n || m.name || null,
      address: m.a || m.address || null,
      isHost: !!(m.h || m.isHost)
    });

    const expandVehicle = (v) => {
      if (!v) return null;
      // v.li may be the shortened local_icon path (starting with '/iw2/...') or the suffix
      let local_icon = v.li || v.local_icon || null;
      if (local_icon && !local_icon.startsWith('http')) {
        // restore full URL
        if (local_icon.startsWith('/')) local_icon = MAPS_PREFIX + local_icon;
        else local_icon = MAPS_PREFIX + local_icon;
      }

      return {
        icon: v.i || v.icon || null,
        local_icon: local_icon,
        name: v.n || v.name || null,
        type: v.t || v.type || null
      };
    };

    const expandLine = (l) => {
      if (!l) return null;
      return {
        color: l.c || l.color || null,
        name: l.n || l.name || null,
        short_name: l.s || l.short_name || null,
        vehicle: expandVehicle(l.v || l.vehicle)
      };
    };

    const expandTransit = (t) => {
      if (!t) return {};
      return {
        arrival_stop: t.as || t.arrival_stop || null,
        departure_stop: t.ds || t.departure_stop || null,
        departure_time: t.dt || t.departure_time || null,
        arrival_time: t.at || t.arrival_time || null,
        headsign: t.h || t.headsign || null,
        line: expandLine(t.l || t.line),
        num_stops: t.n || t.num_stops || null
      };
    };

    const expandStep = (s) => ({
      travelMode: s.m || s.travelMode || null,
      instructions: s.i || s.instructions || null,
      distance: s.d || s.distance || null,
      duration: s.du || s.duration || null,
      transit: expandTransit(s.tr || s.transit || {})
    });

    const expandHostGroup = (hg) => {
      if (!hg) return null;
      return {
        hostName: hg.hn || hg.hostName || null,
        hostGroupMembers: hg.hm || hg.hostGroupMembers || null
      };
    };

    const expandRouteStep = (rs) => {
      return {
        overallMode: rs.o || rs.overallMode || null,
        totalTime: rs.tt || rs.totalTime || null,
        startAddress: rs.sa || rs.startAddress || null,
        endAddress: rs.ea || rs.endAddress || null,
        departureTime: rs.dt || rs.departureTime || null,
        arrivalTime: rs.at || rs.arrivalTime || null,
        distance: rs.d || rs.distance || null,
        steps: (rs.s || rs.steps || []).map(expandStep),
        hostGroup: expandHostGroup(rs.hg || rs.hostGroup)
      };
    };

    const expanded = {
      groupToDisplay: {
        members: (payload.g && (payload.g.m || payload.g.members) ? (payload.g.m || payload.g.members) : (payload.members || [])).map(expandMember),
        routeSteps: (payload.g && (payload.g.r || payload.g.routeSteps) ? (payload.g.r || payload.g.routeSteps) : (payload.routeSteps || [])).map(expandRouteStep)
      }
    };

    return expanded;
  }

  // Create an anchor to Google Maps directions for start->end
  function mapsLink(start, end) {
    const base = 'https://www.google.com/maps/dir/?api=1';
    const params = new URLSearchParams({
      origin: start || '',
      destination: end || '',
      travelmode: 'transit'
    });
    return base + '&' + params.toString();
  }

  // Create DOM helpers
  function el(tag, cls, text) {
    const d = document.createElement(tag);
    if (cls) d.className = cls;
    if (text !== undefined && text !== null) d.textContent = text;
    return d;
  }

  function htmlEl(tag, cls, html) {
    const d = document.createElement(tag);
    if (cls) d.className = cls;
    if (html !== undefined && html !== null) d.innerHTML = html;
    return d;
  }

  // Render a single route step
  function renderRouteStep(step, index) {
    // We'll render each route step as a collapsible accordion item with a dot on the left
    const outer = el('div', 'mb-3 position-relative');

    // Left timeline dot
    const dot = el('div', 'timeline-dot');

    outer.appendChild(dot);

    const id = `collapse-step-${index}`;
    const card = el('div', 'card');

    // Title should focus on group being visited first (hostGroup) and then the addresses
    const header = el('div', 'card-header p-0');
    const btn = el('button', 'btn btn-light w-100 text-start d-flex justify-content-between align-items-center');
    btn.type = 'button';
    btn.setAttribute('data-bs-toggle', 'collapse');
    btn.setAttribute('data-bs-target', `#${id}`);
    btn.setAttribute('aria-expanded', 'false');
    btn.setAttribute('aria-controls', id);

    const left = el('div', '');
    const groupName = step.hostGroup && step.hostGroup.hostName ? step.hostGroup.hostName : 'Group';
    const groupMembers = step.hostGroup && step.hostGroup.hostGroupMembers ? `${step.hostGroup.hostGroupMembers}` : '';
    const title = el('div', 'fw-semibold', `Team ${groupName} (${groupMembers})`);

    const subtitle = el('div', 'small text-muted', `${step.startAddress} → ${step.endAddress}`);

    left.appendChild(title);
    left.appendChild(subtitle);

    const right = el('div', 'text-end small text-muted');
    const times = [];
    if (step.departureTime) times.push(`Dep ${step.departureTime}`);
    if (step.arrivalTime) times.push(`Arr ${step.arrivalTime}`);
    if (step.totalTime) times.push(step.totalTime);
    if (step.distance) times.push(step.distance);
    right.textContent = times[0];

    btn.appendChild(left);
    btn.appendChild(right);
    header.appendChild(btn);
    card.appendChild(header);

    const bodyCollapse = el('div', 'collapse');
    bodyCollapse.id = id;

    const body = el('div', 'card-body');

    // Maps link
    const mapsStart = el('a', 'btn btn-sm btn-outline-primary mb-2');
    mapsStart.href = mapsLink(step.startAddress, step.endAddress);
    mapsStart.target = '_blank';
    mapsStart.rel = 'noopener noreferrer';
    mapsStart.textContent = 'Open directions';
    body.appendChild(mapsStart);

    const timesDisplay = el('div', 'small text-muted');
    timesDisplay.textContent = times.join(' • ');
    body.appendChild(timesDisplay);

    // Steps list
    const stepsWrapper = el('div', 'list-group list-group-flush');
    if (Array.isArray(step.steps)) {
      step.steps.forEach((s, i) => {
        const item = el('div', 'list-group-item d-flex px-0');

        const stepTimes = [];
        if (s.transit && s.transit.departure_time) stepTimes.push(`Dep ${s.transit.departure_time}`);
        if (s.transit && s.transit.arrival_time) stepTimes.push(`Arr ${s.transit.arrival_time}`);
        if (s.duration) stepTimes.push(s.duration);
        if (s.distance) stepTimes.push(s.distance);

        // Emoji mode
        const emoji = s.travelMode === 'WALKING' ? '🚶' : (s.travelMode === 'TRANSIT' ? '🚆' : '➜');
        const leftCol = el('div', 'me-1 text-center');

        // Always show an emoji in the left column (transit legs use 🚆)
        leftCol.appendChild(el('div', '', emoji));

        const content = el('div', 'flex-grow-1');
        const instr = htmlEl('div', 'mb-1', `<strong>${escapeHtml(s.travelMode === 'WALKING' ? '' : (s.travelMode === 'TRANSIT' ? (s.transit && s.transit.line && (s.transit.line.name || s.transit.line.short_name) ? escapeHtml(s.transit.line.short_name || s.transit.line.name) : 'Transit') : escapeHtml(s.travelMode)))}</strong> ${escapeHtml(s.instructions || '')}`);
        const small = el('small', 'text-muted', `${stepTimes.join(' • ')}`);
        content.appendChild(instr);
        content.appendChild(small);

        // Transit details and colored badge
        if (s.transit && Object.keys(s.transit).length) {
          const t = s.transit;
          const tdiv = el('div', 'small text-secondary mt-2 d-flex align-items-center');
          const parts = [];
          if (t.departure_stop) parts.push(`From: ${escapeHtml(t.departure_stop)}`);
          if (t.arrival_stop) parts.push(`To: ${escapeHtml(t.arrival_stop)}`);
          if (t.headsign) parts.push(`Headsign: ${escapeHtml(t.headsign)}`);
          tdiv.textContent = parts.join(' • ');

          // badge for line
          if (t.line && (t.line.name || t.line.short_name)) {
            const badgeWrap = el('span', 'd-inline-flex align-items-center ms-2');

            // append local_icon next to the badge when available
            if (t.line.vehicle && t.line.vehicle.local_icon) {
              const icon = document.createElement('img');
              icon.src = t.line.vehicle.local_icon;
              icon.alt = t.line.vehicle.name || 'transit';
              icon.style.width = '20px';
              icon.style.height = '20px';
              icon.style.objectFit = 'contain';
              badgeWrap.appendChild(icon);
            }

            const badge = el('span', 'badge ml-2');
            badge.textContent = t.line.short_name || t.line.name;
            if (t.line.color) {
              badge.style.background = t.line.color;
              badge.style.color = '#fff';
            }
            badgeWrap.appendChild(badge);

            tdiv.appendChild(badgeWrap);
          }

          content.appendChild(tdiv);
        }

        item.appendChild(leftCol);
        item.appendChild(content);
        stepsWrapper.appendChild(item);
      });
    } else {
      stepsWrapper.appendChild(el('div', '', 'No steps available'));
    }

    body.appendChild(stepsWrapper);
    bodyCollapse.appendChild(body);
    card.appendChild(bodyCollapse);

    outer.appendChild(card);

    return outer;
  }

  // Very small escape helper for injection-prone parts that we sometimes set as innerHTML
  function escapeHtml(str) {
    if (!str) return '';
    return String(str).replace(/[&<>\"]/g, function (tag) {
      const charsToReplace = {
        '&': '&amp;',
        '<': '&lt;',
        '>': '&gt;',
        '\\': '&#92;',
        '"': '&quot;'
      };
      return charsToReplace[tag] || tag;
    });
  }

  function render(root, data) {
    root.innerHTML = '';

    if (!data || !data.groupToDisplay) {
      root.appendChild(el('div', 'alert alert-warning', 'No plan data found in URL parameter data.'));
      return;
    }

    const ev = data;
    const g = ev.groupToDisplay;
    g.host = g.members.find((r) => r.isHost);

    // populate existing top card
    const titleEl = document.getElementById('group-card-title');
    const bodyEl = document.getElementById('group-card-body');
    if (titleEl) titleEl.textContent = g.host && g.host.name ? `Team ${g.host.name}` : 'Group';
    if (bodyEl) {
      const memberNames = (g.members || []).map(m => m.name + (m.isHost ? ' (host)' : '')).join(', ');
      bodyEl.textContent = `Members: ${memberNames}`;
    }

    // Timeline
    const timeline = el('div', 'timeline');
    if (!Array.isArray(g.routeSteps) || g.routeSteps.length === 0) {
      root.appendChild(el('div', 'alert alert-info', 'Route is empty'));
      return;
    }

    g.routeSteps.forEach((step, idx) => {
      const stepEl = renderRouteStep(step, idx);
      timeline.appendChild(stepEl);
    });

    root.appendChild(timeline);
  }

  // Mount
  async function mount() {
    const root = document.getElementById('group-plan-root');
    if (!root) return;

    const data = await parseDataParam();
    if (!data) {
      root.appendChild(el('div', 'alert alert-danger', 'Could not parse `data` URL parameter. Make sure it is urlencoded JSON.'));
      return;
    }

    // Normalize compact payloads (short keys) into the full shape the renderer expects.
    const normalized = normalizeCompactPlan(data);

    // Render using normalized data
    render(root, normalized);
  }

  // Auto-run on DOMContentLoaded
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', mount);
  } else {
    mount();
  }
})();
