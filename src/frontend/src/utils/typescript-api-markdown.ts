import { formatTsSignature, getTsModules, simplifyType, tsModuleSlug, tsSlugify } from '@utils/ts-modules';
import type {
  TsApiDocument,
  TsDtoType,
  TsEnumType,
  TsFunction,
  TsFunctionParameter,
  TsHandleType,
} from '@utils/ts-modules';
import {
  bulletList,
  codeBlock,
  finalizeMarkdown,
  indentMarkdown,
  inlineCode,
  keyValueBullets,
  link,
  normalizeBase,
  section,
} from '@utils/api-markdown-shared';

type TypeScriptItemKind = 'handle' | 'dto' | 'enum' | 'function';
type TypeScriptItem = TsHandleType | TsDtoType | TsEnumType | TsFunction;
type TypeScriptModuleType =
  | (TsHandleType & { _typeKind: 'interface' | 'handle' })
  | (TsDtoType & { _typeKind: 'type' });

export function typeScriptIndexMdHref(base: string): string {
  return `${normalizeBase(base)}/reference/api/typescript.md`;
}

export function typeScriptModuleMdHref(base: string, moduleName: string): string {
  return `${normalizeBase(base)}/reference/api/typescript/${tsModuleSlug(moduleName)}.md`;
}

export function typeScriptItemMdHref(base: string, moduleName: string, itemName: string): string {
  return `${normalizeBase(base)}/reference/api/typescript/${tsModuleSlug(moduleName)}/${tsSlugify(itemName)}.md`;
}

export function typeScriptMemberMdHref(
  base: string,
  moduleName: string,
  itemName: string,
  memberName: string
): string {
  return `${normalizeBase(base)}/reference/api/typescript/${tsModuleSlug(moduleName)}/${tsSlugify(itemName)}/${tsSlugify(memberName)}.md`;
}

export function renderTypeScriptIndexMarkdown(modules: TsApiDocument[], base: string): string {
  const sorted = [...modules].sort((left, right) => left.package.name.localeCompare(right.package.name));

  const lines = sorted.map((pkg) => {
    const functionCount = (pkg.functions ?? []).length;
    const typeCount = (pkg.handleTypes ?? []).length + (pkg.dtoTypes ?? []).length + (pkg.enumTypes ?? []).length;
    const summary = [pkg.package.version ? `v${pkg.package.version}` : null, `${functionCount} functions`, `${typeCount} types`]
      .filter(Boolean)
      .join(' · ');

    return `- ${link(pkg.package.name, typeScriptModuleMdHref(base, pkg.package.name))} — ${summary}`;
  });

  return finalizeMarkdown([
    '# TypeScript API Reference',
    'Browse the TypeScript APIs available when writing an Aspire TypeScript AppHost.',
    section('Modules', bulletList(lines)),
  ]);
}

