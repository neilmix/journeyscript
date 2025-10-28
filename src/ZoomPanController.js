// src/ZoomPanController.js

/**
 * ZoomPanController: Clean, custom zoom and pan implementation
 *
 * Handles:
 * - Wheel-based zooming with focal point
 * - Drag panning with pointer events
 * - Programmatic zoom/pan API
 *
 * Does NOT handle:
 * - Pinch zoom (not needed for this project)
 * - Containment (we need free positioning)
 */
export class ZoomPanController {
  constructor(element, viewport, options = {}) {
    this.element = element;
    this.viewport = viewport;

    // Options
    this.minScale = options.minScale || 0.1;
    this.maxScale = options.maxScale || 3;
    this.zoomStep = options.step || 0.1;

    // Transform state - single source of truth
    this.scale = 1;
    this.translateX = 0;
    this.translateY = 0;

    // Drag state
    this.isDragging = false;
    this.dragStartX = 0;
    this.dragStartY = 0;
    this.dragStartTranslateX = 0;
    this.dragStartTranslateY = 0;

    // Bind event handlers
    this._handleWheel = this._handleWheel.bind(this);
    this._handlePointerDown = this._handlePointerDown.bind(this);
    this._handlePointerMove = this._handlePointerMove.bind(this);
    this._handlePointerUp = this._handlePointerUp.bind(this);

    // Initialize
    this._attachEventListeners();
    this._applyTransform();
  }

  _attachEventListeners() {
    // Wheel zoom on viewport with capture to ensure we handle it first
    this.viewport.addEventListener('wheel', this._handleWheel, {
      passive: false,
      capture: true
    });

    // Drag panning on element
    this.element.addEventListener('pointerdown', this._handlePointerDown);
    // Move and up on document to handle drag outside element
    document.addEventListener('pointermove', this._handlePointerMove);
    document.addEventListener('pointerup', this._handlePointerUp);
  }

  _handleWheel(event) {
    event.preventDefault();
    event.stopPropagation();

    // Calculate scale change
    const delta = -event.deltaY;
    const scaleChange = delta > 0 ? this.zoomStep : -this.zoomStep;
    const newScale = Math.max(
      this.minScale,
      Math.min(this.maxScale, this.scale + scaleChange)
    );

    // If scale didn't change (hit min/max), do nothing
    if (newScale === this.scale) return;

    // Get focal point in viewport coordinates
    const viewportRect = this.viewport.getBoundingClientRect();
    const focalX = event.clientX - viewportRect.left;
    const focalY = event.clientY - viewportRect.top;

    // Calculate the container point at the focal position
    // Transform from viewport coords to container coords
    const containerX = (focalX - this.translateX) / this.scale;
    const containerY = (focalY - this.translateY) / this.scale;

    // Calculate new translation to keep that point at the focal position
    const newTranslateX = focalX - containerX * newScale;
    const newTranslateY = focalY - containerY * newScale;

    // Update state and apply
    this.scale = newScale;
    this.translateX = newTranslateX;
    this.translateY = newTranslateY;
    this._applyTransform();

    // Dispatch change event
    this._dispatchChangeEvent();
  }

  _handlePointerDown(event) {
    // Only handle primary button (left click / touch)
    if (event.button !== 0) return;

    // Start dragging
    this.isDragging = true;
    this.dragStartX = event.clientX;
    this.dragStartY = event.clientY;
    this.dragStartTranslateX = this.translateX;
    this.dragStartTranslateY = this.translateY;

    // Prevent text selection during drag
    event.preventDefault();

    // Change cursor
    this.element.style.cursor = 'grabbing';
  }

  _handlePointerMove(event) {
    if (!this.isDragging) return;

    // Calculate delta from drag start
    const deltaX = event.clientX - this.dragStartX;
    const deltaY = event.clientY - this.dragStartY;

    // Update translation
    this.translateX = this.dragStartTranslateX + deltaX;
    this.translateY = this.dragStartTranslateY + deltaY;
    this._applyTransform();

    // Dispatch change event
    this._dispatchChangeEvent();
  }

  _handlePointerUp(event) {
    if (!this.isDragging) return;

    this.isDragging = false;
    this.element.style.cursor = 'grab';
  }

  _applyTransform(animate = false) {
    if (animate) {
      this.element.style.transition = 'transform 0.3s ease-in-out';
    }

    this.element.style.transform =
      `matrix(${this.scale}, 0, 0, ${this.scale}, ${this.translateX}, ${this.translateY})`;

    if (animate) {
      // Remove transition after animation completes
      setTimeout(() => {
        this.element.style.transition = '';
      }, 300);
    }
  }

  _dispatchChangeEvent() {
    const event = new CustomEvent('transformchange', {
      detail: {
        scale: this.scale,
        x: this.translateX,
        y: this.translateY
      }
    });
    this.element.dispatchEvent(event);
  }

  // Public API

  /**
   * Get current transform state
   */
  getScale() {
    return this.scale;
  }

  getPan() {
    return { x: this.translateX, y: this.translateY };
  }

  /**
   * Set zoom level
   * @param {number} scale - Target scale
   * @param {Object} options - Options
   * @param {boolean} options.animate - Whether to animate
   * @param {Object} options.focal - Focal point {x, y} in viewport coordinates
   */
  zoom(scale, options = {}) {
    const newScale = Math.max(this.minScale, Math.min(this.maxScale, scale));

    if (options.focal) {
      // Zoom to focal point
      const containerX = (options.focal.x - this.translateX) / this.scale;
      const containerY = (options.focal.y - this.translateY) / this.scale;

      this.translateX = options.focal.x - containerX * newScale;
      this.translateY = options.focal.y - containerY * newScale;
    }

    this.scale = newScale;
    this._applyTransform(options.animate);
    this._dispatchChangeEvent();
  }

  /**
   * Set pan position
   * @param {number} x - X translation
   * @param {number} y - Y translation
   * @param {Object} options - Options
   * @param {boolean} options.animate - Whether to animate
   */
  pan(x, y, options = {}) {
    this.translateX = x;
    this.translateY = y;
    this._applyTransform(options.animate);
    this._dispatchChangeEvent();
  }

  /**
   * Clean up event listeners
   */
  destroy() {
    this.viewport.removeEventListener('wheel', this._handleWheel, { capture: true });
    this.element.removeEventListener('pointerdown', this._handlePointerDown);
    document.removeEventListener('pointermove', this._handlePointerMove);
    document.removeEventListener('pointerup', this._handlePointerUp);
  }
}
