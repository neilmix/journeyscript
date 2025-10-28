import { describe, it, expect, beforeEach, vi } from 'vitest';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import {
  slugify,
  isExternalUrl,
  parseMarkdown,
  renderStepContent,
  generateHTML
} from '../../tools/journey-builder.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

describe('slugify', () => {
  it('should convert text to lowercase kebab-case', () => {
    expect(slugify('Hello World')).toBe('hello-world');
    expect(slugify('Step 2')).toBe('step-2');
    expect(slugify('Landing Page')).toBe('landing-page');
  });

  it('should handle special characters', () => {
    expect(slugify('Step #1!')).toBe('step-1');
    expect(slugify('User@Login')).toBe('userlogin');
    expect(slugify('A & B')).toBe('a-b');
  });

  it('should trim leading and trailing spaces and hyphens', () => {
    expect(slugify('  hello  ')).toBe('hello');
    expect(slugify('--hello--')).toBe('hello');
  });

  it('should handle underscores', () => {
    expect(slugify('hello_world')).toBe('hello-world');
    expect(slugify('step_2')).toBe('step-2');
  });

  it('should handle multiple spaces', () => {
    expect(slugify('hello    world')).toBe('hello-world');
  });

  it('should handle empty string', () => {
    expect(slugify('')).toBe('');
  });
});

describe('isExternalUrl', () => {
  it('should return true for http URLs', () => {
    expect(isExternalUrl('http://example.com')).toBe(true);
    expect(isExternalUrl('http://example.com/path')).toBe(true);
  });

  it('should return true for https URLs', () => {
    expect(isExternalUrl('https://example.com')).toBe(true);
    expect(isExternalUrl('https://docs.example.com/guide')).toBe(true);
  });

  it('should return false for relative paths', () => {
    expect(isExternalUrl('Step 2')).toBe(false);
    expect(isExternalUrl('welcome')).toBe(false);
    expect(isExternalUrl('landing-page')).toBe(false);
  });

  it('should return false for special characters', () => {
    expect(isExternalUrl('Step #2')).toBe(false);
  });

  it('should return true for other protocols', () => {
    expect(isExternalUrl('ftp://example.com')).toBe(true);
    expect(isExternalUrl('mailto:test@example.com')).toBe(true);
  });
});

describe('parseMarkdown', () => {
  it('should parse markdown with multiple headings', () => {
    const markdown = `## Welcome

This is content.

## Step 2

More content.`;

    const { steps, stepNames, htmlTitle } = parseMarkdown(markdown);

    expect(steps).toHaveLength(2);
    expect(steps[0]).toMatchObject({
      id: 'welcome',
      title: 'Welcome',
      content: 'This is content.',
      isFirst: true
    });
    expect(steps[1]).toMatchObject({
      id: 'step-2',
      title: 'Step 2',
      content: 'More content.',
      isFirst: false
    });
    expect(htmlTitle).toBe('Welcome');
  });

  it('should handle different heading levels', () => {
    const markdown = `# Title

## Step One

### Substep

#### Deep Step`;

    const { steps } = parseMarkdown(markdown);

    expect(steps).toHaveLength(4);
    expect(steps[0].title).toBe('Title');
    expect(steps[1].title).toBe('Step One');
    expect(steps[2].title).toBe('Substep');
    expect(steps[3].title).toBe('Deep Step');
  });

  it('should build stepNames map correctly', () => {
    const markdown = `## Welcome

## Step 2

## Complete`;

    const { stepNames } = parseMarkdown(markdown);

    expect(stepNames.get('Welcome')).toBe('welcome');
    expect(stepNames.get('Step 2')).toBe('step-2');
    expect(stepNames.get('Complete')).toBe('complete');
  });

  it('should mark first step with isFirst', () => {
    const markdown = `## First

## Second

## Third`;

    const { steps } = parseMarkdown(markdown);

    expect(steps[0].isFirst).toBe(true);
    expect(steps[1].isFirst).toBe(false);
    expect(steps[2].isFirst).toBe(false);
  });

  it('should handle empty content', () => {
    const markdown = `## Step 1

## Step 2`;

    const { steps } = parseMarkdown(markdown);

    expect(steps[0].content).toBe('');
    expect(steps[1].content).toBe('');
  });

  it('should handle markdown with no headings', () => {
    const markdown = 'Just some text without headings.';

    const { steps, htmlTitle } = parseMarkdown(markdown);

    expect(steps).toHaveLength(0);
    expect(htmlTitle).toBe('Journey');
  });

  it('should warn on duplicate step names', () => {
    const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});

    const markdown = `## Step

## Step`;

    parseMarkdown(markdown);

    expect(warnSpy).toHaveBeenCalledWith('Warning: Duplicate step name "Step". Links will target the first occurrence.');

    warnSpy.mockRestore();
  });
});