export function renderTypeScriptModuleMarkdown(pkg: TsApiDocument, base: string): string {
  const sourceHref = getTypeScriptSourceHref(pkg);
  const allTypes: TypeScriptModuleType[] = [
    ...(pkg.handleTypes ?? []).map((item) => ({ ...item, _typeKind: item.isInterface ? 'interface' as const : 'handle' as const })),
    ...(pkg.dtoTypes ?? []).map((item) => ({ ...item, _typeKind: 'type' as const })),
  ].sort(compareByName);
  const allEnums = [...(pkg.enumTypes ?? [])].sort(compareByName);
  const standaloneFunctions = (pkg.functions ?? [])
    .filter((fn) => !fn.qualifiedName || !fn.qualifiedName.includes('.'))
    .sort(compareByName);

  const metadata = keyValueBullets([
    { label: 'Module', value: inlineCode(pkg.package.name) },
    { label: 'Version', value: pkg.package.version ? inlineCode(pkg.package.version) : null },
    { label: 'Source', value: sourceHref ? link('GitHub', sourceHref) : null },
    { label: 'Functions', value: inlineCode(String(standaloneFunctions.length)) },
    { label: 'Types', value: inlineCode(String(allTypes.length + allEnums.length)) },
  ]);

  const typeLines = allTypes.map((item) => {
    const kind = item._typeKind === 'type' ? 'type' : item.isInterface ? 'interface' : 'handle';
    const count = item._typeKind === 'type' ? `${item.fields?.length ?? 0} fields` : `${item.capabilities?.length ?? 0} members`;
    const description = item.description ? ` — ${item.description}` : '';
    return `- ${link(item.name, typeScriptItemMdHref(base, pkg.package.name, item.name))} — ${inlineCode(kind)} · ${count}${description}`;
  });

  const functionLines = standaloneFunctions.map((fn) => {
    const description = fn.description ? ` — ${fn.description}` : '';
    return `- ${link(fn.name, typeScriptItemMdHref(base, pkg.package.name, fn.name))} — ${inlineCode('function')}${description}`;
  });

  const enumLines = allEnums.map((item) => {
    const description = item.description ? ` — ${item.description}` : '';
    return `- ${link(item.name, typeScriptItemMdHref(base, pkg.package.name, item.name))} — ${inlineCode('enum')} · ${(item.members ?? []).length} values${description}`;
  });

  return finalizeMarkdown([
    `# ${pkg.package.name}`,
    metadata,
    section('Types', bulletList(typeLines)),
    section('Functions', bulletList(functionLines)),
    section('Enums', bulletList(enumLines)),
  ]);
}

export function renderTypeScriptItemMarkdown(
  pkg: TsApiDocument,
  item: TypeScriptItem,
  itemKind: TypeScriptItemKind,
  base: string
): string {
  const handleItem = itemKind === 'handle' ? (item as TsHandleType) : null;
  const dtoItem = itemKind === 'dto' ? (item as TsDtoType) : null;
  const enumItem = itemKind === 'enum' ? (item as TsEnumType) : null;
  const functionItem = itemKind === 'function' ? (item as TsFunction) : null;
  const sourceHref = getTypeScriptSourceHref(pkg);
  const metadata = keyValueBullets([
    { label: 'Module', value: link(pkg.package.name, typeScriptModuleMdHref(base, pkg.package.name)) },
    { label: 'Version', value: pkg.package.version ? inlineCode(pkg.package.version) : null },
    { label: 'Kind', value: inlineCode(getItemKindLabel(itemKind, handleItem?.isInterface).toLowerCase()) },
    { label: 'Source', value: sourceHref ? link('GitHub', sourceHref) : null },
  ]);

  return finalizeMarkdown([
    `# ${item.name}`,
    metadata,
    item.description ?? '',
    section('Definition', codeBlock(buildTypeScriptDeclaration(item, itemKind), 'typescript')),
    handleItem ? section('Properties', renderHandlePropertiesMarkdown(handleItem, pkg, base)) : '',
    handleItem ? section('Methods', renderHandleMethodsMarkdown(handleItem, pkg, base)) : '',
    dtoItem ? section('Fields', renderDtoFieldsMarkdown(dtoItem, pkg, base)) : '',
    enumItem ? section('Values', renderEnumValuesMarkdown(enumItem)) : '',
    functionItem ? section('Parameters', renderTypeScriptParametersMarkdown(functionItem.parameters ?? [], pkg, base)) : '',
    functionItem ? section('Returns', renderTypeScriptReturnMarkdown(functionItem.returnType, pkg, base, functionItem.returnsBuilder)) : '',
    functionItem ? section('Applies to', renderAppliesToMarkdown(functionItem.expandedTargetTypes ?? [], pkg, base)) : '',
  ]);
}

