export class RunnerGroup {
  constructor() {
    this.uuid = crypto.randomUUID();
    this.members = [];
    this.route = [];
    this.routeSteps = [];
  }

  setRandomHost() {
    if (!Array.isArray(this.members)) return;
    const candidates = this.members.filter(m => m.address != null);
    if (candidates.length === 0) return;
    // Clear any previous host flags
    this.members.forEach(m => m.isHost = false);
    const host = candidates[Math.floor(Math.random() * candidates.length)];
    host.isHost = true;
    return host;
  }

  getHost() {
    if(!this.host) {
      this.host = this.members.find((r) => r.isHost);
    }
    return this.host;
  }

  getTotalTravelTime() {
    if(!this.routeSteps || this.routeSteps.length == 0) {
      return -1;
    }
    return this.routeSteps.reduce((acc, step) => acc + step.totalTime.value, 0);
  }

  toJSON() {
    const result = {
      uuid: this.uuid,
      members: this.members,
      host: this.getHost(),
      routeSteps: this.routeSteps
    };
    // Serialize route as an array of group UUIDs to avoid circular references
    result.route = this.route.map(g => g.uuid);

    return result;
  }

  toMiniPlanJSON(event) {
    const startISO = event.startDateTime instanceof Date
      ? event.startDateTime.toISOString()
      : event.startDateTime;

    const MAPS_PREFIX = "https://maps.gstatic.com/mapfiles/transit";

    const shortenLocalIcon = (url) => {
      if (!url) return null;
      return url.startsWith(MAPS_PREFIX) ? url.slice(MAPS_PREFIX.length) : url;
    };

    const members = (this.members || []).map(m => ({
      n: m.name,
      a: m.address,
      h: !!m.isHost
    }));

    const routeSteps = (this.routeSteps || []).map(rs => {
      const steps = (rs.steps || []).map(st => {
        const tr = st.transit && Object.keys(st.transit).length ? {
          as: st.transit.arrival_stop || null,
          ds: st.transit.departure_stop || null,
          dt: st.transit.departure_time ? st.transit.departure_time.text : null,
          at: st.transit.arrival_time ? st.transit.arrival_time.text : null,
          h: st.transit.headsign || null,
          l: st.transit.line ? {
            c: st.transit.line.color || null,
            n: st.transit.line.name || null,
            s: st.transit.line.short_name || null,
            v: st.transit.line.vehicle ? {
              li: shortenLocalIcon(st.transit.line.vehicle.local_icon) || null,
              n: st.transit.line.vehicle.name || null
            } : null
          } : null
        } : {};

        return {
          m: st.travelMode || null,
          i: st.instructions || null,
          d: st.distance ? st.distance.text : null,
          du: st.duration ? st.duration.text : null,
          tr
        };
      });

      return {
        sa: rs.startAddress || null,
        ea: rs.endAddress || null,
        tt: rs.totalTime ? rs.totalTime.text : null,
        dt: rs.departureTime ? rs.departureTime.text : null,
        at: rs.arrivalTime ? rs.arrivalTime.text : null,
        d: rs.distance ? rs.distance.text : null,
        s: steps,
        hg: {} // filled below
      };
    });

    // attach compact hostGroup info
    routeSteps.forEach((step, idx) => {
      if (idx < (this.route || []).length && this.route[idx]) {
        const host = this.route[idx].getHost();
        step.hg = {
          hn: host ? host.name : null,
          hm: (this.route[idx].members || []).map(m => m.name).join(", ")
        };
      } else {
        step.hg = { hn: "Finale", hm: "Everyone" };
      }
    });

    const result = {
      g: {
        m: members,
        r: routeSteps
      }
    };

    return JSON.stringify(result);
  }

  fromJSON(g) {
    this.uuid = g.uuid;
    this.members = g.members || [];
    // We'll reconstruct `route` as actual group references later (after all groups are created).
    this.route = [];
    this._routeUUIDs = g.route || [];
    this.routeSteps = g.routeSteps || [];
    // Keep a host UUID to reconcile to an actual member reference later
    this._hostUUID = g.host ? g.host.uuid : null;
    this.host = null;
  }
}
