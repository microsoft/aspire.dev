/* eslint-disable
  @typescript-eslint/no-explicit-any,
  @typescript-eslint/no-unsafe-argument,
  @typescript-eslint/no-unsafe-assignment,
  @typescript-eslint/no-unsafe-call,
  @typescript-eslint/no-unsafe-member-access,
  @typescript-eslint/no-unsafe-return
  -- generated package metadata and C# doc AST nodes are intentionally heterogeneous
*/
import {
  buildClassBodySignature,
  cleanMemberSignature,
  formatSignature,
  genericArity,
  groupMembersByKind,
  groupTypesByNamespace,
  memberDisplayName,
  memberKindLabels,
  memberKindSlugs,
  memberSlug,
  packageSlug,
  parseSeeAlso,
  shortTypeName,
  slugify,
  typeDisplayName,
} from '@utils/packages';
import {
  findAttribute,
  getAttributeArgument,
  getAttributeFlag,
  hasAttribute,
} from '@utils/api-attributes';
import {
  bulletList,
  codeBlock,
  escapeTableCell,
  finalizeMarkdown,
  indentMarkdown,
  inlineCode,
  keyValueBullets,
  link,
  normalizeBase,
  section,
} from '@utils/api-markdown-shared';

type CSharpDocContext = {
  allTypes: any[];
  base: string;
  packageName: string;
};

type PolyglotNote = {
  lines: string[];
  title: string;
};

const noteLabels: Record<string, string> = {
  caution: 'Caution',
  danger: 'Danger',
  important: 'Important',
  note: 'Note',
  tip: 'Tip',
  warning: 'Warning',
};

export function csharpIndexMdHref(base: string): string {
  return `${normalizeBase(base)}/reference/api/csharp.md`;
}

export function csharpPackageMdHref(base: string, packageName: string): string {
  return `${normalizeBase(base)}/reference/api/csharp/${packageSlug(packageName)}.md`;
}

export function csharpTypeMdHref(
  base: string,
  packageName: string,
  typeName: string,
  arity: number = 0
): string {
  return `${normalizeBase(base)}/reference/api/csharp/${packageSlug(packageName)}/${slugify(typeName, arity)}.md`;
}

export function csharpMemberKindMdHref(
  base: string,
  packageName: string,
  typeName: string,
  arity: number,
  kind: string
): string {
  return `${normalizeBase(base)}/reference/api/csharp/${packageSlug(packageName)}/${slugify(typeName, arity)}/${memberKindSlugs[kind]}.md`;
}

export function renderCSharpDocMarkdown(content: any, context: CSharpDocContext): string {
  if (!content) {
    return '';
  }

  if (typeof content === 'string') {
    return content.trim();
  }

  if (!Array.isArray(content)) {
    return String(content).trim();
  }

  const blocks: string[] = [];
  let inlineNodes: any[] = [];

  const flushInline = () => {
    if (inlineNodes.length === 0) {
      return;
    }

    const inline = renderInlineNodes(inlineNodes, context).trim();
    if (inline) {
      blocks.push(inline);
    }
    inlineNodes = [];
  };

  for (const node of content) {
    if (!node) {
      continue;
    }

    if (isBlockNode(node)) {
      flushInline();

      if (node.kind === 'para') {
        const paragraph = renderCSharpDocMarkdown(node.children, context);
        if (paragraph) {
          blocks.push(paragraph);
        }
        continue;
      }

      if (node.kind === 'note') {
        const body = renderCSharpDocMarkdown(node.children, context);
        if (body) {
          const label = noteLabels[node.value ?? 'note'] ?? (node.value ?? 'Note');
          const quoted = body
            .split('\n')
            .map((line) => {
              if (!line) {
                return '>';
              }

              const normalizedLine = line.replace(/^>\s?/, '');
              return `> ${normalizedLine}`;
            })
            .join('\n');
          blocks.push(`> **${label}:**\n>\n${quoted}`);
        }
        continue;
      }

      if (node.kind === 'list') {
        const rendered = renderDocList(node, context);
        if (rendered) {
          blocks.push(rendered);
        }
        continue;
      }

      if (node.kind === 'codeblock') {
        blocks.push(codeBlock(node.text ?? '', node.language ?? 'csharp'));
      }

      continue;
    }

    inlineNodes.push(node);
  }

  flushInline();

  return finalizeMarkdown(blocks).trim();
}

export function renderCSharpIndexMarkdown(packages: any[], base: string): string {
  const sorted = [...packages].sort((left, right) => left.package.name.localeCompare(right.package.name));

  const packageLines = sorted.map((pkg) => {
    const typeCount = pkg.types?.length ?? 0;
    const memberCount = (pkg.types ?? []).reduce(
      (total: number, type: any) => total + (type.members?.length ?? 0),
      0
    );
    const summary = [
      `v${pkg.package.version}`,
      `${typeCount} types`,
      `${memberCount} members`,
      pkg.package.targetFramework,
    ]
      .filter(Boolean)
      .join(' · ');

    return `- ${link(pkg.package.name, csharpPackageMdHref(base, pkg.package.name))} — ${summary}`;
  });

  return finalizeMarkdown([
    '# C# API Reference',
    'Browse the C# API reference for Aspire packages, including hosting integrations, client integrations, and the Community Toolkit.',
    section('Packages', bulletList(packageLines)),
  ]);
}

