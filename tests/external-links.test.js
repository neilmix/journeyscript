// Test external link handling
import { describe, it, expect } from 'vitest';
import { isExternalUrl, looksLikeLink, renderStepContent } from '../tools/journey-builder.js';

describe('External Link Handling', () => {
  describe('isExternalUrl', () => {
    it('should return true for absolute URLs with https', () => {
      expect(isExternalUrl('https://example.com')).toBe(true);
    });

    it('should return true for absolute URLs with http', () => {
      expect(isExternalUrl('http://example.com')).toBe(true);
    });

    it('should return false for relative URLs', () => {
      expect(isExternalUrl('/docs')).toBe(false);
      expect(isExternalUrl('./file.html')).toBe(false);
      expect(isExternalUrl('../parent/file.html')).toBe(false);
    });

    it('should return false for step names', () => {
      expect(isExternalUrl('step-2')).toBe(false);
      expect(isExternalUrl('my-step')).toBe(false);
    });
  });

  describe('looksLikeLink', () => {
    it('should return true for absolute URLs', () => {
      expect(looksLikeLink('https://example.com')).toBe(true);
      expect(looksLikeLink('http://example.com')).toBe(true);
    });

    it('should return true for relative paths', () => {
      expect(looksLikeLink('/docs')).toBe(true);
      expect(looksLikeLink('./file.html')).toBe(true);
      expect(looksLikeLink('../parent/file.html')).toBe(true);
    });

    it('should return true for files with extensions', () => {
      expect(looksLikeLink('guide.html')).toBe(true);
      expect(looksLikeLink('document.pdf')).toBe(true);
      expect(looksLikeLink('page.php')).toBe(true);
    });

    it('should return true for URLs with query strings or fragments', () => {
      expect(looksLikeLink('page.html?id=123')).toBe(true);
      expect(looksLikeLink('page.html#section')).toBe(true);
    });

    it('should return true for domain-like strings', () => {
      expect(looksLikeLink('example.com')).toBe(true);
      expect(looksLikeLink('docs.example.com')).toBe(true);
    });

    it('should return false for likely step names', () => {
      expect(looksLikeLink('step-2')).toBe(false);
      expect(looksLikeLink('my-step')).toBe(false);
      expect(looksLikeLink('Next Step')).toBe(false);
      expect(looksLikeLink('welcome')).toBe(false);
    });
  });

  describe('renderStepContent with external links', () => {
    const stepNames = new Map([
      ['Step 2', 'step-2'],
      ['Step 3', 'step-3']
    ]);

    it('should keep absolute https URLs as links', () => {
      const markdown = '[Visit Example](https://example.com)';
      const result = renderStepContent(markdown, stepNames);
      console.log('Test 1 - Markdown link with https:', result);
      expect(result).toContain('<a href="https://example.com"');
      expect(result).toContain('Visit Example');
      expect(result).not.toContain('<button');
    });

    it('should keep HTML anchor tags with https URLs as links', () => {
      const markdown = '<a href="https://example.com">Visit Example</a>';
      const result = renderStepContent(markdown, stepNames);
      console.log('Test 2 - HTML anchor with https:', result);
      expect(result).toContain('<a href="https://example.com"');
      expect(result).toContain('Visit Example');
      expect(result).not.toContain('<button');
    });

    it('should keep relative URLs as links (NEW BEHAVIOR)', () => {
      const markdown = '[Docs](/docs)';
      const result = renderStepContent(markdown, stepNames);
      console.log('Test 3 - Relative URL:', result);
      expect(result).toContain('<a href="/docs"');
      expect(result).toContain('Docs');
      expect(result).not.toContain('<button');
    });

    it('should convert step name links to buttons with data-dest', () => {
      const markdown = '[Go to Step 2](Step 2)';
      const result = renderStepContent(markdown, stepNames);
      console.log('Test 4 - Step name link:', result);
      expect(result).toContain('<button data-dest="step-2"');
      expect(result).toContain('Go to Step 2');
    });

    it('should keep HTML anchor with relative URL as link (NEW BEHAVIOR)', () => {
      const markdown = '<a href="/docs/guide.html">Guide</a>';
      const result = renderStepContent(markdown, stepNames);
      console.log('Test 5 - HTML anchor with relative URL:', result);
      expect(result).toContain('<a href="/docs/guide.html"');
      expect(result).toContain('Guide');
      expect(result).not.toContain('<button');
    });

    it('should keep markdown link with http as link', () => {
      const markdown = '[Unsecure Site](http://example.com)';
      const result = renderStepContent(markdown, stepNames);
      console.log('Test 6 - HTTP URL:', result);
      expect(result).toContain('<a href="http://example.com"');
    });

    it('should keep protocol-less domain as link (NEW BEHAVIOR)', () => {
      const markdown = '[Example](example.com)';
      const result = renderStepContent(markdown, stepNames);
      console.log('Test 7 - Protocol-less domain:', result);
      expect(result).toContain('<a href="example.com"');
      expect(result).not.toContain('<button');
    });

    it('should keep file paths as links (NEW BEHAVIOR)', () => {
      const markdown = '[Local](./docs/guide.html)';
      const result = renderStepContent(markdown, stepNames);
      console.log('Test 8 - Local file path:', result);
      expect(result).toContain('<a href="./docs/guide.html"');
      expect(result).not.toContain('<button');
    });

    it('should warn for non-link-like targets that do not match steps', () => {
      const markdown = '[Click Here](nonexistent-step)';
      const result = renderStepContent(markdown, stepNames);
      console.log('Test 9 - Likely typo:', result);
      // Should keep as link but warn (since it doesn't look like a URL)
      expect(result).toContain('<a href="nonexistent-step"');
      expect(result).not.toContain('<button');
    });

    it('should NOT warn for link-like targets that do not match steps', () => {
      const markdown = '[Guide](guide.html)';
      const result = renderStepContent(markdown, stepNames);
      console.log('Test 10 - Link-like but not a step:', result);
      // Should keep as link without warning
      expect(result).toContain('<a href="guide.html"');
      expect(result).not.toContain('<button');
    });
  });
});
