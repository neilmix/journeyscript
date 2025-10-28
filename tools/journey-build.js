#!/usr/bin/env node

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { parseMarkdown, generateHTML } from './journey-builder.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Main function
function main() {
  const args = process.argv.slice(2);

  if (args.length === 0) {
    console.error('Usage: journey-build <input.md>');
    console.error('Creates <input.html> in the same directory');
    process.exit(1);
  }

  const inputPath = path.resolve(args[0]);

  if (!fs.existsSync(inputPath)) {
    console.error(`Error: File not found: ${inputPath}`);
    process.exit(1);
  }

  // Read input markdown
  const markdown = fs.readFileSync(inputPath, 'utf-8');

  // Parse markdown
  const { steps, stepNames, htmlTitle } = parseMarkdown(markdown);

  if (steps.length === 0) {
    console.error('Error: No headings found in markdown file');
    process.exit(1);
  }

  console.log(`Found ${steps.length} steps`);

  // Read CSS and JS assets
  const projectRoot = path.resolve(__dirname, '..');
  const cssPath = path.join(projectRoot, 'examples', 'styles.css');
  const jsPath = path.join(projectRoot, 'dist', 'journey-visualizer.umd.js');

  if (!fs.existsSync(cssPath)) {
    console.error(`Error: CSS file not found: ${cssPath}`);
    process.exit(1);
  }

  if (!fs.existsSync(jsPath)) {
    console.error(`Error: JS file not found: ${jsPath}`);
    console.error('Run "npm run build" first to generate the UMD bundle');
    process.exit(1);
  }

  const cssContent = fs.readFileSync(cssPath, 'utf-8');
  const jsContent = fs.readFileSync(jsPath, 'utf-8');

  // Generate HTML
  const html = generateHTML(steps, stepNames, htmlTitle, cssContent, jsContent);

  // Write output
  const outputPath = inputPath.replace(/\.md$/, '.html');
  fs.writeFileSync(outputPath, html, 'utf-8');

  console.log(`✓ Generated: ${outputPath}`);
}

main();
