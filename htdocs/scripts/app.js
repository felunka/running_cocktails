import { RunnerManager } from './runner_manager.js';
import { MapManager } from './map_manager.js';
import { Router } from './router.js';
import { Runner } from './runner.js';
import { RunningEvent } from './running_event.js';
import { RouteGenerator } from './route_generator.js';
import { ResultsRenderer } from './results_renderer.js';

class App {
  constructor() {
    this.MAX_ROUTE_SETS_TO_TEST = 5000;
    this.MAX_TRIES = 100;

    this.runnerManager = new RunnerManager('cocktail_runners');
    this.mapManager = null;
    this.startAddress = '';
    this.endAddress = '';
    this.startDate = '';
    this.startTime = '';
    this.timePerStop = 0;
    this.noOfGroups = 0;
    this.noOfStops = 0;
    this.noOfHostingGroups = '';
    this.routeKey = 'cocktail_route';
    this.router = new Router("§§_MAPS_API_KEY_§§");
    this.resultsRenderer = new ResultsRenderer("#results");
    this.loadStartEnd();
    this.init();
  }

  loadStartEnd() {
    const data = localStorage.getItem(this.routeKey);
    if (data) {
      try {
        const obj = JSON.parse(data);
        if (obj && typeof obj === 'object') {
          this.startAddress = obj.start || '';
          this.endAddress = obj.end || '';
          this.startDate = obj.startDate || '';
          this.startTime = obj.startTime || '';
          this.timePerStop = obj.timePerStop || '';
          this.noOfGroups = obj.noOfGroups || '';
          this.noOfStops = obj.noOfStops || '';
          this.noOfHostingGroups = obj.noOfHostingGroups || '';
        }
      } catch { }
    }
  }

  saveStartEnd() {
    localStorage.setItem(this.routeKey, JSON.stringify({
      start: this.startAddress,
      end: this.endAddress,
      startDate: this.startDate,
      startTime: this.startTime,
      timePerStop: this.timePerStop,
      noOfGroups: this.noOfGroups,
      noOfStops: this.noOfStops,
      noOfHostingGroups: this.noOfHostingGroups
    }));
  }

  async init() {
    document.getElementById('startAddress').value = this.startAddress;
    document.getElementById('endAddress').value = this.endAddress;
    document.getElementById('startDate').value = this.startDate;
    document.getElementById('startTime').value = this.startTime;
    document.getElementById('timePerStop').value = this.timePerStop;
    document.getElementById('noOfGroups').value = this.noOfGroups;
    document.getElementById('noOfStops').value = this.noOfStops;
    document.getElementById('noOfHostingGroups').value = this.noOfHostingGroups;
    this.runnerManager.renderTable('#runnersTable tbody');
    // Wait for Google Maps to be ready
    if (window.google && window.google.maps && window.google.maps.places) {
      this.initMap();
      this.initAutocomplete();
    } else {
      window.addEventListener('load', () => {
        if (window.google && window.google.maps && window.google.maps.places) {
          this.initMap();
          this.initAutocomplete();
        }
      });
    }
    this.setupEvents();
  }

  initAutocomplete() {
    const startInput = document.getElementById('startAddress');
    const endInput = document.getElementById('endAddress');
    const runnerInput = document.getElementById('runnerAddress');
    if (startInput) new google.maps.places.Autocomplete(startInput);
    if (endInput) new google.maps.places.Autocomplete(endInput);
    if (runnerInput) new google.maps.places.Autocomplete(runnerInput);
  }

  async updateMap() {
    if (this.mapManager) {
      await this.mapManager.renderMarkers(this.runnerManager.runners, this.startAddress, this.endAddress);
    }
  }

  initMap() {
    this.mapManager = new MapManager(
      '#map',
      [],
      { lat: 52.52, lng: 13.405 },
      12
    );
    this.updateMap();
  }

