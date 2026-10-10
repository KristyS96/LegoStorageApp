// Bundled into js/vendor/anthropic-sdk.js by `npm run vendor:sdk`, so the
// app can call Claude from the browser without a build step at runtime.
export { default as Anthropic } from '@anthropic-ai/sdk';
export { betaJSONSchemaOutputFormat } from '@anthropic-ai/sdk/helpers/beta/json-schema';
