// src/JourneyVisualizer.js
export class JourneyVisualizer {
  constructor(containerSelector, options = {}) {
    this.container = document.querySelector(containerSelector);

    if (!this.container) {
      throw new Error(`Container not found: ${containerSelector}`);
    }

    this.options = this._mergeOptions(options);
    this.steps = [];
    this.graph = null;
    this.panzoomInstance = null;
  }

  _mergeOptions(userOptions) {
    const defaults = {
      layout: {
        direction: 'TB',
        rankSep: 100,
        nodeSep: 80,
        edgeSep: 30
      },
      zoom: {
        initial: 1,
        min: 0.1,
        max: 3,
        step: 0.1
      },
      arrows: {
        showLabels: true,
        color: '#333',
        width: 2
      },
      navigation: {
        animationDuration: 300,
        highlightOnNavigate: true
      }
    };

    return {
      layout: { ...defaults.layout, ...userOptions.layout },
      zoom: { ...defaults.zoom, ...userOptions.zoom },
      arrows: { ...defaults.arrows, ...userOptions.arrows },
      navigation: { ...defaults.navigation, ...userOptions.navigation }
    };
  }
}
