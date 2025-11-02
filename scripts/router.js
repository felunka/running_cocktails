export class Router {
  constructor(apiKey) {
    this.apiKey = apiKey;
    this.cacheKey = 'route_time_cache';
    this.cache = this.loadCache();

    this.geocodeCacheKey = 'geocode_cache';
    this.geocodeCache = this.loadGeocodeCache();
  }

  loadCache() {
    const data = localStorage.getItem(this.cacheKey);
    return data ? JSON.parse(data) : {};
  }

  saveCache() {
    localStorage.setItem(this.cacheKey, JSON.stringify(this.cache));
  }

  loadGeocodeCache() {
    try {
      const data = localStorage.getItem(this.geocodeCacheKey);
      return data ? JSON.parse(data) : {};
    } catch (e) {
      return {};
    }
  }

  saveGeocodeCache() {
    try {
      localStorage.setItem(this.geocodeCacheKey, JSON.stringify(this.geocodeCache));
    } catch (e) {
      // ignore storage errors
    }
  }

  getGeocodeCacheKey(address) {
    return (address || '').trim().toLowerCase();
  }

  getCacheKey(origin, destination, datetime) {
    return `${origin}|${destination}|${datetime.toISOString().slice(0, 16)}`;
  }

  async getRoute(origin, destination, routeStartTime) {
    const cacheKey = this.getCacheKey(origin, destination, routeStartTime);
    if (this.cache[cacheKey]) {
      return this.cache[cacheKey];
    }

    // Geocode addresses to lat/lng
    const [originLoc, destLoc] = await Promise.all([
      this.geocodeAddress(origin),
      this.geocodeAddress(destination)
    ]);
    if (!originLoc || !destLoc) return null;

    const transit = await this.fetchRoute(originLoc, destLoc, 'transit', routeStartTime);
    this.cache[cacheKey] = transit;
    this.saveCache();
    return transit;
  }

  async geocodeAddress(address) {
    if (!address) return null;

    // check geocode cache first
    const key = this.getGeocodeCacheKey(address);
    const cached = this.geocodeCache[key];
    if (cached && typeof cached.lat === 'number' && typeof cached.lng === 'number') {
      return { lat: cached.lat, lng: cached.lng };
    }

    if (!window.google || !google.maps) {
      throw new Error('Google Maps JS API not available');
    }
    const geocoder = new google.maps.Geocoder();
    return new Promise((resolve) => {
      geocoder.geocode({ address }, (results, status) => {
        if (status === 'OK' && results && results[0]) {
          const loc = results[0].geometry.location;
          const result = { lat: loc.lat(), lng: loc.lng() };
          // save to cache with timestamp
          this.geocodeCache[key] = { lat: result.lat, lng: result.lng};
          this.saveGeocodeCache();
          resolve(result);
        } else {
          resolve(null);
        }
      });
    });
  }

  async fetchRoute(origin, destination, mode, datetime) {
    if (!window.google || !google.maps) {
      throw new Error('Google Maps JS API not available');
    }
    const directionsService = new google.maps.DirectionsService();
    const travelMode = mode === 'walking'
      ? google.maps.TravelMode.WALKING
      : google.maps.TravelMode.TRANSIT;

    const request = {
      origin: { lat: parseFloat(origin.lat), lng: parseFloat(origin.lng) },
      destination: { lat: parseFloat(destination.lat), lng: parseFloat(destination.lng) },
      travelMode
    };
    if (mode === 'transit' && datetime) {
      if (!isNaN(datetime.getTime())) {
        request.transitOptions = { departureTime: datetime };
      }
    }
    return new Promise((resolve) => {
      directionsService.route(request, (result, status) => {
        if (status === 'OK' && result && result.routes && result.routes[0]) {
          resolve(this.simplifyRoute(result));
        } else {
          resolve(null);
        }
      });
    });
  }

  /**
   * Simplify a Google Directions route/response into a compact shape.
   * Accepts either the full Directions response (with `routes`) or a single route object.
   * Returns the reduced structure shown in the example or null for invalid input.
   */
  simplifyRoute(routeOrResponse) {
    if (!routeOrResponse) return null;
    const route = routeOrResponse.routes ? routeOrResponse.routes[0] : routeOrResponse;
    if (!route || !Array.isArray(route.legs) || route.legs.length === 0) return null;
    const leg = route.legs[0];

    const overallMode = (leg.steps || []).some(s => {
      const m = (s.travel_mode || s.travelMode || '').toString().toUpperCase();
      return m === 'TRANSIT';
    }) ? 'TRANSIT' : 'WALKING';

    const mapStep = (s) => {
      const travelMode = (s.travel_mode || s.travelMode || '').toString().toUpperCase() || (s.travel_mode || s.travelMode || '');
      const instructions = s.instructions || s.html_instructions || '';
      const distance = s.distance ? { text: s.distance.text, value: s.distance.value } : { text: '', value: 0 };
      const duration = s.duration ? { text: s.duration.text, value: s.duration.value } : { text: '', value: 0 };

      let transit = {};
      const t = s.transit || s.transit_details || null;
      if (t) {
        const arrival_stop = (t.arrival_stop && (t.arrival_stop.name || t.arrival_stop)) || (t.arrivalStop && t.arrivalStop.name) || undefined;
        const departure_stop = (t.departure_stop && (t.departure_stop.name || t.departure_stop)) || (t.departureStop && t.departureStop.name) || undefined;
        const departure_time = t.departure_time || t.departureTime || null;
        const arrival_time = t.arrival_time || t.arrivalTime || null;
        const headsign = t.headsign || t.headsign || undefined;
        const line = t.line || {};
        const vehicle = (line && line.vehicle) ? {
          local_icon: line.vehicle.local_icon || null,
          name: line.vehicle.name || null,
          type: line.vehicle.type || null
        } : {};
        const lineSimplified = {
          color: line.color || null,
          name: line.name || null,
          short_name: line.short_name || null,
          vehicle
        };

        transit = {
          arrival_stop: arrival_stop || undefined,
          departure_stop: departure_stop || undefined,
          departure_time: departure_time || undefined,
          arrival_time: arrival_time || undefined,
          headsign: headsign || undefined,
          line: lineSimplified,
          num_stops: (t.num_stops != null) ? t.num_stops : (t.numStops != null ? t.numStops : undefined)
        };
      }

      return {
        travelMode,
        instructions,
        distance,
        duration,
        transit: Object.keys(transit).length ? transit : {}
      };
    };

    return {
      overallMode,
      totalTime: leg.duration ? { text: leg.duration.text, value: leg.duration.value } : null,
      startAddress: leg.start_address || leg.startAddress || '',
      endAddress: leg.end_address || leg.endAddress || '',
      departureTime: leg.departure_time || leg.departureTime || null,
      arrivalTime: leg.arrival_time || leg.arrivalTime || null,
      distance: leg.distance ? { text: leg.distance.text, value: leg.distance.value } : null,
      steps: Array.isArray(leg.steps) ? leg.steps.map(mapStep) : []
    };
  }
}
