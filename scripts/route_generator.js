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
    const noGroups = routes.length;
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
