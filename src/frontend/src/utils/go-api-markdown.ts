import {
  GO_MARKER_NOTE,
  buildGoDtoDefinition,
  buildGoEnumDefinition,
  buildGoFunctionDefinition,
  buildGoHandleDefinition,
  buildGoHandleMemberDefinition,
  closeUnclosedCodeFences,
  countGoHandleMembers,
  describeGoErrorModel,
  formatGoSignature,
  getGoHandleAppliesTo,
  getGoImportPaths,
  getGoModules,
  getGoOptionsParameterName,
  getGoPropertyValueType,
  goModuleSlug,
  groupGoFunctionsByReceiver,
  parseGoTypeReference,
} from '@utils/go-modules';
import type {
  GoApiDocument,
  GoDtoType,
  GoEnumType,
  GoFunction,
  GoFunctionParameter,
  GoHandleType,
} from '@utils/go-modules';
import {
  bulletList,
  codeBlock,
  dedentText,
  finalizeMarkdown,
  indentMarkdown,
  inlineCode,
  keyValueBullets,
  link,
  normalizeBase,
  section,
} from '@utils/api-markdown-shared';
import { getGoFunctionDisplayKind, getGoFunctionDisplayLabel } from '@utils/go-api-function-kind';
import { normalizeGoDocMarkdown } from '@utils/go-doc-text';
import {
  getGoItemSlug,
  getGoMethods,
  getGoMethodSlug,
  getGoStandaloneFunctions,
  getGoTopLevelRouteItems,
  getGoTypeByName,
} from '@utils/go-api-routes';

type GoItemKind = 'handle' | 'dto' | 'enum' | 'function';
type GoItem = GoHandleType | GoDtoType | GoEnumType | GoFunction;

export function goIndexMdHref(base: string): string {
  return `${normalizeBase(base)}/reference/api/go.md`;
}

export function goModuleMdHref(base: string, moduleName: string): string {
  return `${normalizeBase(base)}/reference/api/go/${goModuleSlug(moduleName)}.md`;
}

export function goItemMdHref(base: string, moduleName: string, itemSlug: string): string {
  return `${normalizeBase(base)}/reference/api/go/${goModuleSlug(moduleName)}/${itemSlug}.md`;
}

export function goMemberMdHref(
  base: string,
  moduleName: string,
  itemSlug: string,
  memberSlug: string
): string {
  return `${normalizeBase(base)}/reference/api/go/${goModuleSlug(moduleName)}/${itemSlug}/${memberSlug}.md`;
}

export function renderGoIndexMarkdown(modules: GoApiDocument[], base: string): string {
  const sorted = [...modules].sort((left, right) => left.package.name.localeCompare(right.package.name));

  const lines = sorted.map((pkg) => {
    const functionCount = getGoStandaloneFunctions(pkg).length;
    const typeCount = (pkg.handleTypes ?? []).length + (pkg.dtoTypes ?? []).length + (pkg.enumTypes ?? []).length;
    const summary = [pkg.package.version ? `v${pkg.package.version}` : null, `${functionCount} functions`, `${typeCount} types`]
      .filter(Boolean)
      .join(' · ');

    return `- ${link(pkg.package.name, goModuleMdHref(base, pkg.package.name))} — ${summary}`;
  });

  const importPaths = getGoImportPaths(sorted);
  const importSentence = importPaths.length === 0
    ? ''
    : importPaths.length === 1
      ? `Every module is part of one flat Go package, imported as ${inlineCode(importPaths[0])}.`
      : `Modules are imported as ${importPaths.map(inlineCode).join(', ')}.`;

  return finalizeMarkdown([
    '# Go API Reference',
    `Browse the Go APIs available when writing an Aspire Go AppHost. ${importSentence}`,
    section('Modules', bulletList(lines)),
  ]);
}

