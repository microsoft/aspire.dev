import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import ts from 'typescript';

interface TypeRef {
  TypeId: string;
  Category: string;
  ElementType?: TypeRef;
  UnionTypes?: TypeRef[];
}

interface Parameter {
  Type: TypeRef;
  CallbackParameters?: { Type: TypeRef }[];
  CallbackReturnType?: TypeRef;
}

interface AtsEnum {
  TypeId: string;
  Name: string;
  Values: string[];
}

interface AtsDump {
  Packages: { Name: string; Version?: string }[];
  Capabilities: { CapabilityId?: string; Parameters: Parameter[]; ReturnType?: TypeRef }[];
  DtoTypes?: { Properties: { Type: TypeRef }[] }[];
  EnumTypes: AtsEnum[];
}

interface CanonicalExport {
  package: { name: string; version: string };
  declarations: { owningAssembly: string; content: string }[];
  modules?: { items: CanonicalItem[] }[];
}

interface CanonicalItem {
  capabilityId?: string;
  declaration: string;
  members?: CanonicalItem[];
}

export function readEnumDeclarations(source: string): { name: string; members: string[] }[] {
  const file = ts.createSourceFile('sdk.mts', source, ts.ScriptTarget.Latest, true);
  const enums = file.statements.filter(ts.isEnumDeclaration).map((declaration) => ({
    name: declaration.name.text,
    members: declaration.members.map((member) => {
      if (!ts.isIdentifier(member.name) && !ts.isStringLiteral(member.name)) {
        throw new Error(`Unsupported member name in enum ${declaration.name.text}.`);
      }
      if (
        !member.initializer ||
        !ts.isStringLiteral(member.initializer) ||
        member.initializer.text !== member.name.text
      ) {
        throw new Error(`Unsupported value for ${declaration.name.text}.${member.name.text}.`);
      }
      return member.name.text;
    }),
  }));
  for (const statement of file.statements) {
    if (!ts.isVariableStatement(statement)) continue;
    for (const declaration of statement.declarationList.declarations) {
      if (
        !ts.isIdentifier(declaration.name) ||
        !declaration.type ||
        !ts.isTypeLiteralNode(declaration.type) ||
        declaration.type.members.length === 0
      ) {
        continue;
      }
      const members: string[] = [];
      for (const member of declaration.type.members) {
        if (
          !ts.isPropertySignature(member) ||
          (!ts.isIdentifier(member.name) && !ts.isStringLiteral(member.name)) ||
          !member.type ||
          !ts.isLiteralTypeNode(member.type) ||
          !ts.isStringLiteral(member.type.literal) ||
          member.type.literal.text !== member.name.text
        ) {
          break;
        }
        members.push(member.name.text);
      }
      if (members.length === declaration.type.members.length) {
        enums.push({ name: declaration.name.text, members });
      }
    }
  }
  return enums;
}

export function supplementAtsEnums(dump: AtsDump, reference: CanonicalExport): AtsDump {
  if (
    !dump.Packages.some(
      (pkg) =>
        pkg.Name.toLowerCase() === reference.package.name.toLowerCase() &&
        pkg.Version === reference.package.version
    )
  ) {
    throw new Error('Canonical export does not match the dumped package identity.');
  }

  const required = new Set<string>();
  const occurrences = new Map<string, Set<string>>();
  const visit = (type: TypeRef | undefined, capabilityId?: string): void => {
    if (!type) return;
    if (type.Category === 'Enum') {
      required.add(type.TypeId);
      if (capabilityId) {
        const ids = occurrences.get(type.TypeId) ?? new Set<string>();
        ids.add(capabilityId);
        occurrences.set(type.TypeId, ids);
      }
    }
    visit(type.ElementType, capabilityId);
    for (const member of type.UnionTypes ?? []) visit(member, capabilityId);
  };
  for (const capability of dump.Capabilities) {
    visit(capability.ReturnType, capability.CapabilityId);
    for (const parameter of capability.Parameters) {
      visit(parameter.Type, capability.CapabilityId);
      visit(parameter.CallbackReturnType, capability.CapabilityId);
      for (const callbackParameter of parameter.CallbackParameters ?? []) {
        visit(callbackParameter.Type, capability.CapabilityId);
      }
    }
  }
  for (const dto of dump.DtoTypes ?? []) {
    for (const property of dto.Properties) visit(property.Type);
  }

  const definitions = reference.declarations.flatMap((declaration) =>
    readEnumDeclarations(declaration.content).map((value) => ({
      ...value,
      assembly: declaration.owningAssembly,
    }))
  );
  const enums = [...dump.EnumTypes];
  const canonicalMembers = new Map<string, string>();
  const collectMembers = (item: CanonicalItem): void => {
    if (item.capabilityId) canonicalMembers.set(item.capabilityId, item.declaration);
    for (const member of item.members ?? []) collectMembers(member);
  };
  for (const module of reference.modules ?? []) {
    for (const item of module.items) collectMembers(item);
  }
  const existing = new Set(enums.map((value) => value.TypeId));
  for (const typeId of required) {
    if (existing.has(typeId)) continue;
    const fullName = typeId.replace(/^enum:/, '');
    const name = fullName.split(/[.+]/).at(-1);
    let matches = definitions.filter(
      (value) => value.name === name && fullName.startsWith(`${value.assembly}.`)
    );
    if (matches.length === 0) {
      const referencedNames = new Set<string>();
      for (const id of occurrences.get(typeId) ?? []) {
        const declaration = canonicalMembers.get(id);
        if (!declaration) continue;
        const file = ts.createSourceFile(
          'member.mts',
          `interface Canonical { ${declaration} }`,
          ts.ScriptTarget.Latest,
          true
        );
        const collectReferences = (node: ts.Node): void => {
          if (ts.isTypeReferenceNode(node) && ts.isIdentifier(node.typeName)) {
            referencedNames.add(node.typeName.text);
          }
          ts.forEachChild(node, collectReferences);
        };
        collectReferences(file);
      }
      matches = definitions.filter(
        (value) => referencedNames.has(value.name) && fullName.startsWith(`${value.assembly}.`)
      );
    }
    if (matches.length !== 1) {
      throw new Error(`Expected one canonical definition for ${typeId}, found ${matches.length}.`);
    }
    enums.push({ TypeId: typeId, Name: matches[0].name, Values: matches[0].members });
  }
  return { ...dump, EnumTypes: enums };
}

const isMainModule =
  process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url);
if (isMainModule) {
  const [dumpFile, exportFile] = process.argv.slice(2);
  if (!dumpFile || !exportFile) {
    throw new Error('Expected ATS dump and canonical export paths.');
  }
  const dump = JSON.parse(fs.readFileSync(dumpFile, 'utf8')) as AtsDump;
  const reference = JSON.parse(fs.readFileSync(exportFile, 'utf8')) as CanonicalExport;
  const result = supplementAtsEnums(dump, reference);
  fs.writeFileSync(dumpFile, `${JSON.stringify(result, null, 2)}\n`);
  console.log(`Preserved ${result.EnumTypes.length - dump.EnumTypes.length} referenced SDK enums.`);
}
