#!/usr/bin/env node
import fs from 'node:fs';
import path from 'node:path';

const reportsDir = path.resolve('tests/reports');
fs.mkdirSync(reportsDir, { recursive: true });

const baseUrl = process.env.FUEKI_API_URL ?? 'https://fueki-backend-pojr5zp2oq-uc.a.run.app';
const apiPrefix = process.env.FUEKI_API_PREFIX ?? '/api';
const compilePath = process.env.FUEKI_COMPILE_PATH ?? `${apiPrefix}/contracts/compile`;
const gasPath = process.env.FUEKI_GAS_PATH ?? `${apiPrefix}/gas/estimate`;
const expectedUnauthorizedStatus = Number(process.env.FUEKI_EXPECT_UNAUTHORIZED_STATUS ?? '401');
const expectedCompileStatus = Number(process.env.FUEKI_EXPECT_COMPILE_STATUS ?? '404');
const expectedGasStatus = Number(process.env.FUEKI_EXPECT_GAS_STATUS ?? '404');
const maxAttempts = Number(process.env.FUEKI_NEWMAN_MAX_ATTEMPTS ?? '3');
const reportPath = path.join(reportsDir, 'newman-report.json');

const checks = [
  {
    name: 'Health',
    method: 'GET',
    path: '/health',
    assertions: [
      {
        name: 'health endpoint returns 200',
        test: ({ status }) => status === 200,
      },
      {
        name: 'health response has status ok',
        test: ({ json }) => json?.status === 'ok',
      },
    ],
  },
  {
    name: 'KYC Status Missing Auth',
    method: 'GET',
    path: `${apiPrefix}/kyc/status`,
    assertions: [
      {
        name: 'kyc status missing auth has expected status',
        test: ({ status }) => status === expectedUnauthorizedStatus,
      },
      {
        name: 'kyc status missing auth returns AUTH_REQUIRED',
        test: ({ json }) => json?.error?.code === 'AUTH_REQUIRED',
      },
    ],
  },
  {
    name: 'Admin Stats Missing Auth',
    method: 'GET',
    path: `${apiPrefix}/admin/stats`,
    assertions: [
      {
        name: 'admin stats missing auth has expected status',
        test: ({ status }) => status === expectedUnauthorizedStatus,
      },
      {
        name: 'admin stats missing auth returns AUTH_REQUIRED',
        test: ({ json }) => json?.error?.code === 'AUTH_REQUIRED',
      },
    ],
  },
  {
    name: 'Compile Endpoint Semantics',
    method: 'POST',
    path: compilePath,
    headers: {
      'content-type': 'application/json',
    },
    body: {
      sourceCode:
        '// SPDX-License-Identifier: MIT\npragma solidity ^0.8.20;\ncontract C { function ping() external pure returns (uint256) { return 1; } }',
      contractName: 'C',
    },
    assertions: [
      {
        name: 'compile endpoint returns expected status',
        test: ({ status }) => status === expectedCompileStatus,
      },
      ...(expectedCompileStatus === 200
        ? [
            {
              name: 'compile success payload shape',
              test: ({ json }) =>
                json?.success === true &&
                typeof json?.bytecode === 'string' &&
                Array.isArray(json?.abi),
            },
          ]
        : [
            {
              name: 'compile endpoint is not deployed in this environment',
              test: ({ text }) => text.includes('/contracts/compile'),
            },
          ]),
    ],
  },
  {
    name: 'Gas Endpoint Semantics',
    method: 'POST',
    path: gasPath,
    headers: {
      'content-type': 'application/json',
    },
    body: {
      bytecode: '0x6080604052348015600f57600080fd5b5060f68061001d6000396000f3fe60806040',
      chainId: 1,
      constructorArgs: [],
    },
    assertions: [
      {
        name: 'gas endpoint returns expected status',
        test: ({ status }) => status === expectedGasStatus,
      },
      ...(expectedGasStatus === 200
        ? [
            {
              name: 'gas payload contains estimate fields',
              test: ({ json }) =>
                json?.gasLimit !== undefined ||
                json?.estimatedGas !== undefined ||
                json?.estimate !== undefined,
            },
          ]
        : [
            {
              name: 'gas endpoint is not deployed in this environment',
              test: ({ text }) => text.includes('/gas/estimate'),
            },
          ]),
    ],
  },
];

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function toUrl(relativePath) {
  return new URL(relativePath, baseUrl).toString();
}