export function renderCSharpPackageMarkdown(pkg: any, base: string): string {
  const validTypes = (pkg.types ?? []).filter((type: any) => type.name);
  const namespaceGroups = groupTypesByNamespace(validTypes);
  const packageSourceHref = getPackageSourceHref(validTypes, pkg);

  const metadata = keyValueBullets([
    { label: 'Package', value: inlineCode(pkg.package.name) },
    { label: 'Version', value: inlineCode(pkg.package.version) },
    { label: 'Target framework', value: inlineCode(pkg.package.targetFramework) },
    { label: 'Source', value: packageSourceHref ? link('GitHub', packageSourceHref) : null },
    { label: 'NuGet', value: link(pkg.package.name, `https://www.nuget.org/packages/${pkg.package.name}`) },
  ]);

  const namespaceContent = [...namespaceGroups.entries()].map(([namespaceName, types]) => {
    const typeLines = types.map((type: any) => {
      const badges = [
        inlineCode(type.kind),
        type.isAbstract ? inlineCode('abstract') : null,
        type.isStatic ? inlineCode('static') : null,
        type.isSealed && !['enum', 'delegate', 'struct', 'record struct'].includes(type.kind)
          ? inlineCode('sealed')
          : null,
        type.isReadOnly ? inlineCode('readonly') : null,
        hasAttribute(type.attributes, 'Obsolete') ? inlineCode('obsolete') : null,
        hasAttribute(type.attributes, 'AspireExport') ? inlineCode('ats export') : null,
        hasAttribute(type.attributes, 'AspireDto') ? inlineCode('ats dto') : null,
        hasAttribute(type.attributes, 'AspireExportIgnore') ? inlineCode('ats ignored') : null,
      ].filter(Boolean);
      const summary = renderCompactDocMarkdown(type.docs?.summary, {
        allTypes: validTypes,
        base,
        packageName: pkg.package.name,
      });

      return `- ${link(typeDisplayName(type), csharpTypeMdHref(base, pkg.package.name, type.name, genericArity(type)))} — ${badges.join(' ')}${summary ? ` — ${summary}` : ''}`;
    });

    return section(namespaceName, bulletList(typeLines), 3);
  });

  return finalizeMarkdown([
    `# ${pkg.package.name}`,
    metadata,
    section('Namespaces', namespaceContent.join('\n\n')),
  ]);
}

export function renderCSharpTypeMarkdown(pkg: any, type: any, allTypes: any[], base: string): string {
  const context: CSharpDocContext = {
    allTypes,
    base,
    packageName: pkg.package.name,
  };

  const displayName = typeDisplayName(type);
  const metadata = keyValueBullets([
    { label: 'Kind', value: inlineCode(type.kind) },
    { label: 'Package', value: link(pkg.package.name, csharpPackageMdHref(base, pkg.package.name)) },
    { label: 'Version', value: inlineCode(pkg.package.version) },
    { label: 'Namespace', value: type.namespace ? inlineCode(type.namespace) : null },
    { label: 'Target framework', value: inlineCode(pkg.package.targetFramework) },
    { label: 'Source', value: getTypeSourceHref(type, pkg) ? link('GitHub', getTypeSourceHref(type, pkg) as string) : null },
    {
      label: 'Inherits',
      value:
        type.baseType && type.baseType !== 'System.Object'
          ? formatCSharpTypeReferenceMarkdown(type.baseType, context)
          : null,
    },
    {
      label: 'Implements',
      value: type.interfaces?.length
        ? type.interfaces
            .map((iface: string) => formatCSharpTypeReferenceMarkdown(iface, context))
            .join(', ')
        : null,
    },
  ]);

  const polyglotSection = renderPolyglotMarkdownSection(
    collectPolyglotNotes(type.attributes, 'type', type.name, pkg.package.name, allTypes, base)
  );

  return finalizeMarkdown([
    `# ${displayName}`,
    metadata,
    renderCSharpDocMarkdown(type.docs?.summary, context),
    section('Definition', codeBlock(buildTypeSignature(type), 'csharp')),
    polyglotSection,
    section('Delegate Parameters', renderDelegateParameters(type, context)),
    section('Type Parameters', renderTypeParameters(type, context)),
    section('Remarks', renderCSharpDocMarkdown(type.docs?.remarks, context)),
    section('Value', renderCSharpDocMarkdown(type.docs?.value, context)),
    section('Enum Members', renderEnumMembersMarkdown(type.enumMembers ?? [], hasAttribute(type.attributes, 'Flags'))),
    renderTypeMemberOverview(type, pkg.package.name, allTypes, base),
    section('Examples', renderExamplesMarkdown(type.docs?.examples, context)),
    section('Permissions', renderPermissionsMarkdown(type.docs?.permissions, context)),
    section('See Also', renderSeeAlsoMarkdown(type.docs?.seeAlso ?? [], context)),
  ]);
}

