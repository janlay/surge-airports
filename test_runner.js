const fs = require('fs');
const path = require('path');
const vm = require('vm');

// Test result tracking
const results = {
  passed: [],
  failed: [],
  skipped: [],
};

// ANSI color codes for terminal output
const colors = {
  reset: '\x1b[0m',
  green: '\x1b[32m',
  red: '\x1b[31m',
  yellow: '\x1b[33m',
  cyan: '\x1b[36m',
  gray: '\x1b[90m',
};

function colorize(text, color) {
  return colors[color] + text + colors.reset;
}

// Load script content once
const scriptContent = fs.readFileSync('airport-bar.js', 'utf8');

// Extract expire value from subscription-userinfo string
function extractExpire(info) {
  if (!info) return 0;
  const re = /(?<=\bexpire=)\d+/i;
  return re.test(info) ? parseInt(info.match(re)[0]) : 0;
}

// Calculate mock date based on expire timestamp
function calculateMockDate(expireTimestamp) {
  // No expiry - use current date (18th of current month)
  if (expireTimestamp <= 0) {
    const now = new Date();
    return new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 18, 0, 0, 0));
  }

  const expireDate = new Date(expireTimestamp * 1000);
  const year = expireDate.getUTCFullYear();
  const month = expireDate.getUTCMonth();
  const day = expireDate.getUTCDate();
  const hour = expireDate.getUTCHours();

  // Month start (1st at 00:00:00) - use 5 days before
  if (day === 1 && hour === 0) {
    return new Date(Date.UTC(year, month - 1, 26, 0, 0, 0));
  }

  // 2nd or later - use 1 day before
  return new Date(Date.UTC(year, month, day - 1, 0, 0, 0));
}

// Create a Mock Date class factory
function createMockDate(fixedDate) {
  class MockDate extends Date {
    constructor(...args) {
      if (args.length === 0) {
        super(fixedDate);
      } else {
        super(...args);
      }
    }

    static now() {
      return fixedDate.getTime();
    }
  }

  // Copy static methods from original Date
  Object.getOwnPropertyNames(Date)
    .filter(name => name !== 'length' && name !== 'name' && name !== 'prototype' && name !== 'now')
    .forEach(name => {
      MockDate[name] = Date[name];
    });

  return MockDate;
}

// Function to run a single test case
function runTest(inputFile, expectedFile) {
  const testName = path.basename(inputFile);
  const caseName = 'Case ' + testName.match(/case_(\d+)/)[1];
  console.log(`\n${colorize('----- Running test: ' + testName + ' -----', 'cyan')}`);

  // Check if expected file exists
  const hasExpected = fs.existsSync(expectedFile);
  let expectedContent = '';
  if (hasExpected) {
    expectedContent = fs.readFileSync(expectedFile, 'utf8');
  }

  // Read input file to get expire value for mock date calculation
  const headers = JSON.parse(fs.readFileSync(inputFile, 'utf8'));
  const userInfo = headers["subscription-userinfo"] || headers["Subscription-Userinfo"];
  const expire = extractExpire(userInfo);
  const mockDate = calculateMockDate(expire);
  const MockDate = createMockDate(mockDate);

  console.log(`Input: ${JSON.stringify(headers)}`);

  // Actual output will be captured here
  let actualOutput = '';

  // Create a fresh sandbox for each test
  const sandbox = {
    console: { log: () => {}, error: () => {} }, // Suppress console output
    require: require,
    module: { exports: {} },
    exports: {},
    $input: { panelName: caseName },
    $argument: 'https://example.com/;-1', // Default argument for testing
    $done: (result) => {
      // Capture title + content for comparison (matching expected format)
      if (result) {
        const title = result.title ?? caseName;
        const content = result.content ?? '';
        actualOutput = title + '\n' + content;
      }
    },
    $httpClient: {},
    Math: Math,
    Date: MockDate,
    parseInt: parseInt,
    parseFloat: parseFloat,
    Object: Object,
    Array: Array,
    String: String,
    Number: Number,
  };

  // Load and evaluate script in sandbox (fresh for each test)
  vm.runInNewContext(scriptContent, sandbox);

  try {
    // Extract subscription-userinfo value from headers
    const value = userInfo;

    // In test mode, call processSubscriptionInfo directly
    const { processSubscriptionInfo } = sandbox.module.exports;
    processSubscriptionInfo(value);
  } catch (e) {
    // Only set output if $done wasn't called yet
    if (!actualOutput) {
      actualOutput = caseName + '\n' + e.toString();
    }
  }

  // Compare with expected output
  if (!hasExpected) {
    console.log(colorize(`⚠ No expected file found`, 'yellow'));
    results.skipped.push({ name: testName, reason: 'No expected file' });
    return;
  }

  // Normalize line endings for comparison
  const normalizedExpected = expectedContent.replace(/\r\n/g, '\n').trim();
  const normalizedActual = actualOutput.replace(/\r\n/g, '\n').trim();

  if (normalizedActual === normalizedExpected) {
    console.log(colorize('✓ PASSED', 'green'));
    console.log(`${colors.gray}Output: ${actualOutput}${colors.reset}`);
    results.passed.push(testName);
  } else {
    console.log(colorize('✗ FAILED', 'red'));
    console.log(`${colors.gray}Expected: ${normalizedExpected}${colors.reset}`);
    console.log(`${colors.gray}Actual:   ${normalizedActual}${colors.reset}`);
    results.failed.push({ name: testName, expected: normalizedExpected, actual: normalizedActual });
  }
}

