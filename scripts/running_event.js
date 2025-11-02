import { RunnerGroup } from './runner_group.js';

export class RunningEvent {
  constructor(
      startAddress,
      endAddress,
      startDate,
      startTime,
      timePerStop,
      noOfGroups,
      runners
    ) {
    this.startAddress = startAddress;
    this.endAddress = endAddress;
    this.startDateTime = new Date(`${startDate}T${startTime}`);
    this.timePerStop = timePerStop;
    this.noOfGroups = noOfGroups;
    this.runners = runners;
    this.groups = [];
  }

  toString() {
   const groupInfo = this.groups.map((g, groupNo) => {
    const groupRoute = g.route.map((routeStop, stopNo) => {
      return `${stopNo}: ${routeStop.getHost().name} (${routeStop.getHost().address})`;
    }).join(" > ");

    return `== Group ${groupNo} ==\nGroup members: ${g.members.map(m => m.name).join(",")}\nHost: ${g.getHost().name}\nRoute: ${groupRoute}`;
   }).join("\n");

   return `++++ Event ++++\n${groupInfo}`;
  }

  generateGroups() {
    // Shuffle runners
    const shuffled = [...this.runners];
    for (let i = shuffled.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [shuffled[i], shuffled[j]] = [shuffled[j], shuffled[i]];
    }
    // Try up to 1000 times to find a valid assignment
    for (let attempt = 0; attempt < 1000; attempt++) {
      // Clear previous groups
      this.groups = [];
      for (let i = 0; i < this.noOfGroups; i++) {
        this.groups.push(new RunnerGroup());
      }
      // Assign runners round-robin
      for (let i = 0; i < shuffled.length; i++) {
        this.groups[i % this.noOfGroups].members.push(shuffled[i]);
      }
      // Check each group has at least one runner with address
      const allGroupsHaveHost = this.groups.every(g => g.members.some(r => r.address));
      if (allGroupsHaveHost) return;
      // If not, reshuffle
      for (let i = shuffled.length - 1; i > 0; i--) {
        const j = Math.floor(Math.random() * (i + 1));
        [shuffled[i], shuffled[j]] = [shuffled[j], shuffled[i]];
      }
    }
    throw new Error('Could not assign runners to groups with at least one host per group.');
  }

  setRandomHosts() {
    this.groups.forEach(group => group.setRandomHost());
  }

  applyRoutesToGroups(routes) {
    for(let groupNo = 0; groupNo < routes.length; groupNo++) {
      const groupRoute = routes[groupNo];
      for(let hostTeam of groupRoute) {
        this.groups[groupNo].route.push(this.groups[hostTeam]);
      }
    }
  }

  async calculateRoutesAndGetTravelTime(router) {
    let totalEventTime = 0;

    // Iterate groups sequentially to avoid parallel router calls
    for (const group of this.groups) {
      const groupRouteSteps = [];
      // From start to first location
      try {
        const firstLeg = await router.getRoute(
          this.startAddress,
          group.route[0].getHost().address,
          this.startDateTime
        );
        groupRouteSteps.push(firstLeg);
      } catch (err) {
        console.error('Failed to get route for start->first location', err);
        // push a fallback zero-time step to keep indexing consistent
        groupRouteSteps.push({ totalTime: { value: 0 } });
      }

      // From location to location
      for (let i = 1; i < group.route.length; i++) {
        const routeStartTime = this.addTimeOffsetToStartTime(i * this.timePerStop);
        const origin = group.route[i - 1].getHost().address;
        const destination = group.route[i].getHost().address;
        try {
          const leg = await router.getRoute(origin, destination, routeStartTime);
          groupRouteSteps.push(leg);
        } catch (err) {
          console.error(`Failed to get route for ${origin} -> ${destination}`, err);
          groupRouteSteps.push({ totalTime: { value: 0 } });
        }
      }

      // From last location to end
      try {
        const lastLeg = await router.getRoute(
          group.route[group.route.length - 1].getHost().address,
          this.endAddress,
          this.addTimeOffsetToStartTime(groupRouteSteps.length * this.timePerStop)
        );
        groupRouteSteps.push(lastLeg);
      } catch (err) {
        console.error('Failed to get route for last location->end', err);
        groupRouteSteps.push({ totalTime: { value: 0 } });
      }

      group.routeSteps = groupRouteSteps;
      const groupTime = group.routeSteps.reduce((acc, step) => acc + (step.totalTime?.value || 0), 0);
      totalEventTime += groupTime;
    }

    return totalEventTime;
  }

  addTimeOffsetToStartTime(timeOffsetMin) {
    // Convert min to ms
    const ms = timeOffsetMin * 60 * 1000;
    return new Date(this.startDateTime.getTime() + ms);
  }

  toJSON() {
    const result = {
      startAddress: this.startAddress,
      endAddress: this.endAddress,
      startDateTime: this.startDateTime,
      timePerStop: this.timePerStop,
      noOfGroups: this.noOfGroups,
      runners: this.runners
    }
    result.groups = this.groups.map(g => g.toJSON());

    return result;
  }

  fromJSON(event) {
    this.startAddress = event.startAddress;
    this.endAddress = event.endAddress;
    this.startDateTime = new Date(event.startDateTime);
    this.timePerStop = event.timePerStop;
    this.noOfGroups = event.noOfGroups;
    this.runners = event.runners;
    // First pass: create group instances and call their fromJSON to populate basic fields
    this.groups = event.groups.map(g => {
      const group = new RunnerGroup();
      group.fromJSON(g);
      return group;
    });

    // Build a map of uuid -> group for quick lookup
    const groupByUUID = new Map(this.groups.map(g => [g.uuid, g]));

    // Reconstruct each group's route array from stored UUIDs
    for (const group of this.groups) {
      if (Array.isArray(group._routeUUIDs)) {
        group.route = group._routeUUIDs.map(uuid => groupByUUID.get(uuid)).filter(Boolean);
        delete group._routeUUIDs;
      }

      // Reconcile host: if a host UUID was stored, find the matching member object
      if (group._hostUUID) {
        const hostMember = group.members.find(m => m.uuid === group._hostUUID);
        if (hostMember) {
          group.host = hostMember;
          // Also ensure the isHost flag is set on the member
          hostMember.isHost = true;
        }
        delete group._hostUUID;
      } else {
        // If host wasn't serialized as UUID, try to set host from a member with isHost flag
        const found = group.members.find(m => m.isHost);
        if (found) group.host = found;
      }
    }
  }
}