function createAssertionResult(assertion, pass, details) {
  return pass
    ? { assertion: assertion.name, skipped: false }
    : {
        assertion: assertion.name,
        skipped: false,
        error: {
          name: 'AssertionError',
          message: details,
        },
      };
}

async function executeCheck(check) {
  const url = toUrl(check.path);
  const response = await fetch(url, {
    method: check.method,
    headers: check.headers,
    body: check.body ? JSON.stringify(check.body) : undefined,
  });

  const text = await response.text();
  let json = null;
  try {
    json = text ? JSON.parse(text) : null;
  } catch {
    json = null;
  }

  const context = {
    status: response.status,
    text,
    json,
  };

  const assertions = check.assertions.map((assertion) => {
    const pass = Boolean(assertion.test(context));
    const details = pass
      ? ''
      : `${assertion.name} failed for ${check.name} (${check.method} ${url}) with status ${response.status}`;
    return createAssertionResult(assertion, pass, details);
  });

  return {
    item: { name: check.name },
    request: {
      method: check.method,
      url,
    },
    response: {
      code: response.status,
      status: response.statusText,
      body: text,
    },
    assertions,
  };
}

function summarize(executions) {
  const assertions = executions.flatMap((execution) => execution.assertions);
  const failedAssertions = assertions.filter((assertion) => assertion.error);
  const failedRequests = executions.filter((execution) =>
    execution.assertions.some((assertion) => assertion.error),
  );

  return {
    collection: {
      name: 'Fueki API Contract Tests',
    },
    run: {
      stats: {
        iterations: { total: 1, failed: failedRequests.length > 0 ? 1 : 0 },
        requests: { total: executions.length, failed: failedRequests.length },
        testScripts: { total: executions.length, failed: failedRequests.length },
        prerequestScripts: { total: 0, failed: 0 },
        assertions: {
          total: assertions.length,
          failed: failedAssertions.length,
          passed: assertions.length - failedAssertions.length,
        },
      },
      executions,
    },
  };
}

function printExecution(execution) {
  console.log(`→ ${execution.item.name}`);
  console.log(`  ${execution.request.method} ${execution.request.url} [${execution.response.code} ${execution.response.status}]`);
  for (const assertion of execution.assertions) {
    console.log(`  ${assertion.error ? '✗' : '✓'}  ${assertion.assertion}`);
  }
}

async function runOnce() {
  const executions = [];
  for (const check of checks) {
    const execution = await executeCheck(check);
    executions.push(execution);
    printExecution(execution);
  }
  return summarize(executions);
}

async function main() {
  let attempt = 1;
  while (attempt <= maxAttempts) {
    const report = await runOnce();
    fs.writeFileSync(reportPath, JSON.stringify(report, null, 2));

    const has429 = report.run.executions.some((execution) => execution.response.code === 429);
    if (!has429) {
      if ((report.run.stats.assertions.failed ?? 0) > 0) {
        process.exit(1);
      }
      return;
    }

    if (attempt >= maxAttempts) {
      console.error(`[api-contract-checks] Received 429 responses after ${maxAttempts} attempts.`);
      process.exit(1);
    }

    const sleepSeconds = attempt * 3;
    console.log(`[api-contract-checks] Attempt ${attempt} saw 429 responses. Retrying in ${sleepSeconds}s...`);
    await sleep(sleepSeconds * 1000);
    attempt += 1;
  }
}

main().catch((error) => {
  console.error('[api-contract-checks] unexpected failure');
  console.error(error);
  process.exit(1);
});
