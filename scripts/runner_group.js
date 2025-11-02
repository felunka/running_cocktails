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
    const result = {
      startAddress: event.startAddress,
      endAddress: event.endAddress,
      startDateTime: event.startDateTime.toISOString(),
      groupToDisplay: {
        members: this.members,
        routeSteps: this.routeSteps
      }
    };

    result.groupToDisplay.routeSteps.forEach((step, stepNo) => {
      if(stepNo < this.route.length) {
        step.hostGroup = {
          hostName: this.route[stepNo].getHost().name,
          hostGroupMembers: this.route[stepNo].members.map(m => m.name).join(", ")
        };
      } else {
        step.hostGroup = {
          hostName: "Finale",
          hostGroupMembers: "Everyone"
        };
      }
    });

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
