import { formatTsSignature, getTsModules, simplifyType, tsModuleSlug, tsSlugify } from '@utils/ts-modules';
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

export function renderTypeScriptIndexMarkdown(modules: any[], base: string): string {
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

export function renderTypeScriptModuleMarkdown(pkg: any, base: string): string {
  const moduleLinkBase = typeScriptModuleMdHref(base, pkg.package.name);
  void moduleLinkBase;

  const allTypes = [
    ...(pkg.handleTypes ?? []).map((item: any) => ({ ...item, _typeKind: item.isInterface ? 'interface' : 'handle' })),
    ...(pkg.dtoTypes ?? []).map((item: any) => ({ ...item, _typeKind: 'type' })),
  ].sort((left: any, right: any) => left.name.localeCompare(right.name));
  const allEnums = [...(pkg.enumTypes ?? [])].sort((left: any, right: any) => left.name.localeCompare(right.name));
  const standaloneFunctions = (pkg.functions ?? [])
    .filter((fn: any) => !fn.qualifiedName || !fn.qualifiedName.includes('.'))
    .sort((left: any, right: any) => left.name.localeCompare(right.name));

  const metadata = keyValueBullets([
    { label: 'Module', value: inlineCode(pkg.package.name) },
    { label: 'Version', value: pkg.package.version ? inlineCode(pkg.package.version) : null },
    { label: 'Source', value: pkg.package.sourceRepository ? link('GitHub', pkg.package.sourceRepository) : null },
    { label: 'Functions', value: inlineCode(String(standaloneFunctions.length)) },
    { label: 'Types', value: inlineCode(String(allTypes.length + allEnums.length)) },
  ]);

  const typeLines = allTypes.map((item: any) => {
    const kind = item._typeKind === 'type' ? 'type' : item.isInterface ? 'interface' : 'handle';
    const count = item._typeKind === 'type' ? `${item.fields?.length ?? 0} fields` : `${item.capabilities?.length ?? 0} members`;
    const description = item.description ? ` — ${item.description}` : '';
    return `- ${link(item.name, typeScriptItemMdHref(base, pkg.package.name, item.name))} — ${inlineCode(kind)} · ${count}${description}`;
  });

  const functionLines = standaloneFunctions.map((fn: any) => {
    const description = fn.description ? ` — ${fn.description}` : '';
    return `- ${link(fn.name, typeScriptItemMdHref(base, pkg.package.name, fn.name))} — ${inlineCode('function')}${description}`;
  });

  const enumLines = allEnums.map((item: any) => {
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
  pkg: any,
  item: any,
  itemKind: 'handle' | 'dto' | 'enum' | 'function',
  base: string
): string {
  const metadata = keyValueBullets([
    { label: 'Module', value: link(pkg.package.name, typeScriptModuleMdHref(base, pkg.package.name)) },
    { label: 'Version', value: pkg.package.version ? inlineCode(pkg.package.version) : null },
    { label: 'Kind', value: inlineCode(getItemKindLabel(item, itemKind).toLowerCase()) },
    { label: 'Source', value: pkg.package.sourceRepository ? link('GitHub', pkg.package.sourceRepository) : null },
  ]);

  return finalizeMarkdown([
    `# ${item.name}`,
    metadata,
    item.description ?? '',
    section('Definition', codeBlock(buildTypeScriptDeclaration(item, itemKind), 'typescript')),
    itemKind === 'handle' ? section('Properties', renderHandlePropertiesMarkdown(item, pkg, base)) : '',
    itemKind === 'handle' ? section('Methods', renderHandleMethodsMarkdown(item, pkg, base)) : '',
    itemKind === 'dto' ? section('Fields', renderDtoFieldsMarkdown(item, pkg, base)) : '',
    itemKind === 'enum' ? section('Values', renderEnumValuesMarkdown(item)) : '',
    itemKind === 'function' ? section('Parameters', renderTypeScriptParametersMarkdown(item.parameters ?? [], pkg, base)) : '',
    itemKind === 'function' ? section('Returns', renderTypeScriptReturnMarkdown(item.returnType, pkg, base, item.returnsBuilder)) : '',
    itemKind === 'function' ? section('Applies to', renderAppliesToMarkdown(item.expandedTargetTypes ?? [], pkg, base)) : '',
  ]);
}

export function renderTypeScriptMemberMarkdownPage(pkg: any, parentType: any, method: any, base: string): string {
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

function getItemKindLabel(item: any, itemKind: 'handle' | 'dto' | 'enum' | 'function'): string {
  if (itemKind === 'handle') {
    return item.isInterface ? 'Interface' : 'Handle';
  }

  if (itemKind === 'dto') {
    return 'Type';
  }

  if (itemKind === 'function') {
    return 'Function';
  }

  return 'Enum';
}

function buildTypeScriptDeclaration(item: any, itemKind: 'handle' | 'dto' | 'enum' | 'function'): string {
  if (itemKind === 'handle') {
    const getters = (item.capabilities ?? []).filter((capability: any) => capability.kind === 'PropertyGetter');
    const setters = (item.capabilities ?? []).filter((capability: any) => capability.kind === 'PropertySetter');
    const methods = (item.capabilities ?? [])
      .filter((capability: any) => capability.kind === 'Method' || capability.kind === 'InstanceMethod')
      .sort((left: any, right: any) => left.name.localeCompare(right.name));

    const members: string[] = [];

    for (const getter of getters) {
      const hasSetter = setters.some(
        (setter: any) => setter.name.replace(/^set/, '').toLowerCase() === getter.name.toLowerCase()
      );
      members.push(`  ${hasSetter ? '' : 'readonly '}${getter.name}: ${getter.returnType};`);
    }

    for (const setter of setters) {
      if (!getters.some((getter: any) => getter.name.toLowerCase() === setter.name.replace(/^set/, '').toLowerCase())) {
        members.push(`  ${setter.name}(value: ${setter.parameters?.[0]?.type ?? 'unknown'}): void;`);
      }
    }

    for (const method of methods) {
      const rawSignature = `${method.name}(${(method.parameters ?? [])
        .map((parameter: any) => {
          const optional = parameter.isOptional ? '?' : '';
          const type = parameter.isCallback && parameter.callbackSignature ? parameter.callbackSignature : parameter.type;
          return `${parameter.name}${optional}: ${type}`;
        })
        .join(', ')}): ${method.returnType};`;
      const formatted = formatTsSignature(rawSignature);
      members.push(formatted.split('\n').map((line) => `  ${line}`).join('\n'));
    }

    const interfaces = (item.implementedInterfaces ?? []).map((iface: string) => simplifyType(iface));
    const extendsClause = interfaces.length === 0
      ? ''
      : interfaces.length === 1
        ? ` extends ${interfaces[0]}`
        : `\n  extends ${interfaces.join(',\n    ')}`;

    return `interface ${item.name}${extendsClause}${members.length > 0 ? ` {\n${members.join('\n')}\n}` : ' { }'}`;
  }

  if (itemKind === 'dto') {
    const fields = (item.fields ?? []).map(
      (field: any) => `  ${field.name}${field.isOptional ? '?' : ''}: ${field.type};`
    );
    return fields.length > 0 ? `type ${item.name} = {\n${fields.join('\n')}\n}` : `type ${item.name} = { }`;
  }

  if (itemKind === 'enum') {
    const members = (item.members ?? []).map((member: string, index: number) => `  ${member} = ${index},`);
    return members.length > 0 ? `enum ${item.name} {\n${members.join('\n')}\n}` : `enum ${item.name} { }`;
  }

  const params = (item.parameters ?? []).map((parameter: any) => {
    const optional = parameter.isOptional ? '?' : '';
    const type = parameter.isCallback && parameter.callbackSignature ? parameter.callbackSignature : parameter.type;
    return `${parameter.name}${optional}: ${type}`;
  });
  const memberSignature = `${item.name}(${params.join(', ')}): ${item.returnType ?? 'void'}`;

  if ((item.expandedTargetTypes ?? []).length > 0) {
    const targetName = simplifyType(item.expandedTargetTypes[0]);
    return `interface ${targetName} {\n  // ... omitted for brevity\n  ${formatTsSignature(memberSignature)}\n}`;
  }

  return `function ${formatTsSignature(memberSignature)}`;
}

function buildMethodDeclaration(parentType: any, method: any): string {
  const params = (method.parameters ?? []).map((parameter: any) => {
    const optional = parameter.isOptional ? '?' : '';
    const type = parameter.isCallback && parameter.callbackSignature ? parameter.callbackSignature : parameter.type;
    return `${parameter.name}${optional}: ${type}`;
  });

  const memberSignature = `${method.name}(${params.join(', ')}): ${method.returnType ?? 'void'};`;
  const formattedMember = formatTsSignature(memberSignature);
  const indentedMember = formattedMember.split('\n').map((line) => `  ${line}`).join('\n');
  return `interface ${parentType.name} {\n  // ... omitted for brevity\n${indentedMember}\n}`;
}

function renderHandlePropertiesMarkdown(item: any, pkg: any, base: string): string {
  const getters = (item.capabilities ?? []).filter((capability: any) => capability.kind === 'PropertyGetter');
  const setters = (item.capabilities ?? []).filter((capability: any) => capability.kind === 'PropertySetter');
  if (getters.length === 0 && setters.length === 0) {
    return '';
  }

  const getterLines = getters.map((getter: any) => {
    const hasSetter = setters.some(
      (setter: any) => setter.name.replace(/^set/, '').toLowerCase() === getter.name.toLowerCase()
    );
    const access = hasSetter ? 'get · set' : 'get';
    return `- ${inlineCode(getter.name)}: ${formatTypeScriptTypeReferenceMarkdown(getter.returnType, pkg, base)} ${inlineCode(access)}${getter.description ? ` — ${getter.description}` : ''}`;
  });

  const setterLines = setters
    .filter(
      (setter: any) => !getters.some((getter: any) => getter.name.toLowerCase() === setter.name.replace(/^set/, '').toLowerCase())
    )
    .map((setter: any) => {
      const valueType = setter.parameters?.[0]?.type ?? 'unknown';
      return `- ${inlineCode(setter.name)}(${formatTypeScriptTypeReferenceMarkdown(valueType, pkg, base)}) ${inlineCode('set')}${setter.description ? ` — ${setter.description}` : ''}`;
    });

  return bulletList([...getterLines, ...setterLines]);
}

function renderHandleMethodsMarkdown(item: any, pkg: any, base: string): string {
  const methods = (item.capabilities ?? [])
    .filter((capability: any) => capability.kind === 'Method' || capability.kind === 'InstanceMethod')
    .sort((left: any, right: any) => left.name.localeCompare(right.name));
  if (methods.length === 0) {
    return '';
  }

  return bulletList(
    methods.map((method: any) => {
      const href = typeScriptMemberMdHref(base, pkg.package.name, item.name, method.name);
      const description = method.description ? ` — ${method.description}` : '';
      return `- ${link(method.name, href)} — ${inlineCode('method')}${description}\n  ${indentMarkdown(codeBlock(method.signature ?? '', 'typescript'), '  ')}`;
    })
  );
}

function renderDtoFieldsMarkdown(item: any, pkg: any, base: string): string {
  const fields = item.fields ?? [];
  if (fields.length === 0) {
    return '';
  }

  return bulletList(
    fields.map((field: any) => {
      const optional = field.isOptional ? ` ${inlineCode('optional')}` : '';
      return `- ${inlineCode(field.name)}: ${formatTypeScriptTypeReferenceMarkdown(field.type, pkg, base)}${optional}`;
    })
  );
}

function renderEnumValuesMarkdown(item: any): string {
  const members = item.members ?? [];
  if (members.length === 0) {
    return '';
  }

  return bulletList(members.map((member: string, index: number) => `- ${inlineCode(member)} = ${inlineCode(String(index))}`));
}

function renderTypeScriptParametersMarkdown(parameters: any[], pkg: any, base: string): string {
  if (!parameters || parameters.length === 0) {
    return '';
  }

  return bulletList(
    parameters.map((parameter: any) => {
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
  pkg: any,
  base: string,
  returnsBuilder?: boolean
): string {
  if (!returnType || returnType === 'void') {
    return returnsBuilder ? `Returns ${inlineCode('builder')}.` : '';
  }

  const formatted = formatTypeScriptTypeReferenceMarkdown(returnType, pkg, base);
  return returnsBuilder ? `${formatted} ${inlineCode('builder')}` : formatted;
}

function renderAppliesToMarkdown(targetTypes: string[], pkg: any, base: string): string {
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

function formatTypeScriptTypeReferenceMarkdown(typeRef: string | undefined, pkg: any, base: string): string {
  if (!typeRef) {
    return inlineCode('unknown');
  }

  if (typeRef === 'callback') {
    return inlineCode('callback');
  }

  const simpleName = simplifyType(typeRef);
  const allItems = [
    ...(pkg.handleTypes ?? []).map((item: any) => item.name),
    ...(pkg.dtoTypes ?? []).map((item: any) => item.name),
    ...(pkg.enumTypes ?? []).map((item: any) => item.name),
  ];

  return allItems.includes(simpleName)
    ? link(simpleName, typeScriptItemMdHref(base, pkg.package.name, simpleName))
    : inlineCode(simpleName);
}

export async function getTypeScriptMarkdownRouteProps() {
  const packages = await getTsModules();
  return packages.map((entry) => entry.data);
}