async function main() {
  console.log(colorize('\n========================================', 'cyan'));
  console.log(colorize('   Surge Airports Test Suite', 'cyan'));
  console.log(colorize('========================================', 'cyan'));

  // Test all case files
  for (let i = 1; i <= 8; i++) {
    const inputFile = `./tests/input/case_${i}.txt`;
    const expectedFile = `./tests/expected/case_${i}.txt`;

    // Check if input file exists
    if (!fs.existsSync(inputFile)) {
      console.log(`\n${colorize('Skipping: ' + inputFile + ' (not found)', 'yellow')}`);
      results.skipped.push({ name: `case_${i}`, reason: 'Input file not found' });
      continue;
    }

    runTest(inputFile, expectedFile);
  }

  // Print summary
  console.log(colorize('\n========================================', 'cyan'));
  console.log(colorize('   Test Summary', 'cyan'));
  console.log(colorize('========================================', 'cyan'));

  console.log(`\n${colorize('Total Tests:', 'cyan')} ${results.passed.length + results.failed.length + results.skipped.length}`);
  console.log(`${colorize('Passed:', 'green')} ${results.passed.length}`);
  console.log(`${colorize('Failed:', 'red')} ${results.failed.length}`);
  console.log(`${colorize('Skipped:', 'yellow')} ${results.skipped.length}`);

  if (results.passed.length > 0) {
    console.log(`\n${colorize('Passed tests:', 'green')} ${results.passed.join(', ')}`);
  }

  if (results.failed.length > 0) {
    console.log(`\n${colorize('Failed tests:', 'red')}`);
    results.failed.forEach((fail, index) => {
      console.log(`  ${index + 1}. ${fail.name}`);
      console.log(`     Expected: ${fail.expected.substring(0, 50)}${fail.expected.length > 50 ? '...' : ''}`);
      console.log(`     Actual:   ${fail.actual.substring(0, 50)}${fail.actual.length > 50 ? '...' : ''}`);
    });
  }

  if (results.skipped.length > 0) {
    console.log(`\n${colorize('Skipped tests:', 'yellow')}`);
    results.skipped.forEach(skip => {
      console.log(`  - ${skip.name}: ${skip.reason}`);
    });
  }

  // Exit with appropriate code
  const exitCode = results.failed.length > 0 ? 1 : 0;
  console.log(`\n${exitCode === 0 ? colorize('✓ All tests passed!', 'green') : colorize('✗ Some tests failed', 'red')}`);
  process.exit(exitCode);
}

main();