export function renderCSharpMemberKindMarkdown(
  pkg: any,
  type: any,
  kind: string,
  allTypes: any[],
  base: string
): string {
  const context: CSharpDocContext = {
    allTypes,
    base,
    packageName: pkg.package.name,
  };

  const members = (type.members ?? []).filter((member: any) => member.kind === kind);
  const displayName = typeDisplayName(type);

  return finalizeMarkdown([
    `# ${displayName} ${memberKindLabels[kind] ?? kind}`,
    keyValueBullets([
      { label: 'Package', value: link(pkg.package.name, csharpPackageMdHref(base, pkg.package.name)) },
      {
        label: 'Type',
        value: link(displayName, csharpTypeMdHref(base, pkg.package.name, type.name, genericArity(type))),
      },
      { label: 'Kind', value: inlineCode(memberKindLabels[kind] ?? kind) },
      { label: 'Members', value: inlineCode(String(members.length)) },
    ]),
    renderCSharpDocMarkdown(type.docs?.summary, context),
    ...members.map((member: any) =>
      section(getCSharpMemberHeading(member, type.name), renderCSharpMemberMarkdown(member, type, context, pkg), 2)
    ),
  ]);
}

function renderCSharpMemberMarkdown(member: any, parentType: any, context: CSharpDocContext, pkg: any): string {
  const rawDisplayName = memberDisplayName(member);
  const displayName = member.name === '.ctor' ? rawDisplayName.replace('.ctor', 'Constructor') : rawDisplayName;
  const modifiers = [
    member.accessibility && member.accessibility !== 'public' ? inlineCode(member.accessibility) : null,
    member.isStatic && !member.isExtension ? inlineCode('static') : null,
    member.isExtension ? inlineCode('extension') : null,
    member.isAbstract ? inlineCode('abstract') : null,
    member.isVirtual ? inlineCode('virtual') : null,
    member.isOverride ? inlineCode('override') : null,
    member.isAsync ? inlineCode('async') : null,
    member.isConst ? inlineCode('const') : null,
    member.isReadOnly && member.kind === 'field' ? inlineCode('readonly') : null,
    member.isReturnNullable ? inlineCode('nullable') : null,
    getAccessorBadge(member),
  ].filter(Boolean);

  const signature = formatMemberSignatureMarkdown(member, parentType);
  const returnType = member.returnType && member.returnType !== 'void'
    ? formatCSharpTypeReferenceMarkdown(member.returnType, context)
    : null;
  const sourceHref = getMemberSourceHref(member, pkg);
  const polyglotSection = renderPolyglotMarkdownSection(
    collectPolyglotNotes(member.attributes, 'member', displayName, pkg.package.name, context.allTypes, context.base)
  );

  return finalizeMarkdown([
    renderMemberStatusNotes(member, context),
    keyValueBullets([
      { label: 'Name', value: inlineCode(displayName) },
      { label: 'Modifiers', value: modifiers.length > 0 ? modifiers.join(' ') : null },
      { label: 'Returns', value: returnType },
      { label: 'Source', value: sourceHref ? link('GitHub', sourceHref) : null },
    ]),
    renderCSharpDocMarkdown(member.docs?.summary, context),
    signature ? codeBlock(signature, 'csharp') : null,
    section('Parameters', renderMemberParametersMarkdown(member.parameters ?? [], member.docs?.parameters ?? {}, context)),
    section('Returns', renderMemberReturnsMarkdown(member, context)),
    section('Exceptions', renderMemberExceptionsMarkdown(member.docs?.exceptions ?? [], context)),
    section('Remarks', renderCSharpDocMarkdown(member.docs?.remarks, context)),
    section('Examples', renderExamplesMarkdown(member.docs?.examples, context)),
    polyglotSection,
  ]);
}

function buildTypeSignature(type: any): string {
  const modifiers = [
    type.accessibility ?? 'public',
    type.isStatic ? 'static' : null,
    type.isAbstract ? 'abstract' : null,
    type.isSealed ? 'sealed' : null,
    type.isReadOnly ? 'readonly' : null,
  ]
    .filter(Boolean)
    .join(' ');

  const namespacePrefix = type.namespace ? `namespace ${type.namespace};\n\n` : '';
  let signature: string;

  if (type.kind === 'delegate') {
    const returnType = type.delegateReturnType ?? 'void';
    signature = `${modifiers} delegate ${returnType} ${type.name}`;
    if (type.isGeneric && type.genericParameters?.length) {
      signature += `<${type.genericParameters.map((parameter: any) => parameter.name).join(', ')}>`;
    }

    const delegateParameters = type.delegateParameters ?? [];
    if (delegateParameters.length > 0) {
      signature +=
        '(\n' +
        delegateParameters
          .map((parameter: any, index: number) => {
            const comma = index < delegateParameters.length - 1 ? ',' : '';
            return `    ${parameter.type} ${parameter.name}${comma}`;
          })
          .join('\n') +
        ')';
    } else {
      signature += '()';
    }
  } else {
    signature = `${modifiers} ${type.kind} ${type.name}`;
    if (type.isGeneric && type.genericParameters?.length) {
      signature += `<${type.genericParameters.map((parameter: any) => parameter.name).join(', ')}>`;
    }
  }

  const bases: string[] = [];
  if (type.baseType) {
    bases.push(type.baseType);
  }
  if (type.interfaces?.length) {
    bases.push(...type.interfaces);
  }

  if (bases.length > 0 && type.kind !== 'delegate') {
    signature += `\n    : ${bases.join(',\n      ')}`;
  }

  const constraints = (type.genericParameters ?? [])
    .filter((parameter: any) => parameter.constraints?.length > 0)
    .map((parameter: any) => {
      const formattedConstraints = parameter.constraints.map((constraint: string) => shortTypeName(constraint));
      return `    where ${parameter.name} : ${formattedConstraints.join(', ')}`;
    });

  if (constraints.length > 0) {
    signature += `\n${constraints.join('\n')}`;
  }

  if (!['delegate', 'enum'].includes(type.kind)) {
    signature += '\n{\n    // ...\n}';
  }

  return `${namespacePrefix}${signature}`;
}