describe('renderStepContent', () => {
  it('should convert markdown to HTML', () => {
    const stepNames = new Map([['Step 2', 'step-2']]);
    const markdown = 'This is **bold** and this is *italic*.';

    const html = renderStepContent(markdown, stepNames);

    expect(html).toContain('<strong>bold</strong>');
    expect(html).toContain('<em>italic</em>');
  });

  it('should convert internal links to buttons', () => {
    const stepNames = new Map([
      ['Welcome', 'welcome'],
      ['Step 2', 'step-2']
    ]);
    const markdown = '[Get Started](Step 2)';

    const html = renderStepContent(markdown, stepNames);

    expect(html).toContain('<button data-dest="step-2">Get Started</button>');
  });

  it('should keep external links as links', () => {
    const stepNames = new Map();
    const markdown = '[Visit Docs](https://example.com)';

    const html = renderStepContent(markdown, stepNames);

    expect(html).toContain('<a href="https://example.com"');
    expect(html).toContain('Visit Docs');
    expect(html).not.toContain('<button');
  });

  it('should handle multiple buttons on same line', () => {
    const stepNames = new Map([
      ['Welcome', 'welcome'],
      ['Complete', 'complete']
    ]);
    const markdown = '[Continue](Complete) [Go Back](Welcome)';

    const html = renderStepContent(markdown, stepNames);

    expect(html).toContain('<button data-dest="complete">Continue</button>');
    expect(html).toContain('<button data-dest="welcome">Go Back</button>');
  });

  it('should warn on broken links and create no-op button', () => {
    const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});

    const stepNames = new Map([['Welcome', 'welcome']]);
    const markdown = '[Next](Nonexistent)';

    const html = renderStepContent(markdown, stepNames);

    expect(warnSpy).toHaveBeenCalledWith('Warning: Link target "Nonexistent" does not match any step. Creating no-op button.');
    expect(html).toContain('<button>Next</button>');
    expect(html).not.toContain('data-dest');

    warnSpy.mockRestore();
  });

  it('should handle mixed content with buttons and regular text', () => {
    const stepNames = new Map([['Step 2', 'step-2']]);
    const markdown = `Some text here.

[Continue](Step 2)

More text.`;

    const html = renderStepContent(markdown, stepNames);

    expect(html).toContain('Some text here');
    expect(html).toContain('<button data-dest="step-2">Continue</button>');
    expect(html).toContain('More text');
  });
});

describe('generateHTML', () => {
  it('should generate valid HTML structure', () => {
    const steps = [
      { id: 'welcome', title: 'Welcome', content: 'Hello', isFirst: true }
    ];
    const stepNames = new Map([['Welcome', 'welcome']]);
    const html = generateHTML(steps, stepNames, 'Test Journey', 'body{}', '//js');

    expect(html).toContain('<!DOCTYPE html>');
    expect(html).toContain('<html lang="en">');
    expect(html).toContain('<title>Test Journey - Journey Visualizer</title>');
    expect(html).toContain('body{}');
    expect(html).toContain('//js');
  });

  it('should include all steps in output', () => {
    const steps = [
      { id: 'step1', title: 'Step 1', content: 'Content 1', isFirst: true },
      { id: 'step2', title: 'Step 2', content: 'Content 2', isFirst: false },
      { id: 'step3', title: 'Step 3', content: 'Content 3', isFirst: false }
    ];
    const stepNames = new Map();
    const html = generateHTML(steps, stepNames, 'Test', '', '');

    expect(html).toContain('id="step1"');
    expect(html).toContain('id="step2"');
    expect(html).toContain('id="step3"');
    expect(html).toContain('<h2>Step 1</h2>');
    expect(html).toContain('<h2>Step 2</h2>');
    expect(html).toContain('<h2>Step 3</h2>');
  });

  it('should mark first step with data-place="start"', () => {
    const steps = [
      { id: 'welcome', title: 'Welcome', content: '', isFirst: true },
      { id: 'next', title: 'Next', content: '', isFirst: false }
    ];
    const stepNames = new Map();
    const html = generateHTML(steps, stepNames, 'Test', '', '');

    expect(html).toContain('id="welcome" data-place="start"');
    expect(html).toMatch(/id="next"[^>]*>/);
    expect(html).not.toContain('id="next" data-place="start"');
  });

  it('should include CDN script tags', () => {
    const steps = [{ id: 'test', title: 'Test', content: '', isFirst: true }];
    const stepNames = new Map();
    const html = generateHTML(steps, stepNames, 'Test', '', '');

    expect(html).toContain('https://unpkg.com/dagre@0.8.5/dist/dagre.min.js');
    expect(html).toContain('https://unpkg.com/@panzoom/panzoom@4.5.1/dist/panzoom.min.js');
  });

  it('should include visualizer initialization', () => {
    const steps = [{ id: 'test', title: 'Test', content: '', isFirst: true }];
    const stepNames = new Map();
    const html = generateHTML(steps, stepNames, 'Test', '', '');

    expect(html).toContain('new JourneyVisualizer.JourneyVisualizer');
    expect(html).toContain('.init()');
  });
});