export function renderGoModuleMarkdown(pkg: GoApiDocument, base: string): string {
  const sourceHref = getGoSourceHref(pkg);
  const items = getGoTopLevelRouteItems(pkg);
  const handles = [...(pkg.handleTypes ?? [])].sort(compareByName);
  const dtos = [...(pkg.dtoTypes ?? [])].sort(compareByName);
  const enums = [...(pkg.enumTypes ?? [])].sort(compareByName);
  const standaloneFunctions = [...groupGoFunctionsByReceiver(getGoStandaloneFunctions(pkg)).values()].flat();

  const metadata = keyValueBullets([
    { label: 'Module', value: inlineCode(pkg.package.name) },
    { label: 'Version', value: pkg.package.version ? inlineCode(pkg.package.version) : null },
    { label: 'Import path', value: pkg.package.importPath ? inlineCode(pkg.package.importPath) : null },
    { label: 'Source', value: sourceHref ? link('GitHub', sourceHref) : null },
    { label: 'Functions', value: inlineCode(String(standaloneFunctions.length)) },
    { label: 'Types', value: inlineCode(String(handles.length + dtos.length + enums.length)) },
  ]);

  const handleLines = handles.map((item) => {
    const kinds = [inlineCode(item.isInterface ? 'interface' : 'handle'), item.isMarker ? inlineCode('marker') : null]
      .filter(Boolean)
      .join(' ');
    const count = countGoHandleMembers(item);
    return `- ${link(item.name, goItemMdHref(base, pkg.package.name, getGoItemSlug(item, items)))} — ${kinds} · ${count} members${summaryOf(item.description)}`;
  });

  const dtoLines = dtos.map((item) =>
    `- ${link(item.name, goItemMdHref(base, pkg.package.name, getGoItemSlug(item, items)))} — ${inlineCode('struct')} · ${item.fields?.length ?? 0} fields${summaryOf(item.description)}`
  );

  const enumLines = enums.map((item) =>
    `- ${link(item.name, goItemMdHref(base, pkg.package.name, getGoItemSlug(item, items)))} — ${inlineCode('enum')} · ${(item.members ?? []).length} values${summaryOf(item.description)}`
  );

  const functionLines = standaloneFunctions.map((fn) => {
    const receiver = fn.receiver ? ` · on ${inlineCode(fn.receiver)}` : '';
    return `- ${link(fn.name, goItemMdHref(base, pkg.package.name, getGoItemSlug(fn, items)))} — ${inlineCode(getGoFunctionDisplayKind(fn))}${receiver}${summaryOf(fn.description)}`;
  });

  return finalizeMarkdown([
    `# ${pkg.package.name}`,
    metadata,
    section('Handles', bulletList(handleLines)),
    section('DTOs', bulletList(dtoLines)),
    section('Enums', bulletList(enumLines)),
    section('Functions', bulletList(functionLines)),
    section('Exported values', renderExportedValuesMarkdown(pkg)),
  ]);
}

export function renderGoItemMarkdown(
  pkg: GoApiDocument,
  item: GoItem,
  itemKind: GoItemKind,
  base: string
): string {
  const handleItem = itemKind === 'handle' ? (item as GoHandleType) : null;
  const dtoItem = itemKind === 'dto' ? (item as GoDtoType) : null;
  const enumItem = itemKind === 'enum' ? (item as GoEnumType) : null;
  const functionItem = itemKind === 'function' ? (item as GoFunction) : null;
  const sourceHref = getGoSourceHref(pkg);
  const metadata = keyValueBullets([
    { label: 'Module', value: link(pkg.package.name, goModuleMdHref(base, pkg.package.name)) },
    { label: 'Version', value: pkg.package.version ? inlineCode(pkg.package.version) : null },
    { label: 'Kind', value: inlineCode(getItemKindLabel(itemKind, handleItem, functionItem).toLowerCase()) },
    {
      label: 'Defined on',
      value: functionItem?.receiver ? formatGoTypeReferenceMarkdown(functionItem.receiver, pkg, base) : null,
    },
    { label: 'Source', value: sourceHref ? link('GitHub', sourceHref) : null },
  ]);

  return finalizeMarkdown([
    `# ${item.name}`,
    metadata,
    describe(item.description),
    section('Remarks', describe(item.remarks)),
    section('Definition', codeBlock(buildGoDeclaration(item, itemKind), 'go')),
    handleItem ? section('Embeds', renderEmbedsMarkdown(handleItem.implementedInterfaces ?? [], pkg, base)) : '',
    handleItem ? section('Properties', renderHandlePropertiesMarkdown(handleItem, pkg, base)) : '',
    handleItem ? section('Methods', renderHandleMethodsMarkdown(handleItem, pkg, base)) : '',
    dtoItem ? section('Fields', renderDtoFieldsMarkdown(dtoItem, pkg, base)) : '',
    enumItem ? section('Values', renderEnumValuesMarkdown(enumItem)) : '',
    functionItem ? section('Parameters', renderGoParametersMarkdown(functionItem, pkg, base)) : '',
    functionItem ? section('Options', renderGoOptionsMarkdown(functionItem, pkg, base)) : '',
    functionItem ? section('Returns', renderGoReturnMarkdown(functionItem, pkg, base)) : '',
    handleItem && (handleItem.isInterface || handleItem.isMarker)
      ? section('Applies to', renderAppliesToMarkdown(getGoHandleAppliesTo(handleItem), pkg, base))
      : '',
    functionItem ? section('Applies to', renderAppliesToMarkdown(functionItem.appliesTo ?? [], pkg, base)) : '',
  ]);
}

