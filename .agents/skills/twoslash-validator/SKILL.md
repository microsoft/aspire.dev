---
name: twoslash-validator
description: Validate and fix two-slash TypeScript examples for aspire.dev. Use when adding or editing `twoslash` code fences, TypeScript AppHost samples, generated TypeScript API data, or failures from `pnpm test:unit:twoslash-blocks`.
---

# Two-slash Validator Skill

Use this skill to keep aspire.dev from shipping rendered two-slash error UI. Any TypeScript diagnostic in a `twoslash` code block renders an error box on the site, so diagnostics must be fixed rather than suppressed.

## When to use this skill

- Adding or editing a TypeScript code fence with the `twoslash` meta flag
- Updating TypeScript AppHost examples that import `./.modules/aspire.js`
- Refreshing `src/frontend/src/data/ts-modules/` or `src/frontend/src/data/twoslash/aspire.d.ts`
- Investigating failures from `pnpm test:unit:twoslash-blocks`
- Reviewing docs changes that affect TypeScript sample rendering

## Core rule

Do not add diagnostic allowlists or suppressions. A two-slash diagnostic is user-visible output on aspire.dev. Fix the docs sample, fix/regenerate the generated type surface, or remove the `twoslash` meta until the sample compiles cleanly.

## Validation workflow

Run commands from the repository root unless noted.

1. Ensure dependencies are installed:

   ```powershell
   Set-Location -Path .\src\frontend
   pnpm install --frozen-lockfile --prefer-offline
   ```

2. If TypeScript API JSON changed, regenerate the two-slash declaration bundle:

   ```powershell
   pnpm twoslash-types
   ```

3. Run the two-slash block gate:

   ```powershell
   pnpm test:unit:twoslash-blocks
   ```

4. If the test fails, read every reported file, line, block number, and `ts(...)` code. Fix every diagnostic before considering the work complete.

## Fix strategy

Use this order when deciding what to change:

1. **Docs sample bug:** If the TypeScript snippet calls the wrong API, uses the wrong argument shape, has a stale model name, or chains incompatible resources, fix the MDX sample.
2. **Generated type data stale:** If the sample matches the product API but `src/frontend/src/data/twoslash/aspire.d.ts` is stale, run `pnpm twoslash-types` and commit the regenerated bundle.
3. **Generator type-shape gap:** If regeneration is not enough because `scripts/generate-twoslash-types.ts` loses valid SDK shape, fix the generator and regenerate `aspire.d.ts`.
4. **Feature not representable yet:** If a correct sample cannot be represented by the current two-slash type data, remove the `twoslash` meta from that block and leave the code sample visible without two-slash rendering. Do not leave a rendered diagnostic.

## What not to do

- Do not reintroduce `KNOWN_TYPE_BUGS`, per-page diagnostic budgets, or equivalent allowlists.
- Do not disable `TWOSLASH_ENABLED` to make the test pass.
- Do not change `noErrorValidation` as a substitute for fixing diagnostics; it exists so the audit can collect all failures at once.
- Do not hide failures by changing the fence language away from TypeScript unless the sample is not TypeScript.
- Do not edit generated `aspire.d.ts` by hand; update the generator or source JSON and regenerate.

## Expected final checks

Before finishing a two-slash-related change, run:

```powershell
Set-Location -Path .\src\frontend
pnpm test:unit:twoslash-blocks
```

If you changed the generator, also run:

```powershell
pnpm test:unit:twoslash-types
```
