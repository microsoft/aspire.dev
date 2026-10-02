# Common Documentation Issues (From PR Feedback)

The following rules are derived from common feedback patterns in documentation PRs. Following these rules will help avoid common mistakes.

## General Writing Rules

1. **Remove unnecessary commas**: Don't write "Now, that you have..." - write "Now that you have..."
2. **Avoid casual language**: Don't include phrases like "treat yourself to a coffee" or other informal asides in documentation
3. **Remove unused imports**: Don't import components that aren't used in the document
4. **Verify all internal links**: Links must point to pages that actually exist. Common mistakes:
   - Linking to `/get-started/setup-and-tooling/` instead of `/get-started/prerequisites/`
   - Linking to `/reference/cli/` for CLI installation instead of `/get-started/install-cli/`
5. **Add redirects when restructuring**: When moving or renaming documentation pages, add redirect entries in `src/frontend/config/redirects.mjs`

## Code Example Rules

1. **Use standard indentation**: For fluent APIs on newlines, use standard 4-space indentation, NOT alignment with the method call above

   ✅ Correct:

   ```csharp
   builder.AddProject<Projects.Api>("api")
       .WithReference(redis)
       .WithExternalHttpEndpoints();
   ```

   ❌ Incorrect (aligned indentation):

   ```csharp
   builder.AddProject<Projects.Api>("api")
          .WithReference(redis)
          .WithExternalHttpEndpoints();
   ```

2. **Code block language identifiers**: Use only one language identifier, not duplicates like `csharp csharp`

3. **Verify code syntax**: Check for typos in code:
   - `main:app` not `main.app` (Python uvicorn module:app format)
   - Verify package/module names are correct

4. **Accurate technical descriptions**:
   - `process.env` is an **object**, not a method
   - `express` is NOT used to access environment variables (that's `process.env`)
   - Don't claim libraries do things they don't do

5. **Connection string environment variables**:
   - For C#/.NET: Use `ConnectionStrings:resourcename` (colon separator)
   - For Python/JavaScript: Use `ConnectionStrings__resourcename` (double underscore separator)
   - Use the standard `ConnectionStrings__<resourcename>` pattern, not custom variable names like `ELASTICSEARCH_ENDPOINT`

6. **Don't document deprecated APIs as primary examples**: If an API is deprecated, don't use it as the first or main example. Use current, recommended APIs.

7. **Avoid insecure defaults in examples**: Don't include `TrustServerCertificate=true` in connection strings without noting it's for development only

## Component Usage Rules

1. **Match Pivot components to their PivotSelector**: When using nested Pivot components, ensure they reference the correct parent PivotSelector with the `key` attribute

2. **Keep LinkCard descriptions concise**: Card descriptions should be short enough to not squeeze the UI. Prefer "Configure persistence..." over "Discover how to configure persistence..."

3. **Avoid redundant Asides**: Don't have two Asides saying similar things near each other

## Cross-Language Documentation

When documenting integrations that support multiple languages (C#, Python, JavaScript):

1. **Show complete, working examples** for each language
2. **Ensure variable names are defined** before they're used in code examples
3. **Verify the same resource name** is used consistently across language examples
4. **Don't remove code that defines variables** that are used later in the document
