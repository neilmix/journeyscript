// src/JourneyVisualizer.js
import dagre from 'dagre';
import Panzoom from '@panzoom/panzoom';

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

  _discoverSteps() {
    const stepElements = this.container.querySelectorAll('.step');
    const stepIds = new Set();
    const errors = [];

    stepElements.forEach(stepElement => {
      // Validate ID exists
      if (!stepElement.id) {
        errors.push(`Step missing ID: ${stepElement.outerHTML.substring(0, 50)}...`);
        return;
      }

      // Validate ID is unique
      if (stepIds.has(stepElement.id)) {
        errors.push(`Duplicate step ID: ${stepElement.id}`);
        return;
      }

      stepIds.add(stepElement.id);
      this.steps.push(stepElement);
    });

    if (errors.length > 0) {
      throw new Error(errors.join('\n'));
    }

    if (this.steps.length === 0) {
      throw new Error('No steps found with class="step"');
    }
  }

  _buildGraph() {
    this.graph = new dagre.graphlib.Graph();

    // Configure graph layout
    this.graph.setGraph({
      rankdir: this.options.layout.direction,
      ranksep: this.options.layout.rankSep,
      nodesep: this.options.layout.nodeSep,
      edgesep: this.options.layout.edgeSep
    });

    // Add nodes
    this.steps.forEach(step => {
      const rect = step.getBoundingClientRect();

      this.graph.setNode(step.id, {
        width: rect.width || 200,  // Default width if not rendered
        height: rect.height || 100, // Default height if not rendered
        element: step
      });
    });

    // Add edges
    const validStepIds = new Set(this.steps.map(s => s.id));

    this.steps.forEach(step => {
      const actions = step.querySelectorAll('[data-dest]');

      actions.forEach(action => {
        const destId = action.getAttribute('data-dest');
        const label = action.textContent.trim();

        // Validate destination exists
        if (!validStepIds.has(destId)) {
          console.warn(`Invalid destination: ${step.id} -> ${destId}`);
          return;
        }

        this.graph.setEdge(step.id, destId, {
          label: label,
          sourceElement: action
        });
      });
    });
  }

  _computeLayout() {
    console.time('dagre-layout');
    dagre.layout(this.graph);
    console.timeEnd('dagre-layout');
  }

  _positionSteps() {
    let minX = Infinity, minY = Infinity;
    let maxX = -Infinity, maxY = -Infinity;

    // Position each step and track bounds
    this.graph.nodes().forEach(nodeId => {
      const node = this.graph.node(nodeId);
      const step = node.element;

      // Dagre gives center coordinates, convert to top-left
      const x = node.x - node.width / 2;
      const y = node.y - node.height / 2;

      step.style.position = 'absolute';
      step.style.left = `${x}px`;
      step.style.top = `${y}px`;

      // Track bounds
      minX = Math.min(minX, x);
      minY = Math.min(minY, y);
      maxX = Math.max(maxX, x + node.width);
      maxY = Math.max(maxY, y + node.height);
    });

    // Size container with padding
    const padding = 50;
    const width = maxX - minX + padding * 2;
    const height = maxY - minY + padding * 2;

    this.container.style.width = `${width}px`;
    this.container.style.height = `${height}px`;
    this.container.style.position = 'relative';

    // Store bounds for later use
    this.bounds = { minX, minY, maxX, maxY, padding };
  }

  _createSvgOverlay(width, height) {
    const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');

    svg.setAttribute('width', width);
    svg.setAttribute('height', height);
    svg.setAttribute('class', 'journey-svg-overlay');

    svg.style.position = 'absolute';
    svg.style.top = '0px';
    svg.style.left = '0px';
    svg.style.pointerEvents = 'none';
    svg.style.zIndex = '10';

    // Create arrowhead marker definition
    const defs = document.createElementNS('http://www.w3.org/2000/svg', 'defs');
    const marker = document.createElementNS('http://www.w3.org/2000/svg', 'marker');

    marker.setAttribute('id', 'arrowhead');
    marker.setAttribute('markerWidth', '10');
    marker.setAttribute('markerHeight', '10');
    marker.setAttribute('refX', '9');
    marker.setAttribute('refY', '3');
    marker.setAttribute('orient', 'auto');
    marker.setAttribute('markerUnits', 'strokeWidth');

    const path = document.createElementNS('http://www.w3.org/2000/svg', 'path');
    path.setAttribute('d', 'M0,0 L0,6 L9,3 z');
    path.setAttribute('fill', this.options.arrows.color);

    marker.appendChild(path);
    defs.appendChild(marker);
    svg.appendChild(defs);

    this.container.appendChild(svg);
    this.svgOverlay = svg;
  }

  _drawArrows() {
    this.graph.edges().forEach(edgeObj => {
      const edge = this.graph.edge(edgeObj);

      // Build SVG path from Dagre-computed points
      const pathData = edge.points
        .map((point, i) => `${i === 0 ? 'M' : 'L'} ${point.x} ${point.y}`)
        .join(' ');

      // Create arrow path
      const path = document.createElementNS('http://www.w3.org/2000/svg', 'path');
      path.setAttribute('d', pathData);
      path.setAttribute('class', 'journey-arrow');
      path.setAttribute('marker-end', 'url(#arrowhead)');
      path.setAttribute('fill', 'none');
      path.setAttribute('stroke', this.options.arrows.color);
      path.setAttribute('stroke-width', this.options.arrows.width);

      this.svgOverlay.appendChild(path);

      // Add label at midpoint if enabled
      if (this.options.arrows.showLabels && edge.label) {
        const midpoint = edge.points[Math.floor(edge.points.length / 2)];

        const text = document.createElementNS('http://www.w3.org/2000/svg', 'text');
        text.setAttribute('x', midpoint.x);
        text.setAttribute('y', midpoint.y);
        text.setAttribute('class', 'arrow-label');
        text.setAttribute('text-anchor', 'middle');
        text.setAttribute('dominant-baseline', 'middle');
        text.setAttribute('fill', this.options.arrows.color);
        text.setAttribute('font-size', '12px');
        text.setAttribute('font-family', 'system-ui, sans-serif');
        text.textContent = edge.label;

        // Add white background for readability
        const bgRect = document.createElementNS('http://www.w3.org/2000/svg', 'rect');
        const bbox = text.getBBox ? { width: edge.label.length * 7, height: 16 } : { width: 50, height: 16 };
        bgRect.setAttribute('x', midpoint.x - bbox.width / 2 - 4);
        bgRect.setAttribute('y', midpoint.y - bbox.height / 2 - 2);
        bgRect.setAttribute('width', bbox.width + 8);
        bgRect.setAttribute('height', bbox.height + 4);
        bgRect.setAttribute('fill', 'white');
        bgRect.setAttribute('stroke', '#ccc');
        bgRect.setAttribute('stroke-width', '1');
        bgRect.setAttribute('rx', '3');

        this.svgOverlay.appendChild(bgRect);
        this.svgOverlay.appendChild(text);
      }
    });
  }

  _initializePanZoom() {
    this.panzoomInstance = Panzoom(this.container, {
      maxScale: this.options.zoom.max,
      minScale: this.options.zoom.min,
      step: this.options.zoom.step,
      canvas: true
    });

    // Enable mouse wheel zoom on parent viewport
    const viewport = this.container.parentElement;
    if (viewport) {
      viewport.addEventListener('wheel', this.panzoomInstance.zoomWithWheel);
    }
  }

  _findStartStep() {
    const startStep = this.container.querySelector('[data-place="start"]');

    if (!startStep) {
      console.warn('No start step found with data-place="start", defaulting to first step');
      return this.steps[0];
    }

    return startStep;
  }

  _navigateToStart() {
    const startStep = this._findStartStep();

    if (!startStep || !this.panzoomInstance) {
      return;
    }

    // Get step position and size
    const rect = startStep.getBoundingClientRect();
    const containerRect = this.container.getBoundingClientRect();
    const viewport = this.container.parentElement;

    if (!viewport) {
      return;
    }

    const viewportRect = viewport.getBoundingClientRect();

    // Calculate center position
    const x = (viewportRect.width / 2) - (rect.left - containerRect.left + rect.width / 2);
    const y = (viewportRect.height / 2) - (rect.top - containerRect.top + rect.height / 2);

    this.panzoomInstance.pan(x, y);
    this.panzoomInstance.zoom(this.options.zoom.initial);
  }

  // Public API methods
  navigateTo(stepId, options = {}) {
    const step = document.getElementById(stepId);

    if (!step) {
      console.warn(`Step not found: ${stepId}`);
      return;
    }

    if (!this.panzoomInstance) {
      console.warn('Panzoom not initialized');
      return;
    }

    const rect = step.getBoundingClientRect();
    const containerRect = this.container.getBoundingClientRect();
    const viewport = this.container.parentElement;

    if (!viewport) {
      return;
    }

    const viewportRect = viewport.getBoundingClientRect();

    const x = (viewportRect.width / 2) - (rect.left - containerRect.left + rect.width / 2);
    const y = (viewportRect.height / 2) - (rect.top - containerRect.top + rect.height / 2);

    this.panzoomInstance.pan(x, y, {
      animate: options.animate !== undefined ? options.animate : true
    });

    if (options.zoom) {
      this.panzoomInstance.zoom(options.zoom);
    }

    const previousStep = this.currentStep;
    this.currentStep = stepId;

    // Add highlight if enabled
    if (this.options.navigation.highlightOnNavigate) {
      step.classList.add('journey-step-highlight');
      setTimeout(() => {
        step.classList.remove('journey-step-highlight');
      }, 1000);
    }

    // Emit navigate event
    this._emit('navigate', { from: previousStep, to: stepId });
  }

  reset() {
    this._navigateToStart();
  }

  refresh() {
    // Re-measure and re-layout
    this._buildGraph();
    this._computeLayout();
    this._positionSteps();

    // Redraw arrows
    if (this.svgOverlay) {
      this.svgOverlay.innerHTML = '';
      this._createSvgOverlay(
        parseInt(this.container.style.width),
        parseInt(this.container.style.height)
      );
    }
    this._drawArrows();

    this._emit('layout-complete');
  }

  getState() {
    return {
      currentStep: this.currentStep,
      totalSteps: this.steps.length,
      scale: this.panzoomInstance ? this.panzoomInstance.getScale() : 1,
      pan: this.panzoomInstance ? this.panzoomInstance.getPan() : { x: 0, y: 0 }
    };
  }

  destroy() {
    if (this.panzoomInstance) {
      this.panzoomInstance.destroy();
      this.panzoomInstance = null;
    }

    if (this.svgOverlay && this.svgOverlay.parentNode) {
      this.svgOverlay.parentNode.removeChild(this.svgOverlay);
    }

    this._emit('destroy');
  }

  // Event system
  on(eventName, callback) {
    if (!this.eventHandlers) {
      this.eventHandlers = {};
    }
    if (!this.eventHandlers[eventName]) {
      this.eventHandlers[eventName] = [];
    }
    this.eventHandlers[eventName].push(callback);
  }

  _emit(eventName, data) {
    if (!this.eventHandlers || !this.eventHandlers[eventName]) {
      return;
    }
    this.eventHandlers[eventName].forEach(callback => callback(data));
  }

  // Main initialization method
  async init() {
    try {
      console.time('journey-init');

      // Wait for fonts and images to load for accurate measurements
      await this._waitForContentReady();

      // Step-by-step initialization
      this._discoverSteps();
      this._buildGraph();
      this._computeLayout();
      this._positionSteps();

      const width = parseInt(this.container.style.width);
      const height = parseInt(this.container.style.height);
      this._createSvgOverlay(width, height);
      this._drawArrows();

      this._initializePanZoom();
      this._setupButtonHandlers();
      this._navigateToStart();

      this.currentStep = this._findStartStep().id;

      console.timeEnd('journey-init');
      this._emit('layout-complete');

      return this;
    } catch (error) {
      console.error('Initialization failed:', error);
      throw error;
    }
  }

  async _waitForContentReady() {
    // Wait for fonts
    if (document.fonts && document.fonts.ready) {
      await document.fonts.ready;
    }

    // Wait for images
    const images = Array.from(this.container.querySelectorAll('img'))
      .filter(img => !img.complete);

    if (images.length > 0) {
      await Promise.all(
        images.map(img => new Promise(resolve => {
          img.onload = resolve;
          img.onerror = resolve; // Continue even if image fails
        }))
      );
    }
  }

  _setupButtonHandlers() {
    const buttons = this.container.querySelectorAll('[data-dest]');

    buttons.forEach(button => {
      button.addEventListener('click', (e) => {
        const destId = button.getAttribute('data-dest');
        if (destId) {
          this.navigateTo(destId, { animate: true });
        }
      });
    });
  }
}