function renderTypeParameters(type: any, context: CSharpDocContext): string {
  const entries = Object.entries(type.docs?.typeParameters ?? {});
  if (entries.length === 0) {
    return '';
  }

  return bulletList(
    entries.map(([name, description]) => {
      const markdown = renderCSharpDocMarkdown(description, context);
      return `- ${inlineCode(name)}${markdown ? ` — ${markdown}` : ''}`;
    })
  );
}

function renderDelegateParameters(type: any, context: CSharpDocContext): string {
  const parameters = type.delegateParameters ?? [];
  if (parameters.length === 0) {
    return '';
  }

  return bulletList(
    parameters.map((parameter: any) => {
      const description = renderCSharpDocMarkdown(type.docs?.parameters?.[parameter.name], context);
      const badges = [
        parameter.isNullable ? inlineCode('nullable') : null,
        parameter.isOptional ? inlineCode('optional') : null,
      ]
        .filter(Boolean)
        .join(' ');

      return `- ${inlineCode(parameter.name)} (${formatCSharpTypeReferenceMarkdown(parameter.type, context)})${badges ? ` ${badges}` : ''}${description ? ` — ${description}` : ''}`;
    })
  );
}

function renderEnumMembersMarkdown(enumMembers: any[], hasFlags: boolean): string {
  if (!enumMembers || enumMembers.length === 0) {
    return '';
  }

  const lines = [
    hasFlags ? 'Values can be combined with bitwise OR.' : '',
    '| Name | Value | Description |',
    '| --- | --- | --- |',
    ...enumMembers.map((member: any) => {
      const description = member.description && member.description !== '—' ? member.description : '';
      return `| ${escapeTableCell(member.name)} | ${escapeTableCell(String(member.value))} | ${escapeTableCell(description)} |`;
    }),
  ].filter(Boolean);

  return lines.join('\n');
}

function renderTypeMemberOverview(type: any, packageName: string, allTypes: any[], base: string): string {
  const groups = groupMembersByKind(type.members ?? []);
  if (groups.size === 0) {
    return '';
  }

  const context: CSharpDocContext = {
    allTypes,
    base,
    packageName,
  };

  const sections = [...groups.entries()].map(([kind, members]) => {
    const lines = members.map((member: any) => {
      const rawDisplayName = memberDisplayName(member);
      const displayName = member.name === '.ctor' ? rawDisplayName.replace('.ctor', type.name) : rawDisplayName;
      const href = `${csharpMemberKindMdHref(base, packageName, type.name, genericArity(type), kind)}#${memberSlug(member)}`;
      const returnType = member.returnType && member.returnType !== 'void'
        ? ` : ${formatCSharpTypeReferenceMarkdown(member.returnType, context)}`
        : '';
      const summary = renderCompactDocMarkdown(member.docs?.summary, context);
      const badges = [
        member.isStatic && !member.isExtension ? inlineCode('static') : null,
        member.isExtension ? inlineCode('extension') : null,
        member.isAbstract ? inlineCode('abstract') : null,
        member.isVirtual ? inlineCode('virtual') : null,
        getAccessorBadge(member),
        hasAttribute(member.attributes, 'Obsolete') ? inlineCode('obsolete') : null,
        hasAttribute(member.attributes, 'Experimental') ? inlineCode('experimental') : null,
        hasAttribute(member.attributes, 'AspireExport') ? inlineCode('ats export') : null,
        hasAttribute(member.attributes, 'AspireExportIgnore') ? inlineCode('ats ignored') : null,
      ]
        .filter(Boolean)
        .join(' ');

      return `- ${link(displayName, href)}${returnType}${badges ? ` ${badges}` : ''}${summary ? ` — ${summary}` : ''}`;
    });

    return section(memberKindLabels[kind] ?? kind, bulletList(lines));
  });

  return sections.join('\n\n');
}

function renderPermissionsMarkdown(permissions: any[], context: CSharpDocContext): string {
  if (!permissions || permissions.length === 0) {
    return '';
  }

  return bulletList(
    permissions.map((permission: any) => {
      const description = renderCSharpDocMarkdown(permission.description, context);
      return `- ${inlineCode(permission.type)}${description ? ` — ${description}` : ''}`;
    })
  );
}