export function renderGoMemberMarkdownPage(
  pkg: GoApiDocument,
  parentType: GoHandleType,
  method: GoFunction,
  base: string
): string {
  const parentSlug = getGoItemSlug(parentType, getGoTopLevelRouteItems(pkg));
  const metadata = keyValueBullets([
    { label: 'Module', value: link(pkg.package.name, goModuleMdHref(base, pkg.package.name)) },
    {
      label: 'Defined on',
      value: link(parentType.name, goItemMdHref(base, pkg.package.name, parentSlug)),
    },
    { label: 'Version', value: pkg.package.version ? inlineCode(pkg.package.version) : null },
    { label: 'Kind', value: inlineCode('method') },
  ]);

  const definedOn = bulletList([
    `- ${link(parentType.name, goItemMdHref(base, pkg.package.name, parentSlug))} — ${inlineCode(
      parentType.isMarker ? 'marker' : parentType.isInterface ? 'interface' : 'handle'
    )}`,
  ]);

  return finalizeMarkdown([
    `# ${parentType.name}.${method.name}`,
    metadata,
    describe(method.description),
    section('Remarks', describe(method.remarks)),
    section('Definition', codeBlock(buildGoHandleMemberDefinition(parentType, method), 'go')),
    section('Signature', codeBlock(formatGoSignature(method.signature ?? ''), 'go')),
    section('Parameters', renderGoParametersMarkdown(method, pkg, base)),
    section('Options', renderGoOptionsMarkdown(method, pkg, base)),
    section('Returns', renderGoReturnMarkdown(method, pkg, base)),
    section('Defined on', parentType.isMarker ? `${GO_MARKER_NOTE}\n\n${definedOn}` : definedOn),
    parentType.isMarker ? section('Applies to', renderAppliesToMarkdown(method.appliesTo ?? [], pkg, base)) : '',
  ]);
}

function getItemKindLabel(
  itemKind: GoItemKind,
  handleItem: GoHandleType | null,
  functionItem: GoFunction | null
): string {
  if (itemKind === 'handle') {
    return handleItem?.isInterface ? 'Interface' : 'Handle';
  }

  if (itemKind === 'dto') {
    return 'Struct';
  }

  if (itemKind === 'function') {
    return getGoFunctionDisplayLabel(functionItem ?? { receiver: null });
  }

  return 'Enum';
}

function buildGoDeclaration(item: GoItem, itemKind: GoItemKind): string {
  if (itemKind === 'handle') {
    return buildGoHandleDefinition(item);
  }

  if (itemKind === 'dto') {
    return buildGoDtoDefinition(item);
  }

  if (itemKind === 'enum') {
    return buildGoEnumDefinition(item);
  }

  return buildGoFunctionDefinition(item);
}

function renderEmbedsMarkdown(names: string[], pkg: GoApiDocument, base: string): string {
  return bulletList(names.map((name) => `- ${formatGoTypeReferenceMarkdown(name, pkg, base)}`));
}

