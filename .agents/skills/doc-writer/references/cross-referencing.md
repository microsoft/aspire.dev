# Cross-Referencing

## Link to Related Documentation

Use standard Markdown links with absolute paths from the docs root:

```markdown
For more information, see [Service Defaults](/fundamentals/service-defaults/).
```

## Inline API references

Use `ApiReference` selectively to connect an explanation to API reference documentation, not to turn every API mention into a link.

- In ordinary prose, use `<ApiReference />` only on the **first named mention of a given API in an article**, when naming that API helps explain the behavior or accompanying example. Do not introduce an API name just to add a reference link.
- After that first mention, do **not** repeat the component or API reference link in ordinary prose, including prose in callouts and later sections. Prefer descriptive prose such as "this method" or "the dependency configuration." If repeating the name is necessary for clarity, use unlinked inline code appropriate to the AppHost language being discussed.
- Apply the ordinary-prose limit **per API, per article**, not per section or language tab. A different API can have its own first reference.
- In **bulleted or numbered lists**, including language-specific API explanation lists, repeated `<ApiReference />` components are allowed. Treat equivalent API entries consistently, regardless of earlier mentions, rather than mixing linked components and unlinked API names.
- An optional API reference link in **See also** is also allowed.
- Keep API names in code samples as code; do not add reference markup inside code fences.
- Match the reference to the API actually used in the example. A PostgreSQL example calling `withPostgresMcp()` / `WithPostgresMcp()` must be introduced with `Aspire.Hosting.PostgresBuilderExtensions.WithPostgresMcp`, not the generic `WithMcpServer` API.

For example, introduce an API once:

```mdx
import ApiReference from '@components/ApiReference.astro';

For PostgreSQL, use <ApiReference name="Aspire.Hosting.PostgresBuilderExtensions.WithPostgresMcp" /> to expose MCP tools for a database.
```

Later in the same article's ordinary prose, refer to "the PostgreSQL MCP helper" rather than repeating the linked API name. In an API explanation list, repeat the component for consistent entries:

```mdx
- <ApiReference name="Aspire.Hosting.PostgresBuilderExtensions.WithPostgresMcp" /> exposes MCP tools for a database.
- <ApiReference name="Aspire.Hosting.ResourceBuilderExtensions.WithReference" /> connects resources.
```

### Selecting an overload

Author `name`, `package`, and `parameterTypes` as explicit static props. The authoring validator does not evaluate spread objects: it reports `unsupported-spread` when a spread could supply or override any of these props, including optional ones. Remove the spread, or explicitly set all three props after the last spread so their values are known.

By default, `ApiReference` shows the method name **without `()`** and links to the method group. To discuss a specific overload, supply `parameterTypes` as a static array of its **complete declared C# parameter types**, in declaration order. Copy the types from the generated C# catalog, preserving namespaces, generic arguments, and nullability. Include the `this` receiver's type for an extension method, but not the `this` keyword. Use `[]` only for a declaration with no parameters.

```mdx
<ApiReference
  name="Aspire.Hosting.ResourceBuilderExtensions.WithEnvironment"
  parameterTypes={[
    'Aspire.Hosting.ApplicationModel.IResourceBuilder<T>',
    'string',
    'string?',
  ]}
/>
```

This links to the exact C# overload and displays `WithEnvironment(string name, string? value)`. The extension receiver is used for selection but omitted from the visible call signature. In TypeScript mode, the component uses the generated TypeScript export's own name and parameters; several C# overloads may share one TypeScript dispatcher. Do not copy C# parameter types into a TypeScript signature or select overloads by ordinal position. A missing or ambiguous match is an authoring error, not permission to link to the first overload. Use `package` when the same API is declared in multiple packages.

Linked references reuse the code-block headers' C# and TypeScript icons from `material-icon-theme`, centered inside the code background. Do not add a separate icon or empty parentheses manually. `()` is shown only when an explicitly selected API genuinely has no call parameters.

The component derives its top-positioned tooltip from the resolved API's generated summary or description, including the selected overload when specified. Do not duplicate that description in an authored `title` prop. When no description exists, the tooltip identifies the API and language instead. Tooltip titles are capped at 160 characters, including an ASCII `...` suffix when shortened, preferably at a word boundary. This presentation limit also applies to diagnostic titles; full source descriptions, diagnostics, and visible API labels remain unchanged.

Title-based tooltips use the shared `src/frontend/src/scripts/tooltips.ts` lifecycle on initial load and after ClientRouter navigation. Keep API descriptions text-only with `data-tippy-allowhtml="false"`; do not add a competing per-component initializer.
The lifecycle is installed once per document; HMR disposal removes its listeners, restores titles, and destroys tooltip instances before the replacement module initializes.

## Reference NuGet Packages

Use the 📦 emoji with links:

```markdown
Install the [📦 Aspire.Hosting.Redis](https://nuget.org/packages/Aspire.Hosting.Redis) package.
```

## See Also Sections

End pages with a "See also" section linking to:

- Official technology documentation
- Related Aspire documentation
- NuGet package pages
- GitHub repositories (when applicable)
