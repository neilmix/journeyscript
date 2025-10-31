#!/usr/bin/env node

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { parseMarkdown, generateHTML } from './journey-builder.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Parse command line arguments
function parseArgs(args) {
  const result = {
    inputPath: null,
    outputPath: null,
    useStdin: false
  };

  for (let i = 0; i < args.length; i++) {
    if (args[i] === '-o' || args[i] === '--output') {
      if (i + 1 >= args.length) {
        console.error('Error: -o flag requires an output file path');
        process.exit(1);
      }
      result.outputPath = path.resolve(args[i + 1]);
      i++; // Skip next arg since we consumed it
    } else if (!result.inputPath) {
      result.inputPath = path.resolve(args[i]);
    } else {
      console.error(`Error: Unexpected argument: ${args[i]}`);
      process.exit(1);
    }
  }

  // If no input path specified, use stdin
  if (!result.inputPath) {
    result.useStdin = true;
  }

  return result;
}

// Read from stdin
async function readStdin() {
  return new Promise((resolve, reject) => {
    let data = '';

    process.stdin.setEncoding('utf-8');

    process.stdin.on('data', chunk => {
      data += chunk;
    });

    process.stdin.on('end', () => {
      resolve(data);
    });

    process.stdin.on('error', err => {
      reject(err);
    });
  });
}

// Main function
async function main() {
  const args = process.argv.slice(2);

  // Parse arguments
  const config = parseArgs(args);

  let markdown;
  let inputPath = config.inputPath;

  if (config.useStdin) {
    // Read from stdin
    try {
      markdown = await readStdin();
      if (!markdown.trim()) {
        console.error('Error: No input provided via stdin');
        process.exit(1);
      }
    } catch (err) {
      console.error(`Error reading from stdin: ${err.message}`);
      process.exit(1);
    }
  } else {
    // Read from file
    if (!fs.existsSync(inputPath)) {
      console.error(`Error: File not found: ${inputPath}`);
      process.exit(1);
    }
    markdown = fs.readFileSync(inputPath, 'utf-8');
  }

  // Parse markdown
  const { steps, stepNames, htmlTitle, preamble } = parseMarkdown(markdown);

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
  const html = generateHTML(steps, stepNames, htmlTitle, cssContent, jsContent, preamble);

  // Determine output path
  let outputPath = config.outputPath;

  if (!outputPath) {
    if (config.useStdin) {
      // If reading from stdin and no output specified, write to stdout
      process.stdout.write(html);
      return;
    } else {
      // Default: replace .md with .html
      outputPath = inputPath.replace(/\.md$/, '.html');
    }
  }

  // Write output to file
  fs.writeFileSync(outputPath, html, 'utf-8');

  console.log(`✓ Generated: ${outputPath}`);
}

main().catch(err => {
  console.error(`Error: ${err.message}`);
  process.exit(1);
});
