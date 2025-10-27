// src/JourneyVisualizer.js
import dagre from 'dagre';

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
}
