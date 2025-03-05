# MSquared Pixel Streaming Client

[![npm version](https://img.shields.io/npm/v/@msquared/pixel-streaming-client.svg)](https://www.npmjs.com/package/@msquared/pixel-streaming-client)
[![Build Status](https://github.com/msquared-io/pixel-streaming-client/actions/workflows/main.yaml/badge.svg)](https://github.com/msquared-io/pixel-streaming-client/actions/workflows/main.yaml)
[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](https://opensource.org/licenses/MIT)
[![TypeScript](https://img.shields.io/badge/TypeScript-5.7-blue.svg)](https://www.typescriptlang.org/)

Browser client for viewing pixel-streamed content from MSquared events.

## Usage

For detailed documentation please visit our [docs site](https://docs.msquared.io/apis-and-tooling/frontend-sdks/pixel-streaming).

## Features

- 🔒 Type-safe with full TypeScript support
- 📦 Multiple distribution formats (ESM, CJS, UMD)
- 🛠️ Easy integration with modern build tools

## Build

```bash
npm run build
```

This will create:
- CommonJS (CJS) build
- ES Modules (ESM) build
- Browser-ready bundle
- TypeScript declaration files

## Development

```bash
# Install dependencies
npm install

# Run tests
npm test

# Type checking
npm run ts:type-check

# Linting
npm run ts:lint
npm run ts:lint:fix

# Format code
npm run ts:fmt
npm run ts:fmt:fix

# Lint and format code
npm run ts:check
npm run ts:check:fix

# All validation checks
npm run ts:validate
```

## Release

The GitHub Actions workflow will automatically publish the package to npm when a new release is created.

```bash
npm version <patch|minor|major>
git push --atomic origin main <version>
```

## License

MIT © [MSquared](https://msquared.io)