function renderHandlePropertiesMarkdown(item: GoHandleType, pkg: GoApiDocument, base: string): string {
  const getters = (item.capabilities ?? []).filter(isPropertyGetter).sort(compareByName);
  const setters = (item.capabilities ?? []).filter(isPropertySetter).sort(compareByName);
  if (getters.length === 0 && setters.length === 0) {
    return '';
  }

  const getterLines = getters.map((getter) => {
    const hasSetter = setters.some((setter) => normalizeSetterName(setter.name) === getter.name.toLowerCase());
    const access = hasSetter ? 'get/set' : 'get';
    return `- ${inlineCode(getter.name)}: ${formatGoTypeReferenceMarkdown(getGoPropertyValueType(getter), pkg, base)} ${inlineCode(access)}${summaryOf(getter.description)}`;
  });

  const setterLines = setters
    .filter((setter) => !getters.some((getter) => getter.name.toLowerCase() === normalizeSetterName(setter.name)))
    .map((setter) =>
      `- ${inlineCode(setter.name)}(${formatGoTypeReferenceMarkdown(getGoPropertyValueType(setter), pkg, base)}) ${inlineCode('set')}${summaryOf(setter.description)}`
    );

  return bulletList([...getterLines, ...setterLines]);
}

function renderHandleMethodsMarkdown(item: GoHandleType, pkg: GoApiDocument, base: string): string {
  const methods = getGoMethods(item);
  const synthesized = item.synthesizedMembers ?? [];
  if (methods.length === 0 && synthesized.length === 0) {
    return '';
  }

  const itemSlug = getGoItemSlug(item, getGoTopLevelRouteItems(pkg));
  const methodLines = getGoMethods(item, true).map((method) => {
    const href = goMemberMdHref(base, pkg.package.name, itemSlug, getGoMethodSlug(method, methods, item.name));
    return `- ${link(method.name, href)} — ${inlineCode('method')}${summaryOf(method.description)}\n${indentMarkdown(codeBlock(method.signature ?? '', 'go'), '  ')}`;
  });

  // Hand-written SDK helpers have no capability behind them, so they get no pages.
  const synthesizedLines = synthesized.map((member) =>
    `- ${inlineCode(member.name)} — ${inlineCode('method')}${summaryOf(member.description)}${
      member.signature ? `\n${indentMarkdown(codeBlock(member.signature, 'go'), '  ')}` : ''
    }`
  );

  const entries = bulletList([...methodLines, ...synthesizedLines]);
  return item.isMarker && methods.length > 0 ? `${GO_MARKER_NOTE}\n\n${entries}` : entries;
}

function renderDtoFieldsMarkdown(item: GoDtoType, pkg: GoApiDocument, base: string): string {
  const fields = item.fields ?? [];
  if (fields.length === 0) {
    return '';
  }

  return bulletList(
    fields.map((field) => {
      const badges = [
        field.isOptional ? inlineCode('optional') : null,
        field.isCallback ? inlineCode('callback') : null,
      ]
        .filter(Boolean)
        .join(' ');
      return `- ${inlineCode(field.name)}: ${formatGoTypeReferenceMarkdown(field.type, pkg, base)}${badges ? ` ${badges}` : ''}${summaryOf(field.description)}`;
    })
  );
}

function renderEnumValuesMarkdown(item: GoEnumType): string {
  const members = item.members ?? [];
  if (members.length === 0) {
    return '';
  }

  return bulletList(
    members.map((member) => `- ${inlineCode(member.name)} = ${inlineCode(JSON.stringify(member.value))}${summaryOf(member.description)}`)
  );
}

function renderExportedValuesMarkdown(pkg: GoApiDocument): string {
  return bulletList(
    (pkg.exportedValues ?? []).flatMap((group) =>
      (group.values ?? []).map((entry) => {
        const type = entry.type ? `: ${inlineCode(entry.type)}` : '';
        const value = entry.value ? ` = ${inlineCode(entry.value)}` : '';
        return `- ${inlineCode(`${group.name}.${entry.path}`)}${type}${value}${summaryOf(entry.description)}`;
      })
    )
  );
}

function renderGoParametersMarkdown(callable: GoFunction, pkg: GoApiDocument, base: string): string {
  const parameters = callable.parameters ?? [];
  const lines = parameters.map((parameter: GoFunctionParameter) =>
    `- ${inlineCode(parameter.name)} (${formatGoTypeReferenceMarkdown(parameter.type, pkg, base)})${summaryOf(parameter.description)}`
  );

  if (callable.options?.typeName) {
    const optionsName = getGoOptionsParameterName(callable);
    lines.push(
      `- ${inlineCode(optionsName)} (${inlineCode(`...*${callable.options.typeName}`)}) — optional settings, see ${link('Options', '#options')}`
    );
  }

  return bulletList(lines);
}

