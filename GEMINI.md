# Gemini Context

This file provides context for the Gemini AI code assistant.

## Important Directories

- `src`: Main source code.
- `tests`: E2E tests.
- `lib`: Generated files (do not edit).

## Git Workflow

- Do not commit, pull, or push unless explicitly asked.
- Always run `npm run format` (or `npm run format:prettier` if global tools like `keep-sorted` are missing) before committing to ensure all modified files (including documentation) are correctly formatted.

## Common Commands

### Fix

To restore the project to a known good state, run the following commands in order:

1. **Build:** `npm run build`
2. **Unit Tests:** `npm run unit`
3. **Format:** `npm run format`
4. **Verify BidiMapper Import:** `node out/Default/gen/src/bidiMapper/BidiMapper.js`. If this
   fails with `ERR_MODULE_NOT_FOUND`, it's likely due to a missing `.js` extension in
   an import statement in one of the TypeScript source files.

### Unit Tests

- Unit test source files are located in the `src` directory and have a `.test.ts`
  extension.
- They are co-located with the code they are testing.
- Run unit tests with `npm run unit`. This command first compiles the TypeScript code
  (including tests) into JavaScript in the `out/Default/gen/src/` directory and then runs the tests
  using the Node.js native test runner.
- When adding new tests, create a new `*.test.ts` file in the `src` directory next to
  the file you are testing. The build process will automatically pick it up.
- **Important**: Do not delete the test files you create. They are a part of the
  project.
- Use constants for test data like user context or browsing context IDs to improve
  readability and maintainability.

### E2E Tests

To run a specific E2E test, use the following command:

`npm run e2e -- -k <test_name>`

### Fixing E2E Tests

To debug a failing E2E test, try running it with different environment variables:

- Set `HEADLESS` to `true`, `false`, or `old`.
- Set `CHROMEDRIVER` to `true` or `false`.

Each run should be done with `VERBOSE=true`. Inspect the latest log in the `logs`
directory for errors.

Note: E2E tests are slow, so run only the necessary tests.

### Checking out a Pull Request

To checkout a pull request:

```bash
git fetch origin pull/<PR_NUMBER>/head:<BRANCH_NAME>
git checkout <BRANCH_NAME>
```

After each checkout, run `npm run clean`.

### Fixing the build after a new command is added

When asked to fix a PR, get it's title. If it's title is something like
`build(spec): update WebDriverBiDi types`, it means a new command was added to the
WebDriver BiDi CDDL. Run the following steps to fix it:

1.  **Check out the Pull Request.** The PR is usually created by
    `browser-automation-bot`, and the branch name is usually `update-bidi-types`.
2.  **Run `npm run clean && npm run format:eslint`**. This will fail with a
    `Switch is not exhaustive` error.
3.  **Implement the parser for the new command's params:**
    1.  Add the new `parse...` method to the `BidiCommandParameterParser` interface
        in `src/bidiMapper/BidiParser.ts`.
    2.  Implement the new `parse...` method in `src/bidiMapper/BidiNoOpParser.ts`.
    3.  Implement the new `parse...` method in `src/bidiTab/BidiParser.ts`.
    4.  Add the new `parse...` function to the corresponding namespace in
        `src/protocol-parser/protocol-parser.ts`.
4.  **Add the new command to `src/bidiMapper/CommandProcessor.ts`**. Add a new `case`
    for the new command in the `switch` statement. First parse the command parameters
    and then throw an exception.
5.  **Run `npm run build` and `npm run format`** to verify the fix.
6.  **Do not commit the changes.**
7.  **Do not run e2e tests for this kind of fixes.**

## Dependency Updates (node_modules & GCS)

The project manages `node_modules` using `gclient` with archives stored in a GCS bucket (`chromium-nodejs`). Whenever you update dependencies (resulting in changes to `package.json` or `package-lock.json`):

1.  Run `npm install` to update `package-lock.json` locally.
2.  Run `tools/update_node_modules.mjs --force` to filter, upload the updated `node_modules` to GCS, and automatically update the `DEPS` file.
3.  Commit both the dependency files (`package.json`, `package-lock.json`) and the updated `DEPS` file in your PR.
4.  Run `./third_party/depot_tools/gclient sync` (adding `depot_tools` to your `PATH` if necessary) to ensure your local environment is synchronized.

## Architecture & CDP Configuration

To prevent race conditions where page scripts execute before target-level configurations are applied:

- **Target Initialization:** Always apply initial target configurations (e.g., emulation overrides, setting virtual wallet behaviors) inside `CdpTarget.#unblock` (specifically within `#setUserContextConfig` or similar helper methods).
- **Timing:** These configurations must be sent to the browser _before_ the `Runtime.runIfWaitingForDebugger` command is executed to ensure they are active when the page starts running.
- **Avoid Async Post-Unblock Setup:** Do not apply initial target-wide configurations asynchronously in `BrowsingContextImpl` after `targetUnblockedOrThrow()` resolves, as this occurs after the target has already been resumed.
- **Same-Process Subframes:** For same-process subframes (which do not trigger a new target unblocking), apply configurations immediately upon context creation in `BrowsingContextImpl.create` to set them as early as possible.