describe('Integration tests - simple.md', () => {
  let simpleMarkdown;

  beforeEach(() => {
    const examplesPath = path.resolve(__dirname, '../../examples/simple.md');
    simpleMarkdown = fs.readFileSync(examplesPath, 'utf-8');
  });

  it('should parse simple.md correctly', () => {
    const { steps, stepNames, htmlTitle } = parseMarkdown(simpleMarkdown);

    expect(steps).toHaveLength(3);
    expect(htmlTitle).toBe('Welcome');

    // Check step IDs
    expect(steps[0].id).toBe('welcome');
    expect(steps[1].id).toBe('step-2');
    expect(steps[2].id).toBe('complete');

    // Check step titles
    expect(steps[0].title).toBe('Welcome');
    expect(steps[1].title).toBe('Step 2');
    expect(steps[2].title).toBe('Complete');

    // Check first step marked
    expect(steps[0].isFirst).toBe(true);
    expect(steps[1].isFirst).toBe(false);
    expect(steps[2].isFirst).toBe(false);
  });

  it('should generate HTML with correct structure for simple.md', () => {
    const { steps, stepNames, htmlTitle } = parseMarkdown(simpleMarkdown);
    const html = generateHTML(steps, stepNames, htmlTitle, 'body{}', '//test');

    // Check title
    expect(html).toContain('<title>Welcome - Journey Visualizer</title>');

    // Check steps are present
    expect(html).toContain('id="welcome" data-place="start"');
    expect(html).toContain('id="step-2"');
    expect(html).toContain('id="complete"');

    // Check content
    expect(html).toContain('This is the starting point of your journey');
    expect(html).toContain("You're making <strong>progress</strong>!");
    expect(html).toContain("You've reached the end");
  });

  it('should generate correct buttons for simple.md', () => {
    const { steps, stepNames, htmlTitle } = parseMarkdown(simpleMarkdown);
    const html = generateHTML(steps, stepNames, htmlTitle, '', '');

    // Welcome -> Step 2
    expect(html).toContain('<button data-dest="step-2">Get Started</button>');

    // Step 2 -> Complete and back to Welcome
    expect(html).toContain('<button data-dest="complete">Continue</button>');
    expect(html).toContain('<button data-dest="welcome">Go Back</button>');

    // Complete -> Welcome
    expect(html).toContain('<button data-dest="welcome">Restart</button>');
  });
});

describe('Integration tests - branching.md', () => {
  let branchingMarkdown;

  beforeEach(() => {
    const examplesPath = path.resolve(__dirname, '../../examples/branching.md');
    branchingMarkdown = fs.readFileSync(examplesPath, 'utf-8');
  });

  it('should parse branching.md correctly', () => {
    const { steps, stepNames, htmlTitle } = parseMarkdown(branchingMarkdown);

    expect(steps).toHaveLength(9);
    expect(htmlTitle).toBe('Branching Journey');

    // Check key step IDs
    expect(steps.find(s => s.id === 'branching-journey')).toBeDefined();
    expect(steps.find(s => s.id === 'landing-page')).toBeDefined();
    expect(steps.find(s => s.id === 'sign-up')).toBeDefined();
    expect(steps.find(s => s.id === 'log-in')).toBeDefined();
    expect(steps.find(s => s.id === 'dashboard')).toBeDefined();
  });

  it('should generate HTML with all steps for branching.md', () => {
    const { steps, stepNames, htmlTitle } = parseMarkdown(branchingMarkdown);
    const html = generateHTML(steps, stepNames, htmlTitle, '', '');

    // Check all major steps are present
    expect(html).toContain('id="branching-journey"');
    expect(html).toContain('id="landing-page"');
    expect(html).toContain('id="sign-up"');
    expect(html).toContain('id="log-in"');
    expect(html).toContain('id="email-verification"');
    expect(html).toContain('id="reset-password"');
    expect(html).toContain('id="dashboard"');
    expect(html).toContain('id="profile"');
    expect(html).toContain('id="settings"');
  });

  it('should generate correct branching buttons for branching.md', () => {
    const { steps, stepNames, htmlTitle } = parseMarkdown(branchingMarkdown);
    const html = generateHTML(steps, stepNames, htmlTitle, '', '');

    // Landing page branches
    expect(html).toContain('<button data-dest="sign-up">Sign Up</button>');
    expect(html).toContain('<button data-dest="log-in">Log In</button>');

    // Sign up flow
    expect(html).toContain('<button data-dest="email-verification">Submit</button>');
    expect(html).toContain('<button data-dest="landing-page">Cancel</button>');

    // Dashboard branches
    expect(html).toContain('<button data-dest="profile">Profile</button>');
    expect(html).toContain('<button data-dest="settings">Settings</button>');
  });

  it('should count exact number of steps', () => {
    const { steps } = parseMarkdown(branchingMarkdown);

    const expectedSteps = [
      'Branching Journey',
      'Landing Page',
      'Sign Up',
      'Log In',
      'Email Verification',
      'Reset Password',
      'Dashboard',
      'Profile',
      'Settings'
    ];

    expect(steps).toHaveLength(expectedSteps.length);
    expect(steps.map(s => s.title)).toEqual(expectedSteps);
  });
});
