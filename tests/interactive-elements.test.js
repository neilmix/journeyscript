// tests/interactive-elements.test.js
import { describe, it, expect, beforeEach } from 'vitest';
import { ZoomPanController } from '../src/ZoomPanController.js';

describe('Interactive Elements', () => {
  let container, viewport, controller;

  beforeEach(() => {
    document.body.innerHTML = `
      <div id="viewport" style="width: 800px; height: 600px;">
        <div id="container" style="width: 1000px; height: 1000px;">
          <select id="test-select">
            <option value="1">Option 1</option>
            <option value="2">Option 2</option>
          </select>
          <input id="test-input" type="text" value="test" />
          <textarea id="test-textarea">content</textarea>
          <button id="test-button">Click me</button>
          <a id="test-link" href="#test">Link</a>
          <div id="test-div">Regular div</div>
          <div id="editable-div" contenteditable="true">Editable</div>
        </div>
      </div>
    `;

    viewport = document.getElementById('viewport');
    container = document.getElementById('container');
    controller = new ZoomPanController(container, viewport);
  });

  describe('pointerdown events on interactive elements', () => {
    it('should not preventDefault on select elements', () => {
      const select = document.getElementById('test-select');
      const event = new MouseEvent('pointerdown', {
        bubbles: true,
        cancelable: true,
        button: 0,
        clientX: 100,
        clientY: 100
      });

      const preventDefaultSpy = { called: false };
      const originalPreventDefault = event.preventDefault;
      event.preventDefault = function() {
        preventDefaultSpy.called = true;
        originalPreventDefault.call(this);
      };

      select.dispatchEvent(event);

      // The event should NOT have preventDefault called on it
      // because select elements need default behavior to open
      expect(preventDefaultSpy.called).toBe(false);
      expect(controller.isDragging).toBe(false);
    });

    it('should not preventDefault on input elements', () => {
      const input = document.getElementById('test-input');
      const event = new MouseEvent('pointerdown', {
        bubbles: true,
        cancelable: true,
        button: 0,
        clientX: 100,
        clientY: 100
      });

      const preventDefaultSpy = { called: false };
      const originalPreventDefault = event.preventDefault;
      event.preventDefault = function() {
        preventDefaultSpy.called = true;
        originalPreventDefault.call(this);
      };

      input.dispatchEvent(event);

      expect(preventDefaultSpy.called).toBe(false);
      expect(controller.isDragging).toBe(false);
    });

    it('should not preventDefault on textarea elements', () => {
      const textarea = document.getElementById('test-textarea');
      const event = new MouseEvent('pointerdown', {
        bubbles: true,
        cancelable: true,
        button: 0,
        clientX: 100,
        clientY: 100
      });

      const preventDefaultSpy = { called: false };
      const originalPreventDefault = event.preventDefault;
      event.preventDefault = function() {
        preventDefaultSpy.called = true;
        originalPreventDefault.call(this);
      };

      textarea.dispatchEvent(event);

      expect(preventDefaultSpy.called).toBe(false);
      expect(controller.isDragging).toBe(false);
    });

    it('should not preventDefault on button elements', () => {
      const button = document.getElementById('test-button');
      const event = new MouseEvent('pointerdown', {
        bubbles: true,
        cancelable: true,
        button: 0,
        clientX: 100,
        clientY: 100
      });

      const preventDefaultSpy = { called: false };
      const originalPreventDefault = event.preventDefault;
      event.preventDefault = function() {
        preventDefaultSpy.called = true;
        originalPreventDefault.call(this);
      };

      button.dispatchEvent(event);

      expect(preventDefaultSpy.called).toBe(false);
      expect(controller.isDragging).toBe(false);
    });

    it('should not preventDefault on link elements', () => {
      const link = document.getElementById('test-link');
      const event = new MouseEvent('pointerdown', {
        bubbles: true,
        cancelable: true,
        button: 0,
        clientX: 100,
        clientY: 100
      });

      const preventDefaultSpy = { called: false };
      const originalPreventDefault = event.preventDefault;
      event.preventDefault = function() {
        preventDefaultSpy.called = true;
        originalPreventDefault.call(this);
      };

      link.dispatchEvent(event);

      expect(preventDefaultSpy.called).toBe(false);
      expect(controller.isDragging).toBe(false);
    });

    it('should not preventDefault on contenteditable elements', () => {
      const editableDiv = document.getElementById('editable-div');
      const event = new MouseEvent('pointerdown', {
        bubbles: true,
        cancelable: true,
        button: 0,
        clientX: 100,
        clientY: 100
      });

      const preventDefaultSpy = { called: false };
      const originalPreventDefault = event.preventDefault;
      event.preventDefault = function() {
        preventDefaultSpy.called = true;
        originalPreventDefault.call(this);
      };

      editableDiv.dispatchEvent(event);

      expect(preventDefaultSpy.called).toBe(false);
      expect(controller.isDragging).toBe(false);
    });

    it('should preventDefault and start dragging on non-interactive elements', () => {
      const div = document.getElementById('test-div');
      const event = new MouseEvent('pointerdown', {
        bubbles: true,
        cancelable: true,
        button: 0,
        clientX: 100,
        clientY: 100
      });

      const preventDefaultSpy = { called: false };
      const originalPreventDefault = event.preventDefault;
      event.preventDefault = function() {
        preventDefaultSpy.called = true;
        originalPreventDefault.call(this);
      };

      div.dispatchEvent(event);

      // Regular divs SHOULD trigger drag and preventDefault
      expect(preventDefaultSpy.called).toBe(true);
      expect(controller.isDragging).toBe(true);
    });

    it('should preventDefault and start dragging on container itself', () => {
      const event = new MouseEvent('pointerdown', {
        bubbles: true,
        cancelable: true,
        button: 0,
        clientX: 100,
        clientY: 100
      });

      const preventDefaultSpy = { called: false };
      const originalPreventDefault = event.preventDefault;
      event.preventDefault = function() {
        preventDefaultSpy.called = true;
        originalPreventDefault.call(this);
      };

      container.dispatchEvent(event);

      expect(preventDefaultSpy.called).toBe(true);
      expect(controller.isDragging).toBe(true);
    });
  });

  describe('elements with data-dest attribute (navigation buttons)', () => {
    it('should not start dragging on elements with data-dest', () => {
      // Add a navigation button
      container.innerHTML += '<button id="nav-button" data-dest="step2">Go to Step 2</button>';

      const navButton = document.getElementById('nav-button');
      const event = new MouseEvent('pointerdown', {
        bubbles: true,
        cancelable: true,
        button: 0,
        clientX: 100,
        clientY: 100
      });

      const preventDefaultSpy = { called: false };
      const originalPreventDefault = event.preventDefault;
      event.preventDefault = function() {
        preventDefaultSpy.called = true;
        originalPreventDefault.call(this);
      };

      navButton.dispatchEvent(event);

      expect(preventDefaultSpy.called).toBe(false);
      expect(controller.isDragging).toBe(false);
    });
  });
});