function renderSeeAlsoMarkdown(seeAlso: string[], context: CSharpDocContext): string {
  if (!seeAlso || seeAlso.length === 0) {
    return '';
  }

  return bulletList(
    seeAlso.map((reference) => {
      if (reference.startsWith('http://') || reference.startsWith('https://')) {
        return `- ${link(reference, reference)}`;
      }

      const resolved = resolveCrefMarkdown(reference, context);
      if (resolved) {
        return `- ${link(resolved.label, resolved.href)}`;
      }

      return `- ${inlineCode(cleanCrefLabel(reference))}`;
    })
  );
}

function renderExamplesMarkdown(examples: any[], context: CSharpDocContext): string {
  if (!examples || examples.length === 0) {
    return '';
  }

  const normalized = examples
    .map((example: any) => {
      if (typeof example === 'string') {
        return {
          code: example,
          description: null,
          language: 'csharp',
          region: null,
        };
      }

      return example;
    })
    .filter((example: any) => example.code);

  if (normalized.length === 0) {
    return '';
  }

  return normalized
    .map((example: any, index: number) => {
      const blocks = [
        normalized.length > 1 ? `### Example ${index + 1}` : '',
        example.region ? `Region: ${inlineCode(example.region)}` : '',
        renderCSharpDocMarkdown(example.description, context),
        codeBlock(example.code, example.language ?? 'csharp'),
      ];

      return finalizeMarkdown(blocks).trim();
    })
    .join('\n\n');
}

function renderMemberParametersMarkdown(
  parameters: any[],
  parameterDocs: Record<string, any>,
  context: CSharpDocContext
): string {
  if (!parameters || parameters.length === 0) {
    return '';
  }

  return bulletList(
    parameters.map((parameter: any) => {
      const badges = [parameter.isOptional ? inlineCode('optional') : null].filter(Boolean).join(' ');
      const description = renderCSharpDocMarkdown(parameterDocs?.[parameter.name], context);
      const notes = renderPolyglotInlineNotes(
        collectPolyglotNotes(parameter.attributes, 'parameter', parameter.name, context.packageName, context.allTypes, context.base)
      );
      const baseLine = `- ${inlineCode(parameter.name)} (${formatCSharpTypeReferenceMarkdown(parameter.type, context)})${badges ? ` ${badges}` : ''}`;
      const detailBlocks = [description, notes].filter((value): value is string => Boolean(value));

      if (detailBlocks.length === 0) {
        return baseLine;
      }

      return `${baseLine}\n${indentMarkdown(detailBlocks.join('\n\n'), '  ')}`;
    })
  );
}

function renderMemberReturnsMarkdown(member: any, context: CSharpDocContext): string {
  if (!member.docs?.returns) {
    return '';
  }

  const description = renderCSharpDocMarkdown(member.docs.returns, context);
  const returnType = member.returnType && member.returnType !== 'void'
    ? formatCSharpTypeReferenceMarkdown(member.returnType, context)
    : null;

  return [returnType, description].filter(Boolean).join(' — ');
}

function renderMemberExceptionsMarkdown(exceptions: any[], context: CSharpDocContext): string {
  if (!exceptions || exceptions.length === 0) {
    return '';
  }

  return bulletList(
    exceptions.map((exception: any) => {
      const { fullName, simpleName } = parseSeeAlso(exception.type);
      const match = context.allTypes.find((type: any) => type.fullName === fullName);
      const typeMarkdown = match
        ? link(simpleName, csharpTypeMdHref(context.base, context.packageName, match.name, genericArity(match)))
        : inlineCode(simpleName);
      const description = renderCSharpDocMarkdown(exception.description, context);
      return `- ${typeMarkdown}${description ? ` — ${description}` : ''}`;
    })
  );
}

function renderMemberStatusNotes(member: any, context: CSharpDocContext): string {
  const obsoleteAttribute = findAttribute(member.attributes, 'Obsolete');
  const experimentalAttribute = findAttribute(member.attributes, 'Experimental');

  const blocks = [
    obsoleteAttribute
      ? `> **Obsolete:** ${obsoleteAttribute.constructorArguments?.[0] ?? 'This member is obsolete.'}`
      : '',
    experimentalAttribute
      ? `> **Experimental:** ${experimentalAttribute.constructorArguments?.[0] ?? 'This member is experimental.'}${renderExperimentalLearnMore(experimentalAttribute.constructorArguments?.[0], context.base)}`
      : '',
  ].filter(Boolean);

  return blocks.join('\n\n');
}

function formatMemberSignatureMarkdown(member: any, parentType: any): string {
  const classBodySignature = member.signature
    ? buildClassBodySignature(member.signature, buildParentTypeInfo(parentType), member.kind)
    : null;
  const cleanedSignature = member.signature ? cleanMemberSignature(member.signature) : '';
  let formatted = classBodySignature ?? (cleanedSignature ? formatSignature(cleanedSignature) : '');

  if (formatted && (member.kind === 'property' || member.kind === 'indexer')) {
    const parts: string[] = [];
    if (member.hasGet) {
      parts.push('get');
    }
    if (member.hasSet) {
      parts.push(member.isInitOnly ? 'init' : 'set');
    }
    if (parts.length > 0) {
      formatted = `${formatted.trimEnd()} { ${parts.join('; ')}; }`;
    }
  }

  return formatted;
}

