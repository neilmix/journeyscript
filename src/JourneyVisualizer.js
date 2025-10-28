// src/JourneyVisualizer.js
import dagre from 'dagre';
import { ZoomPanController } from './ZoomPanController.js';

export class JourneyVisualizer {
  constructor(containerSelector, options = {}) {
    this.container = document.querySelector(containerSelector);

    if (!this.container) {
      throw new Error(`Container not found: ${containerSelector}`);
    }

    this.options = this._mergeOptions(options);
    this.steps = [];
    this.graph = null;
    this.zoomPanController = null;
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

    // Set position:absolute on steps BEFORE measuring to get accurate dimensions
    this.steps.forEach(step => {
      step.style.position = 'absolute';
    });

    // Add nodes with accurate measurements
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

    // First pass: track bounds
    const positions = new Map();
    this.graph.nodes().forEach(nodeId => {
      const node = this.graph.node(nodeId);

      // Dagre gives center coordinates, convert to top-left
      const x = node.x - node.width / 2;
      const y = node.y - node.height / 2;

      positions.set(nodeId, { x, y });

      // Track bounds
      minX = Math.min(minX, x);
      minY = Math.min(minY, y);
      maxX = Math.max(maxX, x + node.width);
      maxY = Math.max(maxY, y + node.height);
    });

    // Calculate padding based on viewport size to allow centering any step
    // Use viewport dimensions if available, otherwise fallback to reasonable default
    const viewport = this.container.parentElement;
    let padding = 50; // Minimum padding for aesthetics

    if (viewport) {
      // Add at least half the viewport dimensions as padding
      // This ensures any step can be panned to the center
      const viewportPadding = Math.max(viewport.clientWidth / 2, viewport.clientHeight / 2);
      padding = Math.max(padding, viewportPadding);
    }

    // Second pass: position steps with padding offset
    this.graph.nodes().forEach(nodeId => {
      const node = this.graph.node(nodeId);
      const step = node.element;
      const pos = positions.get(nodeId);

      // Shift by padding and normalize to container origin
      const x = pos.x - minX + padding;
      const y = pos.y - minY + padding;

      step.style.position = 'absolute';
      step.style.left = `${x}px`;
      step.style.top = `${y}px`;
    });

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
    // Calculate offset to account for padding added in _positionSteps
    const offsetX = -this.bounds.minX + this.bounds.padding;
    const offsetY = -this.bounds.minY + this.bounds.padding;

    this.graph.edges().forEach(edgeObj => {
      const edge = this.graph.edge(edgeObj);

      // Build SVG path from Dagre-computed points, offset by padding
      const pathData = edge.points
        .map((point, i) => {
          const x = point.x + offsetX;
          const y = point.y + offsetY;
          return `${i === 0 ? 'M' : 'L'} ${x} ${y}`;
        })
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
        const midX = midpoint.x + offsetX;
        const midY = midpoint.y + offsetY;

        const text = document.createElementNS('http://www.w3.org/2000/svg', 'text');
        text.setAttribute('x', midX);
        text.setAttribute('y', midY);
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
        bgRect.setAttribute('x', midX - bbox.width / 2 - 4);
        bgRect.setAttribute('y', midY - bbox.height / 2 - 2);
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
    const viewport = this.container.parentElement;

    if (!viewport) {
      console.warn('No viewport found for zoom/pan initialization');
      return;
    }

    // Create zoom/pan controller with our options
    this.zoomPanController = new ZoomPanController(this.container, viewport, {
      minScale: this.options.zoom.min,
      maxScale: this.options.zoom.max,
      step: this.options.zoom.step
    });

    // Set cursor style for dragging
    this.container.style.cursor = 'grab';
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

    if (!startStep || !this.zoomPanController) {
      return;
    }

    const viewport = this.container.parentElement;

    if (!viewport) {
      return;
    }

    // Set initial zoom
    const scale = this.options.zoom.initial;
    this.zoomPanController.zoom(scale, { animate: false });

    // Use offset positions (untransformed coordinates)
    const stepCenterX = startStep.offsetLeft + startStep.offsetWidth / 2;
    const stepCenterY = startStep.offsetTop + startStep.offsetHeight / 2;

    // Calculate target pan to center the step in the viewport
    const targetX = (viewport.clientWidth / 2) - (stepCenterX * scale);
    const targetY = (viewport.clientHeight / 2) - (stepCenterY * scale);

    // Apply pan
    this.zoomPanController.pan(targetX, targetY, { animate: false });

    // Add highlight to starting step
    startStep.classList.add('journey-step-current');
  }

  // Public API methods
  navigateTo(stepId, options = {}) {
    const step = document.getElementById(stepId);

    if (!step) {
      console.warn(`Step not found: ${stepId}`);
      return;
    }

    if (!this.zoomPanController) {
      console.warn('ZoomPanController not initialized');
      return;
    }

    const viewport = this.container.parentElement;

    if (!viewport) {
      return;
    }

    // Set zoom if specified
    if (options.zoom) {
      this.zoomPanController.zoom(options.zoom, { animate: false });
    }

    // Get current scale
    const scale = this.zoomPanController.getScale();

    // Use offset positions (untransformed coordinates)
    const stepCenterX = step.offsetLeft + step.offsetWidth / 2;
    const stepCenterY = step.offsetTop + step.offsetHeight / 2;

    // Calculate target pan to center the step in the viewport
    const targetX = (viewport.clientWidth / 2) - (stepCenterX * scale);
    const targetY = (viewport.clientHeight / 2) - (stepCenterY * scale);

    // Apply animation if requested
    const animate = options.animate !== undefined ? options.animate : true;

    // Apply pan
    this.zoomPanController.pan(targetX, targetY, { animate: animate });

    const previousStep = this.currentStep;
    this.currentStep = stepId;

    // Remove highlight from previous step
    if (previousStep) {
      const prevStepElement = document.getElementById(previousStep);
      if (prevStepElement) {
        prevStepElement.classList.remove('journey-step-current');
      }
    }

    // Add persistent highlight to current step
    step.classList.add('journey-step-current');

    // Add temporary highlight animation if enabled
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
      scale: this.zoomPanController ? this.zoomPanController.getScale() : 1,
      pan: this.zoomPanController ? this.zoomPanController.getPan() : { x: 0, y: 0 }
    };
  }

  destroy() {
    if (this.zoomPanController) {
      this.zoomPanController.destroy();
      this.zoomPanController = null;
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

      // Wait for panzoom to fully initialize before navigating to start
      await new Promise(resolve => setTimeout(resolve, 0));
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
