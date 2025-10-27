// tests/svg-overlay.test.js
import { describe, it, expect, beforeEach } from 'vitest';
import { JourneyVisualizer } from '../src/JourneyVisualizer.js';

describe('SVG Overlay', () => {
  beforeEach(() => {
    document.body.innerHTML = `
      <div class="journey-container">
        <div class="step" id="step1" data-place="start">Step 1</div>
      </div>
    `;
  });

  it('should create SVG overlay element', () => {
    const visualizer = new JourneyVisualizer('.journey-container');
    visualizer._createSvgOverlay(800, 600);

    const svg = visualizer.container.querySelector('svg');

    expect(svg).toBeTruthy();
    expect(svg.getAttribute('width')).toBe('800');
    expect(svg.getAttribute('height')).toBe('600');
  });

  it('should set pointer-events to none on SVG', () => {
    const visualizer = new JourneyVisualizer('.journey-container');
    visualizer._createSvgOverlay(800, 600);

    const svg = visualizer.svgOverlay;

    expect(svg.style.pointerEvents).toBe('none');
  });

  it('should create arrowhead marker definition', () => {
    const visualizer = new JourneyVisualizer('.journey-container');
    visualizer._createSvgOverlay(800, 600);

    const marker = visualizer.svgOverlay.querySelector('marker#arrowhead');

    expect(marker).toBeTruthy();
    expect(marker.getAttribute('markerWidth')).toBeTruthy();
  });

  it('should position SVG as absolute overlay', () => {
    const visualizer = new JourneyVisualizer('.journey-container');
    visualizer._createSvgOverlay(800, 600);

    const svg = visualizer.svgOverlay;

    expect(svg.style.position).toBe('absolute');
    expect(svg.style.top).toBe('0px');
    expect(svg.style.left).toBe('0px');
  });
});
