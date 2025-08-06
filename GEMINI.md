# Gemini Context

This file provides context for the Gemini AI code assistant.

## Important Directories

- `src`: Contains the main source code for the project.
- `tests`: Contains the tests for the project.

## Common Commands

### Fix

To fix the project and ensure it's in a good state, run the following commands:

1.  **Build:** `npm run build`
2.  **Unit Tests:** `npm run unit`
3.  **Format:** `npm run format`

### E2E Tests

To run a specific E2E test, use the following command:

`npm run e2e -- -k <test_name>`

### Fixing E2E Tests

To fix an E2E test, run tests with different `HEADLESS` environment variable of
`true`, `false` and `old`. Also run with `CHROMEDRIVER` environment variable of
`true` or `false`. Each run should be done with `VERBOSE=true`, then check the latest
log in the `logs` folder.

E2E tests are slow, so run only necessary tests.