  setupEvents() {
    document.getElementById('routeForm').addEventListener('submit', async e => {
      e.preventDefault();
      this.startDate = document.getElementById('startDate').value.trim();
      this.startTime = document.getElementById('startTime').value.trim();
      this.timePerStop = document.getElementById('timePerStop').value.trim();
      this.noOfGroups = document.getElementById('noOfGroups').value.trim();
      this.noOfStops = document.getElementById('noOfStops').value.trim();
      this.noOfHostingGroups = document.getElementById('noOfHostingGroups').value.trim();

      const validationError = this.validateHostingGroups();
      if (validationError) {
        alert(validationError);
        return;
      }

      this.startAddress = document.getElementById('startAddress').value.trim();
      this.endAddress = document.getElementById('endAddress').value.trim();
      this.saveStartEnd();
      await this.updateMap();
    });

    document.getElementById('runnerForm').addEventListener('submit', async e => {
      e.preventDefault();
      const name = document.getElementById('runnerName').value.trim();
      const address = document.getElementById('runnerAddress').value.trim();
      if (!name) return;
      this.runnerManager.add({ name, address });
      this.runnerManager.renderTable('#runnersTable tbody');
      await this.updateMap();
      e.target.reset();
    });

    document.getElementById('runnersTable').addEventListener('click', async e => {
      if (e.target.matches('button[data-idx]')) {
        const idx = +e.target.getAttribute('data-idx');
        this.runnerManager.remove(idx);
        this.runnerManager.renderTable('#runnersTable tbody');
        await this.updateMap();
      }
    });

    document.getElementById('calculateBtn').addEventListener('click', async e => {
      const btn = e.currentTarget;
      // Save original content so we can restore it later
      const originalContent = btn.innerHTML;
      // Disable the button and show a Bootstrap spinner
      btn.disabled = true;
      btn.innerHTML = `
        <span class="spinner-border spinner-border-sm" role="status" aria-hidden="true"></span>
        <span class="visually-hidden">Calculating...</span>
      `;

      const results = [];
      // Run tests sequentially to avoid hitting rate limits
      for (let i = 0; i < this.MAX_ROUTE_SETS_TO_TEST; i++) {
        try {
          const res = await this.testRandomRouteSet();
          results.push(res);
        } catch (err) {
          // If a single run fails, record the error and continue
          console.error('testRandomRouteSet failed at iteration', i, err);
        }
      }

      // Sort by numeric totalTime ascending and keep top 5
      this.resultsRenderer.set(results.sort((a, b) => (a.totalTime || 0) - (b.totalTime || 0)).slice(0, 5));

      btn.disabled = false;
      btn.innerHTML = originalContent;
    });

    document.getElementById('loadFile').addEventListener('click', async e => {
      const file = document.getElementById("formFile").files[0];
      const reader = new FileReader();
      reader.onload = () => {
        const eventData = reader.result.split("§§")[0];
        const resultData = reader.result.split("§§")[1];
        const runnerData = reader.result.split("§§")[2];
        localStorage.setItem(this.routeKey, eventData);
        localStorage.setItem(this.resultsRenderer.cacheKey, resultData);
        localStorage.setItem(this.runnerManager.storageKey, runnerData);
        window.location.reload();
      };
      reader.readAsText(file);
    });

    document.getElementById('saveFile').addEventListener('click', async e => {
      const eventData = localStorage.getItem(this.routeKey);
      const resultData = localStorage.getItem(this.resultsRenderer.cacheKey);
      const runnerData = localStorage.getItem(this.runnerManager.storageKey);
      this.download(`${eventData}§§${resultData}§§${runnerData}`, "running_cocktails_data", "text/plain");
    });
  }

  isFixedHostMode() {
    const hosts = Number(this.noOfHostingGroups);
    return hosts > 0 && hosts < Number(this.noOfGroups);
  }

  validateHostingGroups() {
    if (this.noOfHostingGroups === '') return null;
    const hosts = Number(this.noOfHostingGroups);
    const groups = Number(this.noOfGroups);
    const stops = Number(this.noOfStops);
    if (!Number.isInteger(hosts) || hosts < 1) {
      return 'Number of hosting groups must be at least 1.';
    }
    if (hosts > groups) {
      return 'Number of hosting groups must not exceed the number of groups.';
    }
    if (hosts < groups && stops > hosts) {
      return 'Number of stops must not exceed the number of hosting groups, otherwise guests would visit a host twice.';
    }
    return null;
  }

  download(data, filename, type) {
    let file = new Blob([data], { type: type });
    if (window.navigator.msSaveOrOpenBlob) // IE10+
      window.navigator.msSaveOrOpenBlob(file, filename);
    else { // Others
      let a = document.createElement("a"),
        url = URL.createObjectURL(file);
      a.href = url;
      a.download = filename;
      document.body.appendChild(a);
      a.click();
      setTimeout(function () {
        document.body.removeChild(a);
        window.URL.revokeObjectURL(url);
      }, 0);
    }
  }

  generateValidRoutes() {
    const noStops = Number(this.noOfStops);
    const noGroups = Number(this.noOfGroups);
    if (this.isFixedHostMode()) {
      const noHosts = Number(this.noOfHostingGroups);
      let result = RouteGenerator.generateFixedHostRoutes(noStops, noGroups, noHosts);
      for (let i = 0; i < this.MAX_TRIES && !RouteGenerator.checkFixedHostRouteValid(result.routes, result.hostIdxs); i++) {
        result = RouteGenerator.generateFixedHostRoutes(noStops, noGroups, noHosts);
      }
      return result;
    }

    let routes = RouteGenerator.generateRandomRoutes(noStops, noGroups);
    for (let i = 0; i < this.MAX_TRIES && !RouteGenerator.checkRouteValid(routes); i++) {
      routes = RouteGenerator.generateRandomRoutes(noStops, noGroups);
    }
    return { routes, hostIdxs: null };
  }

  async testRandomRouteSet() {
    const { routes, hostIdxs } = this.generateValidRoutes();

    const runners = app.runnerManager.runners.map(el => {
      return new Runner(el.name, el.address, false);
    });

    let event = new RunningEvent(
      app.startAddress,
      app.endAddress,
      app.startDate,
      app.startTime,
      app.timePerStop,
      app.noOfGroups,
      runners
    );
    event.generateGroups(hostIdxs);
    event.setRandomHosts(hostIdxs);
    event.applyRoutesToGroups(routes);

    const totalTime = await event.calculateRoutesAndGetTravelTime(this.router);

    return {
      event: event,
      totalTime: totalTime
    }
  }
}

const app = new App();