function buildParentTypeInfo(type: any): any {
  return {
    accessibility: type.accessibility,
    genericParameters: type.genericParameters,
    isAbstract: type.isAbstract,
    isGeneric: type.isGeneric,
    isSealed: type.isSealed,
    isStatic: type.isStatic,
    kind: type.kind,
    name: type.name,
  };
}

function formatCSharpTypeReferenceMarkdown(raw: string, context: CSharpDocContext): string {
  const linkTarget = resolveTypeMarkdownLink(raw, context);
  const label = shortTypeName(raw);
  return linkTarget ? link(label, linkTarget) : inlineCode(label);
}

function resolveTypeMarkdownLink(raw: string, context: CSharpDocContext): string | null {
  const cleaned = raw
    .replace(/\?$/, '')
    .replace(/^System\.Threading\.Tasks\.Task<(.+)>$/, '$1')
    .replace(/^System\.Collections\.Generic\.\w+<(.+)>$/, '$1');

  const match = context.allTypes.find((type: any) => type.fullName === cleaned || type.fullName === raw);
  if (!match) {
    return null;
  }

  return csharpTypeMdHref(context.base, context.packageName, match.name, genericArity(match));
}

function resolveCrefMarkdown(cref: string, context: CSharpDocContext): { href: string; label: string } | null {
  const { prefix, fullName, simpleName } = parseSeeAlso(cref);

  if (prefix === 'T' || prefix === '') {
    const match = context.allTypes.find((type: any) => type.fullName === fullName);
    if (!match) {
      return null;
    }

    return {
      href: csharpTypeMdHref(context.base, context.packageName, match.name, genericArity(match)),
      label: simpleName,
    };
  }

  if (['M', 'P', 'F', 'E'].includes(prefix)) {
    const paramStart = fullName.indexOf('(');
    const fullNameWithoutParams = paramStart >= 0 ? fullName.slice(0, paramStart) : fullName;
    const fullNameWithoutArity = fullNameWithoutParams.replace(/``\d+/g, '');
    const lastDot = fullNameWithoutArity.lastIndexOf('.');

    if (lastDot <= 0) {
      return null;
    }

    const ownerFullName = fullNameWithoutArity.slice(0, lastDot);
    const memberName = fullNameWithoutArity.slice(lastDot + 1);
    const ownerType = context.allTypes.find((type: any) => type.fullName === ownerFullName);
    if (!ownerType) {
      return null;
    }

    const memberKind = prefix === 'P'
      ? 'property'
      : prefix === 'F'
        ? 'field'
        : prefix === 'E'
          ? 'event'
          : memberName === '.ctor'
            ? 'constructor'
            : 'method';

    const memberParams = paramStart >= 0 ? splitCrefParams(fullName.slice(paramStart + 1, fullName.lastIndexOf(')'))) : [];
    const candidateMembers = (ownerType.members ?? []).filter((member: any) => {
      if (memberName === '.ctor') {
        return member.name === '.ctor';
      }

      return member.name === memberName;
    });

    const matchedMember = candidateMembers.find((member: any) => {
      const types = (member.parameters ?? []).map((parameter: any) => shortTypeName(parameter.type));
      if (types.length !== memberParams.length) {
        return false;
      }

      return types.every((typeName: string, index: number) => typeName === memberParams[index]);
    }) ?? candidateMembers[0];

    const href = csharpMemberKindMdHref(
      context.base,
      context.packageName,
      ownerType.name,
      genericArity(ownerType),
      matchedMember?.kind ?? memberKind
    );
    const anchor = matchedMember ? `#${memberSlug(matchedMember)}` : '';
    const label = matchedMember
      ? `${ownerType.name}.${getCSharpMemberHeading(matchedMember, ownerType.name)}`
      : cleanCrefLabel(cref);

    return {
      href: `${href}${anchor}`,
      label,
    };
  }

  return null;
}

function cleanCrefLabel(cref: string): string {
  const { fullName } = parseSeeAlso(cref);
  const paramStart = fullName.indexOf('(');
  const withoutParams = paramStart >= 0 ? fullName.slice(0, paramStart) : fullName;
  const withoutArity = withoutParams.replace(/``\d+/g, '');
  const lastDot = withoutArity.lastIndexOf('.');

  if (lastDot < 0) {
    return withoutArity;
  }

  const secondLastDot = withoutArity.lastIndexOf('.', lastDot - 1);
  return secondLastDot >= 0 ? withoutArity.slice(secondLastDot + 1) : withoutArity.slice(lastDot + 1);
}

function renderInlineNodes(nodes: any[], context: CSharpDocContext): string {
  let output = '';

  for (let index = 0; index < nodes.length; index++) {
    const node = nodes[index];
    if (!node) {
      continue;
    }

    const leadingSpace = needsSpaceBefore(nodes, index) ? ' ' : '';

    switch (node.kind) {
      case 'text':
        output += `${leadingSpace}${node.text ?? ''}`;
        break;
      case 'code':
        output += `${leadingSpace}${inlineCode(node.text ?? '')}`;
        break;
      case 'cref': {
        const resolved = resolveCrefMarkdown(node.value ?? '', context);
        output += resolved
          ? `${leadingSpace}${link(resolved.label, resolved.href)}`
          : `${leadingSpace}${inlineCode(cleanCrefLabel(node.value ?? ''))}`;
        break;
      }
      case 'href':
        output += `${leadingSpace}${link(node.text ?? node.value ?? '', node.value ?? '#')}`;
        break;
      case 'langword':
      case 'paramref':
      case 'typeparamref':
        output += `${leadingSpace}${inlineCode(node.value ?? '')}`;
        break;
      default:
        output += `${leadingSpace}${node.text ?? node.value ?? ''}`;
        break;
    }
  }

  return output.replace(/[ \t]+\n/g, '\n').replace(/\s+/g, ' ').trim();
}

