// src/JourneyVisualizer.js
import { JourneyLayout } from './JourneyLayout.js';
import { ZoomPanController } from './ZoomPanController.js';

export class JourneyVisualizer {
  constructor(containerSelector, options = {}) {
    this.container = document.querySelector(containerSelector);

    if (!this.container) {
      throw new Error(`Container not found: ${containerSelector}`);
    }

    this.options = this._mergeOptions(options);
    this.steps = [];
    this.zoomPanController = null;
  }

  _mergeOptions(userOptions) {
    const defaults = {
      layout: {
        rankSep: 120,
        nodeSep: 150,
        edgeSpacing: 20,
        minGutterSize: 40
      },
      zoom: {
        initial: 1,
        min: 0.1,
        max: 3,
        step: 0.03
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

    stepElements.forEach(stepElement => {
      // Validate ID exists
      if (!stepElement.id) {
        console.warn(`Step missing ID: ${stepElement.outerHTML.substring(0, 50)}...`);
        return;
      }

      // Validate ID is unique
      if (stepIds.has(stepElement.id)) {
        console.warn(`Duplicate step ID: ${stepElement.id}`);
        return;
      }

      stepIds.add(stepElement.id);
      this.steps.push(stepElement);
    });

    if (this.steps.length === 0) {
      throw new Error('No steps found with class="step"');
    }
  }

  _buildGraph() {
    // Set position:absolute on steps BEFORE measuring to get accurate dimensions
    this.steps.forEach(step => {
      step.style.position = 'absolute';
    });

    // Collect node and edge data
    const validStepIds = new Set(this.steps.map(s => s.id));
    this._nodeData = new Map();
    this._edgeData = [];

    // Measure nodes
    this.steps.forEach(step => {
      const rect = step.getBoundingClientRect();
      this._nodeData.set(step.id, {
        width: rect.width || 200,
        height: rect.height || 100,
        element: step
      });
    });

    // Collect edges
    this.steps.forEach(step => {
      const actions = step.querySelectorAll('[data-dest]');

      actions.forEach(action => {
        const destId = action.getAttribute('data-dest');
        const label = action.textContent.trim();

        if (!validStepIds.has(destId)) {
          console.warn(`Invalid destination: ${step.id} -> ${destId}`);
          return;
        }

        this._edgeData.push({
          source: step.id,
          dest: destId,
          label: label,
          sourceElement: action
        });
      });
    });

    // Find root nodes (nodes with no incoming edges)
    const hasIncoming = new Set(this._edgeData.map(e => e.dest));
    const roots = [];
    this._nodeData.forEach((_, id) => {
      if (!hasIncoming.has(id)) {
        roots.push(id);
      }
    });

    // If no roots found (pure cycle), use first node
    if (roots.length === 0 && this._nodeData.size > 0) {
      roots.push(this._nodeData.keys().next().value);
    }

    this._graphData = {
      nodes: this._nodeData,
      edges: this._edgeData,
      roots: roots
    };
  }

  _computeLayout() {
    console.time('journey-layout');
    const layout = new JourneyLayout({
      rankSep: this.options.layout.rankSep,
      nodeSep: this.options.layout.nodeSep,
      edgeSpacing: this.options.layout.edgeSpacing,
      minGutterSize: this.options.layout.minGutterSize
    });

    this._layoutResult = layout.computeLayout(this._graphData);
    console.timeEnd('journey-layout');
  }

  _positionSteps() {
    const { positions, bounds } = this._layoutResult;

    // Calculate padding based on viewport size to allow centering any step
    const viewport = this.container.parentElement;
    let padding = 50; // Minimum padding for aesthetics

    if (viewport) {
      const viewportPadding = Math.max(viewport.clientWidth / 2, viewport.clientHeight / 2);
      padding = Math.max(padding, viewportPadding);
    }

    // Position each step using layout results
    positions.forEach((pos, nodeId) => {
      const nodeData = this._nodeData.get(nodeId);
      if (!nodeData) return;

      const step = nodeData.element;

      // JourneyLayout gives top-left coordinates, add padding
      const x = pos.x + padding;
      const y = pos.y + padding;

      step.style.position = 'absolute';
      step.style.left = `${x}px`;
      step.style.top = `${y}px`;
    });

    const width = bounds.width + padding * 2;
    const height = bounds.height + padding * 2;

    this.container.style.width = `${width}px`;
    this.container.style.height = `${height}px`;
    this.container.style.position = 'relative';

    // Store bounds for arrow drawing
    this.bounds = { ...bounds, padding };
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
    const { edgePaths } = this._layoutResult;
    const padding = this.bounds.padding;

    // Draw each edge path
    edgePaths.forEach(edge => {
      if (!edge.points || edge.points.length < 2) return;

      // Build SVG path from computed points, offset by padding
      const pathData = edge.points
        .map((point, i) => {
          const x = point.x + padding;
          const y = point.y + padding;
          return `${i === 0 ? 'M' : 'L'} ${x} ${y}`;
        })
        .join(' ');

      // Create arrow path
      const path = document.createElementNS('http://www.w3.org/2000/svg', 'path');
      path.setAttribute('d', pathData);
      path.setAttribute('class', 'journey-arrow' + (edge.isBackRef ? ' back-ref' : ''));
      path.setAttribute('marker-end', 'url(#arrowhead)');
      path.setAttribute('fill', 'none');
      path.setAttribute('stroke', this.options.arrows.color);
      path.setAttribute('stroke-width', this.options.arrows.width);

      // Style back-references differently
      if (edge.isBackRef) {
        path.setAttribute('stroke-dasharray', '5,3');
      }

      this.svgOverlay.appendChild(path);

      // Draw label if present (using pre-computed labelPoint)
      if (this.options.arrows.showLabels && edge.label && edge.labelPoint) {
        const labelX = edge.labelPoint.x + padding;
        const labelY = edge.labelPoint.y + padding;
        const bbox = { width: edge.label.length * 7, height: 16 };

        // Add white background for readability
        const bgRect = document.createElementNS('http://www.w3.org/2000/svg', 'rect');
        bgRect.setAttribute('x', labelX - bbox.width / 2 - 4);
        bgRect.setAttribute('y', labelY - bbox.height / 2 - 2);
        bgRect.setAttribute('width', bbox.width + 8);
        bgRect.setAttribute('height', bbox.height + 4);
        bgRect.setAttribute('fill', 'white');
        bgRect.setAttribute('stroke', '#ccc');
        bgRect.setAttribute('stroke-width', '1');
        bgRect.setAttribute('rx', '3');

        const text = document.createElementNS('http://www.w3.org/2000/svg', 'text');
        text.setAttribute('x', labelX);
        text.setAttribute('y', labelY);
        text.setAttribute('class', 'arrow-label');
        text.setAttribute('text-anchor', 'middle');
        text.setAttribute('dominant-baseline', 'middle');
        text.setAttribute('fill', this.options.arrows.color);
        text.setAttribute('font-size', '12px');
        text.setAttribute('font-family', 'system-ui, sans-serif');
        text.textContent = edge.label;

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
    // Check for URL fragment first
    const urlFragment = this._getUrlFragment();
    let targetStep = null;

    if (urlFragment) {
      // Try to find step matching the URL fragment
      const fragmentStep = document.getElementById(urlFragment);
      if (fragmentStep && this.steps.includes(fragmentStep)) {
        targetStep = fragmentStep;
      }
    }

    // Fall back to start step if no valid fragment
    if (!targetStep) {
      targetStep = this._findStartStep();
    }

    if (!targetStep || !this.zoomPanController) {
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
    const stepCenterX = targetStep.offsetLeft + targetStep.offsetWidth / 2;
    const stepTopY = targetStep.offsetTop;

    // Calculate target pan to center horizontally and position 20px from top vertically
    const targetX = (viewport.clientWidth / 2) - (stepCenterX * scale);
    const targetY = 20 - (stepTopY * scale);

    // Apply pan
    this.zoomPanController.pan(targetX, targetY, { animate: false });

    // Add highlight to starting step
    targetStep.classList.add('journey-step-current');
  }

  _getUrlFragment() {
    // Get URL fragment without the # prefix
    // Parse format: #step:step-2 → step-2
    // This prevents browser from auto-scrolling to element with matching id
    const hash = window.location.hash;
    if (!hash) return '';

    const hashValue = hash.substring(1);

    // New format: step:step-id
    if (hashValue.startsWith('step:')) {
      return hashValue.substring(5); // Remove 'step:' prefix
    }

    // Backward compatibility: support old format without prefix
    // This allows existing bookmarks to continue working
    return hashValue;
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
    const stepTopY = step.offsetTop;

    // Calculate target pan to center horizontally and position 20px from top vertically
    const targetX = (viewport.clientWidth / 2) - (stepCenterX * scale);
    const targetY = 20 - (stepTopY * scale);

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

    // Update URL fragment with step: prefix
    // This prevents browser from auto-scrolling to element with matching id
    if (window.history && window.history.replaceState) {
      window.history.replaceState(null, '', `#step:${stepId}`);
    } else {
      window.location.hash = `step:${stepId}`;
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

      // Set currentStep based on URL fragment or start step
      const urlFragment = this._getUrlFragment();
      if (urlFragment) {
        const fragmentStep = document.getElementById(urlFragment);
        if (fragmentStep && this.steps.includes(fragmentStep)) {
          this.currentStep = fragmentStep.id;
        } else {
          this.currentStep = this._findStartStep().id;
        }
      } else {
        this.currentStep = this._findStartStep().id;
      }

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
