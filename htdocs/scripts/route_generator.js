export class RouteGenerator {
  static getRandomInt(min, max) {
    min = Math.ceil(min);
    max = Math.floor(max);
    return Math.floor(Math.random() * (max - min + 1)) + min;
  }

  static getRandomSample(arr) {
    const index = this.getRandomInt(0, arr.length - 1);
    return arr[index];
  }

  static generateRandomRoutes(noStops, noGroups) {
    const noHostsPerStop = Math.floor(noGroups / noStops);
    let hostingPerStop = [];
    let hostingCounts = [];
    let alreadyHosting = new Set();
    for (let currentStop = 0; currentStop < noStops; currentStop++) {
      hostingPerStop[currentStop] = [];
      hostingCounts[currentStop] = {};
      while (hostingPerStop[currentStop].length < noHostsPerStop) {
        const groupToHost = this.getRandomInt(0, noGroups - 1);
        if (!alreadyHosting.has(groupToHost)) {
          hostingPerStop[currentStop].push(groupToHost);
          hostingCounts[currentStop][groupToHost] = 1;
          alreadyHosting.add(groupToHost);
        }
      }
    }

    let routes = [];
    for (let currentGroup = 0; currentGroup < noGroups; currentGroup++) {
      routes[currentGroup] = [];
      for (let currentStop = 0; currentStop < noStops; currentStop++) {
        if (hostingPerStop[currentStop].includes(currentGroup)) {
          // If the current group is hosting it needs to go to their location
          routes[currentGroup].push(currentGroup);
        } else {
          // Otherwise it should go to a other host chosen random
          let groupToHost = this.getRandomSample(hostingPerStop[currentStop]);
          while (hostingCounts[currentStop][groupToHost] > ((noGroups / noHostsPerStop) - 1)) {
            groupToHost = this.getRandomSample(hostingPerStop[currentStop]);
          }
          routes[currentGroup].push(groupToHost);
          hostingCounts[currentStop][groupToHost]++;
        }
      }
    }

    return routes;
  }

  // Hosting groups stay at their location for every stop; the other groups rotate between them as guests.
  static generateFixedHostRoutes(noStops, noGroups, noHosts) {
    const shuffled = [...Array(noGroups).keys()].sort(() => Math.random() - 0.5);
    const hostIdxs = shuffled.slice(0, noHosts);
    const guestIdxs = shuffled.slice(noHosts);
    const capacity = Math.ceil(guestIdxs.length / noHosts);

    const routes = [];
    for (const hostIdx of hostIdxs) {
      routes[hostIdx] = Array(noStops).fill(hostIdx);
    }
    for (const guestIdx of guestIdxs) {
      routes[guestIdx] = [];
    }

    for (let stop = 0; stop < noStops; stop++) {
      const guestCounts = new Map(hostIdxs.map(h => [h, 0]));
      for (const guestIdx of [...guestIdxs].sort(() => Math.random() - 0.5)) {
        const notFull = hostIdxs.filter(h => guestCounts.get(h) < capacity);
        const unvisited = notFull.filter(h => !routes[guestIdx].includes(h));
        const hostIdx = this.getRandomSample(unvisited.length > 0 ? unvisited : notFull);
        routes[guestIdx].push(hostIdx);
        guestCounts.set(hostIdx, guestCounts.get(hostIdx) + 1);
      }
    }

    return { routes, hostIdxs };
  }

  static checkFixedHostRouteValid(routes, hostIdxs) {
    const noStops = routes[0].length;
    const guestIdxs = routes.map((_, idx) => idx).filter(idx => !hostIdxs.includes(idx));

    for (const guestIdx of guestIdxs) {
      const route = routes[guestIdx];
      if (route.some(h => routes[h][0] !== h || !hostIdxs.includes(h))) {
        console.debug(`Invalid, because group ${guestIdx} visits a group that is not hosting`);
        return false;
      }
      if (new Set(route).size !== route.length) {
        console.debug(`Invalid, because group ${guestIdx} visits the same host twice`);
        return false;
      }
    }

    for (let stop = 0; stop < noStops; stop++) {
      const counts = hostIdxs.map(h => guestIdxs.filter(g => routes[g][stop] === h).length);
      if (Math.max(...counts) - Math.min(...counts) > 1) {
        console.debug(`Invalid, because guests are unevenly distributed on stop ${stop}`);
        return false;
      }
    }

    // Identical guest routes are unavoidable when there are more guests than possible host orders
    const routeKeys = guestIdxs.map(g => routes[g].join(','));
    if (noStops > 1 && guestIdxs.length <= hostIdxs.length && new Set(routeKeys).size !== routeKeys.length) {
      console.debug('Invalid, because two guest groups have identical routes');
      return false;
    }

    return true;
  }

  static checkRouteValid(routes) {
    // Test 1: Host must be present
    for (let groupRoute of routes) {
      for (let stopNo = 0; stopNo < groupRoute.length; stopNo++) {
        if (groupRoute[stopNo] != routes[groupRoute[stopNo]][stopNo]) {
          console.debug(`Invalid, because group is visiting team ${groupRoute[stopNo]} on stop ${stopNo}, but team not hosting`);
          return false;
        }
      }
    }

    // Test 2: No two groups should have the exact same route
    // Compare each group's route to every other group's route for exact equality
    // Skip test if no of stops == no of groups
    const noGroups = routes.length;
    const noStops = routes[0].length;
    if(noGroups == noStops) {
      console.debug("Skipping remaining tests, because no of stops == no of groups...");
      return true;
    }
    for (let i = 0; i < routes.length; i++) {
      for (let j = i + 1; j < routes.length; j++) {
        const routeA = routes[i];
        const routeB = routes[j];
        let identical = true;
        for (let k = 0; k < routeA.length; k++) {
          if (routeA[k] !== routeB[k]) {
            identical = false;
            break;
          }
        }
        if (identical) {
          console.debug(`Invalid, because group ${i} and group ${j} have identical routes`);
          return false;
        }
      }
    }

    const noHostsPerStop = Math.floor(routes.length / routes[0].length);
    let partners = [];
    for (let groupNo = 0; groupNo < routes.length; groupNo++) {
      let groupRoute = routes[groupNo];
      for (let stopNo = 0; stopNo < groupRoute.length; stopNo++) {
        if (!partners[stopNo]) {
          partners[stopNo] = {};
        }
        if (!(groupRoute[stopNo] in partners[stopNo])) {
          partners[stopNo][groupRoute[stopNo]] = new Set();
        }
        // Find others at same host for the current stop
        partners[stopNo][groupRoute[stopNo]].add(groupNo);
      }
    }

    // Test 3: Groups change from stop to stop
    for (let stopNo = 1; stopNo < partners.length - 1; stopNo++) {
      for (const [hostGroup, visitingGroups] of Object.entries(partners[stopNo])) {
        for (const [nextHostGroup, nextVisitingGroups] of Object.entries(partners[stopNo + 1])) {
          if (visitingGroups.difference(nextVisitingGroups).size < noHostsPerStop - 1) {
            console.debug(`Invalid, because group not changing enough from stop ${stopNo} and host ${hostGroup} to stop ${stopNo + 1} and host ${nextHostGroup}`);
            return false;
          }
        }
      }
    }

    // Test 4: Equal distribution of teams over hosts
    for (let stopNo = 1; stopNo < partners.length; stopNo++) {
      for (const [hostGroup, visitingGroups] of Object.entries(partners[stopNo])) {
        if (visitingGroups.size < (noGroups / noHostsPerStop)) {
          console.debug(`Invalid, because not enough groups at stop ${stopNo} and host ${hostGroup}`);
          return false;
        }
      }
    }

    return true;
  }
}