function renderDocList(node: any, context: CSharpDocContext): string {
  const items = node.items ?? [];
  if (items.length === 0) {
    return '';
  }

  if (node.style === 'table') {
    const headerTerm = renderCompactDocMarkdown(node.header?.term, context) || 'Term';
    const headerDescription = renderCompactDocMarkdown(node.header?.description, context) || 'Description';
    const rows = items.map((item: any) => {
      const term = renderCompactDocMarkdown(item.term, context);
      const description = renderCompactDocMarkdown(item.description, context);
      return `| ${escapeTableCell(term)} | ${escapeTableCell(description)} |`;
    });

    return [
      `| ${escapeTableCell(headerTerm)} | ${escapeTableCell(headerDescription)} |`,
      '| --- | --- |',
      ...rows,
    ].join('\n');
  }

  return items
    .map((item: any, index: number) => {
      const marker = node.style === 'number' ? `${index + 1}. ` : '- ';
      const term = item.term ? `**${renderInlineNodes(item.term, context)}**` : '';
      const description = renderCSharpDocMarkdown(item.description, context);
      const combined = `${term ? `${term} — ` : ''}${description}`.trim();

      if (!combined) {
        return '';
      }

      const lines = combined.split('\n');
      const rest = lines.slice(1).map((line) => (line ? `   ${line}` : '')).join('\n');
      return `${marker}${lines[0]}${rest ? `\n${rest}` : ''}`;
    })
    .filter(Boolean)
    .join('\n');
}

function renderCompactDocMarkdown(content: any, context: CSharpDocContext): string {
  return renderCSharpDocMarkdown(content, context).replace(/\s+/g, ' ').trim();
}

function isBlockNode(node: any): boolean {
  return ['codeblock', 'list', 'note', 'para'].includes(node.kind);
}

function needsSpaceBefore(nodes: any[], index: number): boolean {
  if (index === 0) {
    return false;
  }

  const previous = nodes[index - 1];
  const node = nodes[index];
  if (['codeblock', 'list', 'note', 'para'].includes(node.kind)) {
    return false;
  }
  if (node.kind === 'text' && node.text && /^[\s,.:;!?)}\]]/.test(node.text)) {
    return false;
  }
  if (previous.kind !== 'text') {
    return true;
  }
  if (previous.text && !/\s$/.test(previous.text)) {
    return true;
  }

  return false;
}

function getPackageSourceHref(types: any[], pkg: any): string | null {
  const directories = types
    .map((type: any) => type.sourceFile as string | undefined)
    .filter((path): path is string => !!path)
    .map((path) => path.split('/').slice(0, -1));

  if (directories.length === 0 || !pkg.package.sourceRepository || !pkg.package.sourceCommit) {
    return null;
  }

  let common = directories[0] ?? [];
  for (const directory of directories.slice(1)) {
    let index = 0;
    while (index < common.length && index < directory.length && common[index] === directory[index]) {
      index++;
    }
    common = common.slice(0, index);
    if (common.length === 0) {
      return `${pkg.package.sourceRepository}/tree/${pkg.package.sourceCommit}`;
    }
  }

  const commonPath = common.join('/');
  return commonPath
    ? `${pkg.package.sourceRepository}/tree/${pkg.package.sourceCommit}/${commonPath}`
    : `${pkg.package.sourceRepository}/tree/${pkg.package.sourceCommit}`;
}

function getTypeSourceHref(type: any, pkg: any): string | null {
  if (!pkg.package.sourceRepository || !pkg.package.sourceCommit) {
    return null;
  }

  const baseUrl = `${pkg.package.sourceRepository}/blob/${pkg.package.sourceCommit}`;
  return type.sourceFile ? `${baseUrl}/${type.sourceFile}` : `${pkg.package.sourceRepository}/tree/${pkg.package.sourceCommit}`;
}

function getMemberSourceHref(member: any, pkg: any): string | null {
  if (!pkg.package.sourceRepository || !pkg.package.sourceCommit || !member.sourceFile) {
    return null;
  }

  const baseUrl = `${pkg.package.sourceRepository}/blob/${pkg.package.sourceCommit}/${member.sourceFile}`;
  if (!member.sourceLines) {
    return baseUrl;
  }

  const [start, end] = String(member.sourceLines).split('-');
  const lineFragment = start === end ? `#L${start}` : `#L${start}-L${end}`;
  return `${baseUrl}${lineFragment}`;
}

function getAccessorBadge(member: any): string | null {
  if (member.kind !== 'property' && member.kind !== 'indexer') {
    return null;
  }

  if (member.hasGet && !member.hasSet) {
    return inlineCode('get');
  }

  if (!member.hasGet && member.hasSet) {
    return inlineCode('set');
  }

  if (member.hasGet && member.hasSet) {
    return inlineCode(member.isInitOnly ? 'get; init' : 'get; set');
  }

  return null;
}