function renderGoOptionsMarkdown(callable: GoFunction, pkg: GoApiDocument, base: string): string {
  const options = callable.options;
  if (!options?.typeName) {
    return '';
  }

  if (options.isDirect) {
    return `Optional parameters are passed as the existing ${formatGoTypeReferenceMarkdown(`*${options.typeName}`, pkg, base)} struct.`;
  }

  const fields = options.fields ?? [];
  const lines = fields.map((field) => {
    const type = field.isCallback && field.callbackSignature
      ? inlineCode(field.callbackSignature)
      : formatGoTypeReferenceMarkdown(field.type, pkg, base);
    const callback = field.isCallback ? ` ${inlineCode('callback')}` : '';
    return `- ${inlineCode(field.name)} (${type})${callback}${summaryOf(field.description)}`;
  });

  return [
    `Optional parameters are passed in a trailing ${inlineCode(`${getGoOptionsParameterName(callable)} ...*${options.typeName}`)} argument.`,
    bulletList(lines),
  ]
    .filter(Boolean)
    .join('\n\n');
}

function renderGoReturnMarkdown(callable: GoFunction, pkg: GoApiDocument, base: string): string {
  const returnType = callable.returnType?.trim();
  const typeLine = returnType
    ? `${formatGoTypeReferenceMarkdown(returnType, pkg, base)}${summaryOf(callable.returns)}`
    : describe(callable.returns);

  return [typeLine, describeGoErrorModel(callable)].filter(Boolean).join('\n\n');
}

function renderAppliesToMarkdown(targetTypes: string[], pkg: GoApiDocument, base: string): string {
  return bulletList(targetTypes.map((targetType) => `- ${formatGoTypeReferenceMarkdown(targetType, pkg, base)}`));
}

/**
 * Link a Go type to its page when it is declared in the same module. Types such as
 * `string`, `*List[string]`, `map[string]any` or types from other modules render as code.
 */
function formatGoTypeReferenceMarkdown(typeRef: string | undefined, pkg: GoApiDocument, base: string): string {
  const text = typeRef?.trim();
  if (!text) {
    return inlineCode('any');
  }

  const parsed = parseGoTypeReference(text);
  const item = parsed ? getGoTypeByName(pkg, parsed.name) : undefined;

  return item
    ? link(inlineCode(text), goItemMdHref(base, pkg.package.name, getGoItemSlug(item, getGoTopLevelRouteItems(pkg))))
    : inlineCode(text);
}

/** Description and remarks can hold an unterminated ``` fence; close it so later sections survive. */
function describe(text: string | undefined): string {
  return text ? closeUnclosedCodeFences(dedentText(normalizeGoDocMarkdown(text))) : '';
}

/** Single-line ` — description` suffix for list entries. */
function summaryOf(text: string | undefined): string {
  const oneLine = text ? normalizeGoDocMarkdown(text).replace(/\s+/g, ' ').trim() : '';
  return oneLine ? ` — ${oneLine}` : '';
}

function compareByName<T extends { name: string }>(left: T, right: T): number {
  return left.name.localeCompare(right.name);
}

function isPropertyGetter(capability: GoFunction): boolean {
  return capability.kind === 'PropertyGetter';
}

function isPropertySetter(capability: GoFunction): boolean {
  return capability.kind === 'PropertySetter';
}

function normalizeSetterName(name: string): string {
  return name.replace(/^Set/, '').toLowerCase();
}

function getGoSourceHref(pkg: GoApiDocument): string | undefined {
  if (!pkg.package.sourceRepository) {
    return undefined;
  }

  return pkg.package.sourceCommit
    ? `${pkg.package.sourceRepository}/tree/${pkg.package.sourceCommit}`
    : pkg.package.sourceRepository;
}

export async function getGoMarkdownRouteProps(): Promise<GoApiDocument[]> {
  const packages = await getGoModules();
  return packages.map((entry) => entry.data);
}