export function renderTypeScriptMemberMarkdownPage(
  pkg: TsApiDocument,
  parentType: TsHandleType,
  method: TsFunction,
  base: string
): string {
  const metadata = keyValueBullets([
    { label: 'Module', value: link(pkg.package.name, typeScriptModuleMdHref(base, pkg.package.name)) },
    {
      label: 'Defined on',
      value: link(parentType.name, typeScriptItemMdHref(base, pkg.package.name, parentType.name)),
    },
    { label: 'Version', value: pkg.package.version ? inlineCode(pkg.package.version) : null },
    { label: 'Kind', value: inlineCode('method') },
  ]);

  return finalizeMarkdown([
    `# ${parentType.name}.${method.name}`,
    metadata,
    method.description ?? '',
    section('Definition', codeBlock(buildMethodDeclaration(parentType, method), 'typescript')),
    section('Signature', codeBlock(formatTsSignature(method.signature ?? ''), 'typescript')),
    section('Parameters', renderTypeScriptParametersMarkdown(method.parameters ?? [], pkg, base)),
    section('Returns', renderTypeScriptReturnMarkdown(method.returnType, pkg, base, method.returnsBuilder)),
    section(
      'Defined on',
      bulletList([
        `- ${link(parentType.name, typeScriptItemMdHref(base, pkg.package.name, parentType.name))} — ${inlineCode(
          parentType.isInterface ? 'interface' : 'handle'
        )}`,
      ])
    ),
  ]);
}

function getItemKindLabel(itemKind: TypeScriptItemKind, isInterface: boolean | undefined): string {
  if (itemKind === 'handle') {
    return isInterface ? 'Interface' : 'Handle';
  }

  if (itemKind === 'dto') {
    return 'Type';
  }

  if (itemKind === 'function') {
    return 'Function';
  }

  return 'Enum';
}

function buildTypeScriptDeclaration(item: TypeScriptItem, itemKind: TypeScriptItemKind): string {
  if (itemKind === 'handle') {
    return buildHandleTypeDeclaration(item as TsHandleType);
  }

  if (itemKind === 'dto') {
    return buildDtoTypeDeclaration(item as TsDtoType);
  }

  if (itemKind === 'enum') {
    return buildEnumDeclaration(item as TsEnumType);
  }

  return buildFunctionDeclaration(item as TsFunction);
}

function buildHandleTypeDeclaration(item: TsHandleType): string {
  const getters = (item.capabilities ?? []).filter(isPropertyGetter);
  const setters = (item.capabilities ?? []).filter(isPropertySetter);
  const methods = (item.capabilities ?? []).filter(isMethodCapability).sort(compareByName);
  const members: string[] = [];

  for (const getter of getters) {
    const hasSetter = setters.some((setter) => normalizeSetterName(setter.name) === getter.name.toLowerCase());
    members.push(`  ${hasSetter ? '' : 'readonly '}${getter.name}: ${getter.returnType ?? 'unknown'};`);
  }

  for (const setter of setters) {
    if (!getters.some((getter) => getter.name.toLowerCase() === normalizeSetterName(setter.name))) {
      members.push(`  ${setter.name}(value: ${setter.parameters?.[0]?.type ?? 'unknown'}): void;`);
    }
  }

  for (const method of methods) {
    const rawSignature = `${method.name}(${formatParameterList(method.parameters ?? [])}): ${method.returnType ?? 'void'};`;
    const formatted = formatTsSignature(rawSignature);
    members.push(formatted.split('\n').map((line) => `  ${line}`).join('\n'));
  }

  const interfaces = (item.implementedInterfaces ?? []).map((iface) => simplifyType(iface));
  const extendsClause = interfaces.length === 0
    ? ''
    : interfaces.length === 1
      ? ` extends ${interfaces[0]}`
      : `\n  extends ${interfaces.join(',\n    ')}`;

  return `interface ${item.name}${extendsClause}${members.length > 0 ? ` {\n${members.join('\n')}\n}` : ' { }'}`;
}

function buildDtoTypeDeclaration(item: TsDtoType): string {
  const fields = (item.fields ?? []).map((field) => `  ${field.name}${field.isOptional ? '?' : ''}: ${field.type ?? 'unknown'};`);
  return fields.length > 0 ? `type ${item.name} = {\n${fields.join('\n')}\n}` : `type ${item.name} = { }`;
}