function getCSharpMemberHeading(member: any, typeName: string): string {
  const rawDisplayName = memberDisplayName(member);
  if (member.name === '.ctor') {
    return rawDisplayName.replace('.ctor', typeName);
  }

  return rawDisplayName;
}

function splitCrefParams(paramList: string): string[] {
  if (!paramList) {
    return [];
  }

  const params: string[] = [];
  let current = '';
  let depth = 0;

  for (const character of paramList) {
    if (character === '<' || character === '(') {
      depth++;
    } else if (character === '>' || character === ')') {
      depth--;
    }

    if (character === ',' && depth === 0) {
      params.push(shortTypeName(current.trim()));
      current = '';
      continue;
    }

    current += character;
  }

  if (current.trim()) {
    params.push(shortTypeName(current.trim()));
  }

  return params;
}

function collectPolyglotNotes(
  attributes: any[] | undefined,
  context: 'type' | 'member' | 'parameter',
  entityName: string,
  packageName: string,
  allTypes: any[],
  base: string
): PolyglotNote[] {
  const exportAttribute = findAttribute(attributes, 'AspireExport');
  const dtoAttribute = findAttribute(attributes, 'AspireDto');
  const ignoreAttribute = findAttribute(attributes, 'AspireExportIgnore');
  const unionAttribute = findAttribute(attributes, 'AspireUnion');

  const notes: PolyglotNote[] = [];

  if (exportAttribute) {
    const exportId = exportAttribute.constructorArguments?.[0];
    const exportMethodName = getAttributeArgument(exportAttribute, 'MethodName');
    const exportType = getAttributeArgument(exportAttribute, 'Type');
    const exposeProperties = getAttributeFlag(exportAttribute, 'ExposeProperties');
    const exposeMethods = getAttributeFlag(exportAttribute, 'ExposeMethods');
    const runSyncOnBackgroundThread = getAttributeFlag(exportAttribute, 'RunSyncOnBackgroundThread');

    const lines = [
      context === 'member' && exportId
        ? `Capability ID: ${inlineCode(packageName ? `${packageName}/${exportId}` : exportId)}`
        : null,
      context === 'type' && !exportType && entityName && packageName
        ? `Type ID: ${inlineCode(`${packageName}/${entityName}`)}`
        : null,
      exportType ? `Export target: ${formatCSharpTypeReferenceMarkdown(exportType, { allTypes, base, packageName })}` : null,
      !exportId && !exportType && !(context === 'type' && entityName && packageName)
        ? 'Available to Polyglot AppHosts through the Aspire Type System.'
        : null,
      exportMethodName ? `Generated method name override: ${inlineCode(exportMethodName)}` : null,
      exposeProperties ? 'Public instance properties are exported as ATS capabilities.' : null,
      exposeMethods ? 'Public instance methods are exported as ATS capabilities.' : null,
      runSyncOnBackgroundThread ? 'Synchronous exports run on a background thread.' : null,
    ].filter(Boolean) as string[];

    if (lines.length > 0) {
      notes.push({ lines, title: 'ATS export' });
    }
  }

  if (dtoAttribute) {
    const dtoTypeId = getAttributeArgument(dtoAttribute, 'DtoTypeId');
    notes.push({
      lines: dtoTypeId
        ? [`Serialized type identifier: ${inlineCode(dtoTypeId)}`]
        : [`Serialized as a plain JSON object without a ${inlineCode('$type')} discriminator.`],
      title: 'ATS DTO',
    });
  }

  if (ignoreAttribute) {
    const ignoreReason = getAttributeArgument(ignoreAttribute, 'Reason');
    notes.push({
      lines: [ignoreReason ? `Reason: ${ignoreReason}` : 'Excluded from automatic Polyglot export.'],
      title: 'Ignored by ATS',
    });
  }

  if (unionAttribute && unionAttribute.constructorArguments?.length) {
    const acceptedTypes = unionAttribute.constructorArguments
      .map((typeName: string) => formatCSharpTypeReferenceMarkdown(typeName, { allTypes, base, packageName }))
      .join(' | ');
    notes.push({
      lines: [`Accepted types: ${acceptedTypes}`],
      title: 'ATS union',
    });
  }

  return notes;
}

function renderPolyglotMarkdownSection(notes: PolyglotNote[]): string {
  if (notes.length === 0) {
    return '';
  }

  const content = notes
    .map((note) => section(note.title, bulletList(note.lines.map((line) => `- ${line}`)), 3))
    .join('\n\n');

  return section('ATS metadata', content);
}

function renderPolyglotInlineNotes(notes: PolyglotNote[]): string {
  if (notes.length === 0) {
    return '';
  }

  return notes.map((note) => `${note.title}: ${note.lines.join(' ')}`).join('; ');
}

function renderExperimentalLearnMore(experimentalId: string | undefined, base: string): string {
  if (!experimentalId) {
    return '';
  }

  return ` · ${link('Learn more', `${normalizeBase(base)}/diagnostics/${experimentalId.toLowerCase()}/`)}`;
}
