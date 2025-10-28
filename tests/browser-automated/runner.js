// Browser Test Runner
// This runner executes browser tests defined in test files
// It's designed to be executed by Claude using the use_browser MCP tool

export class BrowserTestRunner {
  constructor(useBrowser) {
    this.useBrowser = useBrowser;
    this.results = [];
  }

  // Browser wrapper that matches test expectations
  getBrowserAPI() {
    return {
      navigate: async (url) => {
        return await this.useBrowser('navigate', { payload: url });
      },
      awaitElement: async (selector, timeout) => {
        return await this.useBrowser('await_element', { selector, timeout });
      },
      eval: async (code) => {
        const result = await this.useBrowser('eval', { payload: code });
        // Try to parse as JSON if it looks like JSON
        if (typeof result === 'string' && (result.startsWith('{') || result.startsWith('['))) {
          try {
            return JSON.parse(result);
          } catch (e) {
            return result;
          }
        }
        return result;
      },
      click: async (selector) => {
        return await this.useBrowser('click', { selector });
      },
      type: async (selector, text) => {
        return await this.useBrowser('type', { selector, payload: text });
      }
    };
  }

  async runTest(test) {
    const startTime = Date.now();
    let result;

    try {
      const browser = this.getBrowserAPI();
      result = await test.run(browser);
      result.duration = Date.now() - startTime;
      result.name = test.name;
    } catch (error) {
      result = {
        name: test.name,
        passed: false,
        message: `✗ Error: ${error.message}`,
        duration: Date.now() - startTime,
        error: error.stack
      };
    }

    this.results.push(result);
    return result;
  }

  async runSuite(tests) {
    console.log(`\n=== Running ${tests.length} tests ===\n`);

    for (const test of tests) {
      const result = await this.runTest(test);
      const status = result.passed ? '✓ PASS' : '✗ FAIL';
      console.log(`${status} ${result.name} (${result.duration}ms)`);
      console.log(`  ${result.message}`);
      if (result.error) {
        console.log(`  ${result.error}`);
      }
      console.log();
    }

    return this.getSummary();
  }

  getSummary() {
    const total = this.results.length;
    const passed = this.results.filter(r => r.passed).length;
    const failed = total - passed;
    const totalDuration = this.results.reduce((sum, r) => sum + r.duration, 0);

    return {
      total,
      passed,
      failed,
      duration: totalDuration,
      success: failed === 0,
      results: this.results
    };
  }

  printSummary() {
    const summary = this.getSummary();

    console.log('=== Test Summary ===');
    console.log(`Total:    ${summary.total}`);
    console.log(`Passed:   ${summary.passed} ✓`);
    console.log(`Failed:   ${summary.failed} ${summary.failed > 0 ? '✗' : ''}`);
    console.log(`Duration: ${summary.duration}ms`);
    console.log(`Result:   ${summary.success ? 'SUCCESS ✓' : 'FAILURE ✗'}`);

    if (summary.failed > 0) {
      console.log('\nFailed tests:');
      summary.results.filter(r => !r.passed).forEach(r => {
        console.log(`  - ${r.name}`);
        console.log(`    ${r.message}`);
      });
    }

    return summary;
  }
}

// Helper for Claude to run tests
export function createInstructions(testFiles) {
  return `
To run these tests, Claude should:

1. Import the test file(s): ${testFiles.join(', ')}
2. Create a browser API wrapper using the use_browser MCP tool
3. Execute each test and collect results
4. Print summary

Example execution pattern:
- Call use_browser with action 'navigate' to load the page
- Call use_browser with action 'await_element' to wait for initialization
- Call use_browser with action 'eval' to run test JavaScript
- Parse results and report pass/fail
  `;
}