function buildEnumDeclaration(item: TsEnumType): string {
  const members = (item.members ?? []).map((member, index) => `  ${member} = ${index},`);
  return members.length > 0 ? `enum ${item.name} {\n${members.join('\n')}\n}` : `enum ${item.name} { }`;
}

function buildFunctionDeclaration(item: TsFunction): string {
  const memberSignature = `${item.name}(${formatParameterList(item.parameters ?? [])}): ${item.returnType ?? 'void'}`;

  if ((item.expandedTargetTypes ?? []).length > 0) {
    const targetName = simplifyType(item.expandedTargetTypes[0]);
    return `interface ${targetName} {\n  // ... omitted for brevity\n  ${formatTsSignature(memberSignature)}\n}`;
  }

  return `function ${formatTsSignature(memberSignature)}`;
}

function buildMethodDeclaration(parentType: TsHandleType, method: TsFunction): string {
  const memberSignature = `${method.name}(${formatParameterList(method.parameters ?? [])}): ${method.returnType ?? 'void'};`;
  const formattedMember = formatTsSignature(memberSignature);
  const indentedMember = formattedMember.split('\n').map((line) => `  ${line}`).join('\n');
  return `interface ${parentType.name} {\n  // ... omitted for brevity\n${indentedMember}\n}`;
}

function renderHandlePropertiesMarkdown(item: TsHandleType, pkg: TsApiDocument, base: string): string {
  const getters = (item.capabilities ?? []).filter(isPropertyGetter);
  const setters = (item.capabilities ?? []).filter(isPropertySetter);
  if (getters.length === 0 && setters.length === 0) {
    return '';
  }

  const getterLines = getters.map((getter) => {
    const hasSetter = setters.some((setter) => normalizeSetterName(setter.name) === getter.name.toLowerCase());
    const access = hasSetter ? 'get · set' : 'get';
    return `- ${inlineCode(getter.name)}: ${formatTypeScriptTypeReferenceMarkdown(getter.returnType, pkg, base)} ${inlineCode(access)}${getter.description ? ` — ${getter.description}` : ''}`;
  });

  const setterLines = setters
    .filter((setter) => !getters.some((getter) => getter.name.toLowerCase() === normalizeSetterName(setter.name)))
    .map((setter) => {
      const valueType = setter.parameters?.[0]?.type ?? 'unknown';
      return `- ${inlineCode(setter.name)}(${formatTypeScriptTypeReferenceMarkdown(valueType, pkg, base)}) ${inlineCode('set')}${setter.description ? ` — ${setter.description}` : ''}`;
    });

  return bulletList([...getterLines, ...setterLines]);
}

function renderHandleMethodsMarkdown(item: TsHandleType, pkg: TsApiDocument, base: string): string {
  const methods = (item.capabilities ?? []).filter(isMethodCapability).sort(compareByName);
  if (methods.length === 0) {
    return '';
  }

  return bulletList(
    methods.map((method) => {
      const href = typeScriptMemberMdHref(base, pkg.package.name, item.name, method.name);
      const description = method.description ? ` — ${method.description}` : '';
      return `- ${link(method.name, href)} — ${inlineCode('method')}${description}\n  ${indentMarkdown(codeBlock(method.signature ?? '', 'typescript'), '  ')}`;
    })
  );
}

function renderDtoFieldsMarkdown(item: TsDtoType, pkg: TsApiDocument, base: string): string {
  const fields = item.fields ?? [];
  if (fields.length === 0) {
    return '';
  }

  return bulletList(
    fields.map((field) => {
      const optional = field.isOptional ? ` ${inlineCode('optional')}` : '';
      return `- ${inlineCode(field.name)}: ${formatTypeScriptTypeReferenceMarkdown(field.type, pkg, base)}${optional}`;
    })
  );
}

function renderEnumValuesMarkdown(item: TsEnumType): string {
  const members = item.members ?? [];
  if (members.length === 0) {
    return '';
  }

  return bulletList(members.map((member: string, index: number) => `- ${inlineCode(member)} = ${inlineCode(String(index))}`));
}

