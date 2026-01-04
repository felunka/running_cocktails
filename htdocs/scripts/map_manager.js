export class MapManager {
  constructor(mapSelector, style, center, zoom) {
    this.map = new google.maps.Map(document.querySelector(mapSelector), {
      center,
      zoom,
      styles: style,
      mapId: 'd98f63bc3d83895364029bdb'
    });
    this.markers = [];
  }

  clearMarkers() {
    this.markers.forEach(m => m.map = null);
    this.markers = [];
  }

  async geocodeAddress(address) {
    return new Promise((resolve) => {
      if (!address) return resolve(null);
      const geocoder = new google.maps.Geocoder();
      geocoder.geocode({ address }, (results, status) => {
        if (status === 'OK' && results[0]) {
          resolve(results[0].geometry.location);
        } else {
          resolve(null);
        }
      });
    });
  }

  createSVG(color, label) {
    const svgNS = "http://www.w3.org/2000/svg";
    const svg = document.createElementNS(svgNS, "svg");
    svg.setAttribute("width", "32");
    svg.setAttribute("height", "32");
    svg.setAttribute("viewBox", "0 0 32 32");
    svg.setAttribute("fill", "none");

    const circle = document.createElementNS(svgNS, "circle");
    circle.setAttribute("cx", "16");
    circle.setAttribute("cy", "16");
    circle.setAttribute("r", "12");
    circle.setAttribute("fill", color);
    circle.setAttribute("stroke", "white");
    circle.setAttribute("stroke-width", "3");
    svg.appendChild(circle);

    if (label) {
      const text = document.createElementNS(svgNS, "text");
      text.setAttribute("x", "16");
      text.setAttribute("y", "21");
      text.setAttribute("text-anchor", "middle");
      text.setAttribute("fill", "white");
      text.setAttribute("font-size", "14");
      text.setAttribute("font-family", "Arial");
      text.setAttribute("font-weight", "bold");
      text.textContent = label;
      svg.appendChild(text);
    }
    return svg;
  }

  async renderMarkers(runners, startAddress, endAddress) {
    this.clearMarkers();
    // Start marker (green)
    if (startAddress) {
      const loc = await this.geocodeAddress(startAddress);
      if (loc) {
        const marker = new google.maps.marker.AdvancedMarkerElement({
          map: this.map,
          position: loc,
          content: this.createSVG('green', 'S'),
          title: 'Start'
        });
        this.markers.push(marker);
      }
    }
    // End marker (red)
    if (endAddress) {
      const loc = await this.geocodeAddress(endAddress);
      if (loc) {
        const marker = new google.maps.marker.AdvancedMarkerElement({
          map: this.map,
          position: loc,
          content: this.createSVG('red', 'E'),
          title: 'End'
        });
        this.markers.push(marker);
      }
    }
    // Runner markers (default blue)
    for (const runner of runners) {
      if (runner.address) {
        const loc = await this.geocodeAddress(runner.address);
        if (loc) {
          const marker = new google.maps.marker.AdvancedMarkerElement({
            map: this.map,
            position: loc,
            content: this.createSVG('#0d6efd', runner.name[0].toUpperCase()),
            title: runner.name
          });
          this.markers.push(marker);
        }
      }
    }
  }
}
