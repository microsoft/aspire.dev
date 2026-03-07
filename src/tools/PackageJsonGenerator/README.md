# PackageJsonGenerator

A tool for generating Package.{version}.json files that contain detailed API schema information for .NET assemblies.

## Overview

This tool analyzes .NET assemblies using Roslyn and generates a JSON file containing:
- All public types (classes, structs, interfaces, enums, delegates)
- Type member details (methods, properties, fields, events)
- XML documentation comments
- Generic type parameters and constraints
- Attribute information
- Parameter details including nullability

## Usage

```bash
dotnet run --project PackageJsonGenerator.csproj -- \
  --input <path-to-assembly.dll> \
  --reference <path-to-reference1.dll> \
  --reference <path-to-reference2.dll> \
  --output <path-to-output.json>
```

### Arguments

- `--input`: (Required) The assembly DLL to analyze and generate JSON for
- `--reference`: (Required) One or more reference assemblies needed to load the input assembly
- `--output`: (Required) The file path where the JSON schema should be written

### Example

```bash
dotnet run --project src/tools/PackageJsonGenerator/PackageJsonGenerator.csproj -- \
  --input bin/Debug/net10.0/MyLibrary.dll \
  --reference /usr/share/dotnet/shared/Microsoft.NETCore.App/10.0.0/System.Runtime.dll \
  --reference /usr/share/dotnet/shared/Microsoft.NETCore.App/10.0.0/System.Collections.dll \
  --output MyLibrary.10.0.0.json
```

## Output Format

The generated JSON follows this schema:

```json
{
  "package": {
    "name": "AssemblyName",
    "version": "1.0.0",
    "targetFramework": "net10.0"
  },
  "types": [
    {
      "name": "TypeName",
      "fullName": "Namespace.TypeName",
      "namespace": "Namespace",
      "kind": "class",
      "accessibility": "public",
      "members": [ ... ],
      "docs": { ... }
    }
  ]
}
```

## Implementation Details

This tool is based on:
- `ConfigurationSchemaGenerator` from `dotnet/aspire` - for the command-line tool structure
- `ApiSchemaGenerator` from `api.contracts` - for the JSON schema generation approach

The tool uses:
- **Microsoft.CodeAnalysis.CSharp.Workspaces** - for loading and analyzing assemblies
- **System.CommandLine** - for CLI argument parsing
- **System.Text.Json** - for deterministic JSON output

## Building

```bash
cd src/tools/PackageJsonGenerator
dotnet build
```

## Testing

To test the tool on a sample assembly:

```bash
# Build a sample library first
dotnet new classlib -n SampleLib
cd SampleLib
dotnet build

# Run the generator
dotnet run --project ../PackageJsonGenerator/PackageJsonGenerator.csproj -- \
  --input bin/Debug/net10.0/SampleLib.dll \
  --reference /path/to/runtime/assemblies/*.dll \
  --output SampleLib.1.0.0.json
```

## Notes

- The tool requires XML documentation files (`.xml`) alongside the input assembly for complete documentation
- Output is deterministically formatted (alphabetically sorted) for version control friendliness
- Only `public` types and members are included in the output
- Compiler-generated types (e.g., closure classes) are automatically filtered out