function renderTypeScriptParametersMarkdown(
  parameters: TsFunctionParameter[],
  pkg: TsApiDocument,
  base: string
): string {
  if (parameters.length === 0) {
    return '';
  }

  return bulletList(
    parameters.map((parameter) => {
      const type = parameter.isCallback && parameter.callbackSignature
        ? inlineCode(parameter.callbackSignature)
        : formatTypeScriptTypeReferenceMarkdown(parameter.type, pkg, base);
      const badges = [
        parameter.isOptional ? inlineCode('optional') : null,
        parameter.defaultValue ? inlineCode(`= ${parameter.defaultValue}`) : null,
      ]
        .filter(Boolean)
        .join(' ');
      return `- ${inlineCode(parameter.name)} (${type})${badges ? ` ${badges}` : ''}`;
    })
  );
}

function renderTypeScriptReturnMarkdown(
  returnType: string | undefined,
  pkg: TsApiDocument,
  base: string,
  returnsBuilder?: boolean
): string {
  if (!returnType || returnType === 'void') {
    return returnsBuilder ? `Returns ${inlineCode('builder')}.` : '';
  }

  const formatted = formatTypeScriptTypeReferenceMarkdown(returnType, pkg, base);
  return returnsBuilder ? `${formatted} ${inlineCode('builder')}` : formatted;
}

function renderAppliesToMarkdown(targetTypes: string[], pkg: TsApiDocument, base: string): string {
  if (!targetTypes || targetTypes.length === 0) {
    return '';
  }

  return bulletList(
    targetTypes.map((targetType) => {
      const simpleName = simplifyType(targetType);
      return `- ${link(simpleName, typeScriptItemMdHref(base, pkg.package.name, simpleName))}`;
    })
  );
}

function formatTypeScriptTypeReferenceMarkdown(typeRef: string | undefined, pkg: TsApiDocument, base: string): string {
  if (!typeRef) {
    return inlineCode('unknown');
  }

  if (typeRef === 'callback') {
    return inlineCode('callback');
  }

  const simpleName = simplifyType(typeRef);
  const allItems = [
    ...(pkg.handleTypes ?? []).map((item) => item.name),
    ...(pkg.dtoTypes ?? []).map((item) => item.name),
    ...(pkg.enumTypes ?? []).map((item) => item.name),
  ];

  return allItems.includes(simpleName)
    ? link(simpleName, typeScriptItemMdHref(base, pkg.package.name, simpleName))
    : inlineCode(simpleName);
}

function compareByName<T extends { name: string }>(left: T, right: T): number {
  return left.name.localeCompare(right.name);
}

function isMethodCapability(capability: TsFunction): boolean {
  return capability.kind === 'Method' || capability.kind === 'InstanceMethod';
}

function isPropertyGetter(capability: TsFunction): boolean {
  return capability.kind === 'PropertyGetter';
}

function isPropertySetter(capability: TsFunction): boolean {
  return capability.kind === 'PropertySetter';
}

function normalizeSetterName(name: string): string {
  return name.replace(/^set/, '').toLowerCase();
}

function formatParameterDeclaration(parameter: TsFunctionParameter): string {
  const optional = parameter.isOptional ? '?' : '';
  const type = parameter.isCallback && parameter.callbackSignature ? parameter.callbackSignature : parameter.type ?? 'unknown';
  return `${parameter.name}${optional}: ${type}`;
}

function formatParameterList(parameters: TsFunctionParameter[]): string {
  return parameters.map(formatParameterDeclaration).join(', ');
}

function getTypeScriptSourceHref(pkg: TsApiDocument): string | undefined {
  if (!pkg.package.sourceRepository) {
    return undefined;
  }

  return pkg.package.sourceCommit
    ? `${pkg.package.sourceRepository}/tree/${pkg.package.sourceCommit}`
    : pkg.package.sourceRepository;
}

export async function getTypeScriptMarkdownRouteProps(): Promise<TsApiDocument[]> {
  const packages = await getTsModules();
  return packages.map((entry) => entry.data);
}
