import { Compressor } from './compressor.js';
import { RunningEvent } from './running_event.js';
import NFCHandler from './nfc_handler.js';

export class ResultsRenderer {
  constructor(container) {
    if (typeof container === 'string') {
      this.container = document.querySelector(container);
    } else {
      this.container = container;
    }
    if (!this.container) throw new Error('ResultsRenderer: container element not found');

    this.cacheKey = 'result_cache';
    this.set(this.load());
  }

  load() {
    const data = localStorage.getItem(this.cacheKey);
    if(!data) {
      return [];
    }
    const result = JSON.parse(data).map(r => {
      const event = new RunningEvent(
        r.event.startAddress,
        r.event.endAddress,
        "",
        "",
        r.event.timePerStop,
        r.event.noOfGroups,
        r.event.runners
      );
      event.fromJSON(r.event);
      return {
        totalTime: r.totalTime,
        event: event
      }
    });
    return result;
  }

  save(results = []) {
    localStorage.setItem(this.cacheKey, JSON.stringify(results.map(r => {
      return {
        totalTime: r.totalTime,
        event: r.event.toJSON()
      }
    })));
  }

  set(results = []) {
    this.save(results);
    // Clear container
    this.container.innerHTML = '';

    if (!Array.isArray(results) || results.length === 0) {
      this.container.innerHTML = '<div class="text-muted">No results</div>';
      return;
    }
    results.forEach((res, idx) => {
      // Outer card for each result
      const card = document.createElement('div');
      card.className = 'card mb-3 shadow-sm';

      const cardHeader = document.createElement('div');
      cardHeader.className = 'card-header d-flex justify-content-between align-items-center';

      const title = document.createElement('div');
      title.innerHTML = `<strong>Result ${idx + 1}</strong>`;

      const badge = document.createElement('span');
      badge.className = 'badge bg-primary';
      badge.textContent = `Total: ${Math.round(res.totalTime/60)} min`;

      cardHeader.appendChild(title);
      cardHeader.appendChild(badge);

      const cardBody = document.createElement('div');
      cardBody.className = 'card-body';

      // Event title / summary
      const summary = document.createElement('p');
      summary.className = 'card-text text-muted mb-3';
      summary.textContent = `Start: ${res.event ? (res.event.startAddress || '-') : '-'} - End: ${res.event ? (res.event.endAddress || '-') : '-'}`;

      cardBody.appendChild(summary);

      // Groups list
      const groupsContainer = document.createElement('div');
      groupsContainer.className = 'accordion';

      (res.event && Array.isArray(res.event.groups) ? res.event.groups : []).forEach((group, gIdx) => {
        const groupId = `result-${idx}-group-${gIdx}`;

        const item = document.createElement('div');
        item.className = 'accordion-item';

        const header = document.createElement('h2');
        header.className = 'accordion-header';

        const button = document.createElement('button');
        button.className = 'accordion-button collapsed';
        button.type = 'button';
        button.setAttribute('data-bs-toggle', 'collapse');
        button.setAttribute('data-bs-target', `#${groupId}`);
        button.setAttribute('aria-expanded', 'false');
        button.setAttribute('aria-controls', groupId);

        const hostName = group.getHost ? (group.getHost() ? group.getHost().name : '-') : '-';
        const membersList = Array.isArray(group.members) ? group.members.map(m => m.name).join(', ') : '';
        const groupTotal = (group.getTotalTravelTime && typeof group.getTotalTravelTime === 'function') ? group.getTotalTravelTime() : -1;

        button.innerHTML = `<div class="w-100 d-flex justify-content-between align-items-center">
            <div><strong>Group ${gIdx}</strong> - Host: ${hostName}<br><small class="text-muted">Members: ${membersList}</small></div>
            <div><span class="badge bg-secondary">Group travel: ${groupTotal >= 0 ? Math.round(groupTotal/60) + ' min' : '-'}</span></div>
          </div>`;

        header.appendChild(button);

        const collapse = document.createElement('div');
        collapse.id = groupId;
        collapse.className = 'accordion-collapse collapse';
        collapse.setAttribute('data-bs-parent', `#${groupId}`);

        const body = document.createElement('div');
        body.className = 'accordion-body';

        // Route as ordered list
        const routeTitle = document.createElement('h6');
        routeTitle.textContent = 'Route';
        routeTitle.className = 'mb-2';

        const routeList = document.createElement('ol');
        routeList.className = 'mb-0';

        (Array.isArray(group.route) ? group.route : []).forEach(routeStop => {
          const li = document.createElement('li');
          const host = routeStop.getHost ? routeStop.getHost() : null;
          const hostName = host ? host.name : '-';
          const hostAddr = host ? host.address : '-';
          li.textContent = `${hostName} (${hostAddr})`;
          routeList.appendChild(li);
        });

        const groupLink = document.createElement('a');
        groupLink.textContent = 'Open group page';
        groupLink.target = '_blank';
        groupLink.className = 'me-2';

        // Create NFC write link next to the group link
        const nfcLink = document.createElement('a');
        nfcLink.textContent = 'Write to NFC';
        nfcLink.href = '#';
        nfcLink.setAttribute('role', 'button');
        nfcLink.className = 'ms-2';

        // Determine support synchronously (NFCHandler.isWriteSupported returns boolean)
        const canWriteNfc = (typeof NFCHandler !== 'undefined' && typeof NFCHandler.isWriteSupported === 'function') ? NFCHandler.isWriteSupported() : false;
        if (!canWriteNfc) {
          // visually and functionally disable the link
          nfcLink.classList.add('disabled');
          nfcLink.setAttribute('aria-disabled', 'true');
          nfcLink.title = 'NFC writing not supported in this browser';
        } else {
          nfcLink.addEventListener('click', async (e) => {
            e.preventDefault();
            const targetUrl = groupLink.href;
            if (!targetUrl) {
              // href not ready yet
              alert('Link not ready yet, try again in a moment');
              return;
            }

            // Provide basic UX feedback
            const previousText = nfcLink.textContent;
            try {
              nfcLink.classList.add('disabled');
              nfcLink.setAttribute('aria-disabled', 'true');
              nfcLink.textContent = 'Writing...';
              await NFCHandler.writeTag(targetUrl);
              nfcLink.textContent = 'Written';
              setTimeout(() => { nfcLink.textContent = previousText; nfcLink.classList.remove('disabled'); nfcLink.removeAttribute('aria-disabled'); }, 1500);
            } catch (err) {
              console.error('NFC write failed', err);
              alert('Failed to write NFC tag: ' + (err && err.message ? err.message : err));
              nfcLink.textContent = previousText;
              nfcLink.classList.remove('disabled');
              nfcLink.removeAttribute('aria-disabled');
            }
          });
        }

        // When the mini-plan URL is ready, set both links' hrefs
        Compressor.encode(group.toMiniPlanJSON(res.event)).then(data => {
          groupLink.href = `./runner.html?data=${data}`;
        });

        body.appendChild(routeTitle);
        body.appendChild(routeList);
        body.appendChild(groupLink);
        body.appendChild(nfcLink);

        collapse.appendChild(body);

        item.appendChild(header);
        item.appendChild(collapse);

        groupsContainer.appendChild(item);
      });

      card.appendChild(cardHeader);
      cardBody.appendChild(groupsContainer);
      card.appendChild(cardBody);

      this.container.appendChild(card);
    });
  }
}
