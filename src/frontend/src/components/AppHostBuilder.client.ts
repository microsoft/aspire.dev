type AppHostLanguage = 'csharp' | 'typescript';
type EditorState = 'idle' | 'navigating' | 'selecting' | 'typing' | 'switching';

interface DiffHunk {
  startOld: number;
  deleteCount: number;
  insertIndices: number[];
}

const REDUCED_MOTION_QUERY = '(prefers-reduced-motion: reduce)';
const LINE_SELECTOR = 'pre > code > .ec-line';

function isAppHostLanguage(value: string | undefined): value is AppHostLanguage {
  return value === 'csharp' || value === 'typescript';
}

function wait(duration: number): Promise<void> {
  return new Promise((resolve) => window.setTimeout(resolve, duration));
}

function getTextNodes(root: Node): Text[] {
  const nodes: Text[] = [];
  const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT);

  while (walker.nextNode()) {
    nodes.push(walker.currentNode as Text);
  }

  return nodes;
}

function normalizeLineText(value: string | null): string {
  return (value ?? '').replace(/[\r\n]/g, '');
}

function getLineText(line: Element): string {
  return normalizeLineText(line.querySelector('.code')?.textContent ?? line.textContent);
}

function getLines(root: ParentNode): HTMLElement[] {
  return Array.from(root.querySelectorAll<HTMLElement>(LINE_SELECTOR));
}

function createDiffHunks(oldLines: string[], newLines: string[]): DiffHunk[] {
  const table = Array.from({ length: oldLines.length + 1 }, () =>
    Array<number>(newLines.length + 1).fill(0)
  );

  for (let oldIndex = oldLines.length - 1; oldIndex >= 0; oldIndex -= 1) {
    for (let newIndex = newLines.length - 1; newIndex >= 0; newIndex -= 1) {
      table[oldIndex][newIndex] =
        oldLines[oldIndex] === newLines[newIndex]
          ? table[oldIndex + 1][newIndex + 1] + 1
          : Math.max(table[oldIndex + 1][newIndex], table[oldIndex][newIndex + 1]);
    }
  }

  const hunks: DiffHunk[] = [];
  let oldIndex = 0;
  let newIndex = 0;
  let currentHunk: DiffHunk | undefined;

  const flushHunk = () => {
    if (currentHunk) {
      hunks.push(currentHunk);
      currentHunk = undefined;
    }
  };

  while (oldIndex < oldLines.length || newIndex < newLines.length) {
    if (
      oldIndex < oldLines.length &&
      newIndex < newLines.length &&
      oldLines[oldIndex] === newLines[newIndex]
    ) {
      flushHunk();
      oldIndex += 1;
      newIndex += 1;
      continue;
    }

    currentHunk ??= {
      startOld: oldIndex,
      deleteCount: 0,
      insertIndices: [],
    };

    const insertionKeepsMoreLines =
      newIndex < newLines.length &&
      (oldIndex === oldLines.length ||
        table[oldIndex][newIndex + 1] >= table[oldIndex + 1][newIndex]);

    if (insertionKeepsMoreLines) {
      currentHunk.insertIndices.push(newIndex);
      newIndex += 1;
    } else {
      currentHunk.deleteCount += 1;
      oldIndex += 1;
    }
  }

  flushHunk();
  return hunks;
}

function initializeAppHostBuilder(root: HTMLElement): void {
  if (root.dataset.editorEnhanced === 'true') return;

  const codeDisplay = root.querySelector<HTMLElement>('[data-apphost-code-display]');
  const stage = root.querySelector<HTMLElement>('[data-code-stage]');
  const caret = root.querySelector<HTMLElement>('[data-editor-caret]');
  const status = root.querySelector<HTMLElement>('[data-code-status]');
  const motionToggle = root.querySelector<HTMLInputElement>('[data-editor-motion-toggle]');
  const toggleButtons = Array.from(root.querySelectorAll<HTMLButtonElement>('.toggle'));
  const languageButtons = Array.from(root.querySelectorAll<HTMLButtonElement>('.lang-toggle'));
  const languageGroups = Array.from(
    root.querySelectorAll<HTMLElement>('.code-lang-group[data-code-lang]')
  );

  if (
    !codeDisplay ||
    !stage ||
    !caret ||
    !status ||
    !motionToggle ||
    toggleButtons.length === 0 ||
    languageButtons.length === 0
  ) {
    return;
  }

  const selectedLanguage = languageButtons.find(
    (button) => button.getAttribute('aria-pressed') === 'true'
  )?.dataset.lang;
  if (!isAppHostLanguage(selectedLanguage)) return;

  const reducedMotion = window.matchMedia(REDUCED_MOTION_QUERY);
  const isEditorMotionAllowed = () =>
    motionToggle.checked &&
    !reducedMotion.matches &&
    !document.hidden &&
    typeof Element.prototype.animate === 'function';
  let currentLanguage = selectedLanguage;
  let desiredLanguage = selectedLanguage;
  let currentVariant = getVariantKey();
  let desiredVariant = currentVariant;
  let pendingAnnouncement = 'TypeScript AppHost code showing Front end.';
  let processing = false;
  let caretLineIndex = 0;
  let caretColumn = 0;

  const getTemplate = (language: AppHostLanguage, variant: string): HTMLElement | undefined =>
    root.querySelector<HTMLElement>(
      `.code-lang-group[data-code-lang="${language}"] .code-variant[data-variant="${variant}"]`
    ) ?? undefined;

  const setEditorState = (state: EditorState) => {
    stage.dataset.editorState = state;
    codeDisplay.dataset.editorState = state;
  };

  const cloneFrame = (template: HTMLElement): HTMLElement | undefined => {
    const sourceFrame = template.querySelector<HTMLElement>('.expressive-code');
    const frame = sourceFrame?.cloneNode(true);
    if (!(frame instanceof HTMLElement)) return undefined;

    frame.dataset.editorFrame = '';
    frame.querySelectorAll('.copy').forEach((copyButton) => copyButton.remove());

    const title = normalizeLineText(frame.querySelector('.title')?.textContent).trim();
    const codeRegion = frame.querySelector('pre');
    if (title && codeRegion) {
      codeRegion.setAttribute('aria-label', `${title} preview in Build your AppHost`);
    }

    return frame;
  };

  const mountFrame = (language: AppHostLanguage, variant: string): HTMLElement | undefined => {
    const template = getTemplate(language, variant);
    if (!template) return undefined;

    const frame = cloneFrame(template);
    if (!frame) return undefined;

    stage.querySelector('[data-editor-frame]')?.remove();
    stage.insertBefore(frame, caret);
    stage.dataset.codeLang = language;
    stage.dataset.codeVariant = variant;
    return frame;
  };

  const updateCaretPosition = (
    line: HTMLElement,
    column: number,
    travelDuration = 0
  ): Promise<void> => {
    if (!line.isConnected) return Promise.resolve();

    const lineElements = getLines(stage);
    const nextLineIndex = lineElements.indexOf(line);
    if (nextLineIndex >= 0) {
      caretLineIndex = nextLineIndex;
      caretColumn = column;
    }

    const code = line.querySelector<HTMLElement>('.code');
    if (!code) return Promise.resolve();

    const lineRect = line.getBoundingClientRect();
    const codeRect = code.getBoundingClientRect();
    const stageRect = stage.getBoundingClientRect();
    // Empty/blank lines have no text node to anchor to, so the caret falls back to
    // the code element's box left. That box includes Expressive Code's inline
    // padding, so start from the content edge (after the left padding) to keep the
    // caret aligned with the first glyph column instead of hugging the frame edge.
    const codePaddingLeft = parseFloat(getComputedStyle(code).paddingLeft) || 0;
    let caretX = codeRect.left + codePaddingLeft;
    let caretTextRect: DOMRect | undefined;
    let remainingCharacters = Math.max(0, column);
    let foundTextPosition = false;

    for (const textNode of getTextNodes(code)) {
      const textLength = normalizeLineText(textNode.data).length;
      if (remainingCharacters > textLength) {
        remainingCharacters -= textLength;
        continue;
      }

      const range = document.createRange();
      const offset = Math.min(remainingCharacters, textNode.data.length);
      range.setStart(textNode, offset);
      range.collapse(true);
      const rangeRect = Array.from(range.getClientRects()).at(-1) ?? range.getBoundingClientRect();
      caretX = rangeRect.left || caretX;
      caretTextRect = rangeRect;
      foundTextPosition = true;
      break;
    }

    if (!foundTextPosition && column > 0) {
      const textNodes = getTextNodes(code);
      let lastTextNode: Text | undefined;
      for (let index = textNodes.length - 1; index >= 0; index -= 1) {
        if (normalizeLineText(textNodes[index].data).length > 0) {
          lastTextNode = textNodes[index];
          break;
        }
      }
      if (lastTextNode) {
        const range = document.createRange();
        range.setStart(lastTextNode, Math.max(0, lastTextNode.length - 1));
        range.setEnd(lastTextNode, lastTextNode.length);
        const rangeRect =
          Array.from(range.getClientRects()).at(-1) ?? range.getBoundingClientRect();
        caretX = rangeRect.right || caretX;
        caretTextRect = rangeRect;
      }
    }

    const caretLineHeight = caretTextRect?.height || lineRect.height;
    const caretHeight = Math.max(14, Math.min(24, caretLineHeight));
    const caretTop = (caretTextRect?.top || lineRect.top) + (caretLineHeight - caretHeight) / 2;
    const effectiveDuration = isEditorMotionAllowed() ? travelDuration : 0;
    // Snap to the device-pixel grid so the thin caret renders crisp instead of
    // smeared across sub-pixels, keeping it pixel-perfect against the glyphs.
    // Snap the absolute viewport coordinate (not the stage-relative offset) so it
    // stays aligned even when the stage itself sits on a fractional pixel.
    const dpr = window.devicePixelRatio || 1;
    const snap = (value: number) => Math.round(value * dpr) / dpr;
    caret.style.height = `${snap(caretHeight)}px`;
    caret.style.transitionDuration = `${effectiveDuration}ms`;
    caret.style.transform = `translate3d(${snap(caretX) - stageRect.left}px, ${
      snap(caretTop) - stageRect.top
    }px, 0)`;

    return effectiveDuration > 0 ? wait(effectiveDuration) : Promise.resolve();
  };

  const placeCaretAtEnd = async (travelDuration = 0) => {
    const lines = getLines(stage);
    const line = lines.at(-1);
    if (line) {
      await updateCaretPosition(line, getLineText(line).length, travelDuration);
    }
  };

  const repositionCaret = () => {
    const lines = getLines(stage);
    const line = lines[Math.min(caretLineIndex, Math.max(0, lines.length - 1))];
    if (line) {
      void updateCaretPosition(line, Math.min(caretColumn, getLineText(line).length));
    }
  };

  const selectAndDeleteLines = async (
    startIndex: number,
    deleteCount: number
  ): Promise<boolean> => {
    const lines = getLines(stage);
    const selectedLines = lines.slice(startIndex, startIndex + deleteCount);
    const firstLine = selectedLines[0];
    const lastLine = selectedLines.at(-1);
    if (!firstLine || !lastLine) return true;

    setEditorState('navigating');
    await updateCaretPosition(lastLine, getLineText(lastLine).length, 220);
    if (!isEditorMotionAllowed()) return false;

    selectedLines.forEach((line) => line.setAttribute('data-editor-selection', ''));
    setEditorState('selecting');
    await updateCaretPosition(firstLine, 0, 160);
    await wait(260);
    if (!isEditorMotionAllowed()) return false;

    const removals = selectedLines.map(
      (line) =>
        line.animate(
          [
            { opacity: 1, transform: 'translateX(0)' },
            { opacity: 0, transform: 'translateX(-0.35rem)' },
          ],
          {
            duration: 110,
            easing: 'cubic-bezier(0.4, 0, 1, 1)',
            fill: 'forwards',
          }
        ).finished
    );
    await Promise.all(removals);
    if (!isEditorMotionAllowed()) return false;
    selectedLines.forEach((line) => line.remove());
    return true;
  };

  const typeLine = async (
    sourceLine: HTMLElement,
    outputLine: HTMLElement,
    charactersPerStep: number
  ): Promise<boolean> => {
    const sourceCode = sourceLine.querySelector<HTMLElement>('.code');
    const outputCode = outputLine.querySelector<HTMLElement>('.code');
    if (!sourceCode || !outputCode) return true;

    const sourceNodes = getTextNodes(sourceCode);
    const outputNodes = getTextNodes(outputCode);
    const segments = sourceNodes.map((node, index) => ({
      output: outputNodes[index],
      value: normalizeLineText(node.data),
    }));

    outputNodes.forEach((node) => {
      node.data = '';
    });

    let typedCharacters = 0;
    for (const segment of segments) {
      if (!segment.output) continue;

      for (let offset = 0; offset < segment.value.length; offset += charactersPerStep) {
        if (!isEditorMotionAllowed()) return false;
        const nextOffset = Math.min(segment.value.length, offset + charactersPerStep);
        segment.output.data = segment.value.slice(0, nextOffset);
        typedCharacters += nextOffset - offset;
        await updateCaretPosition(outputLine, typedCharacters);

        const lastCharacter = segment.value[nextOffset - 1] ?? '';
        await wait(/[;{}()[\]]/.test(lastCharacter) ? 22 : lastCharacter === ' ' ? 7 : 12);
      }
    }

    outputLine.innerHTML = sourceLine.innerHTML;
    await updateCaretPosition(outputLine, getLineText(outputLine).length);
    return true;
  };

  const insertLines = async (
    code: HTMLElement,
    startIndex: number,
    sourceLines: HTMLElement[]
  ): Promise<boolean> => {
    const totalCharacters = sourceLines.reduce(
      (total, line) => total + getLineText(line).length,
      0
    );
    const charactersPerStep = Math.max(1, Math.ceil(totalCharacters / 120));

    setEditorState('typing');
    for (let index = 0; index < sourceLines.length; index += 1) {
      if (!isEditorMotionAllowed()) return false;
      const sourceLine = sourceLines[index];
      const outputLine = sourceLine.cloneNode(true);
      if (!(outputLine instanceof HTMLElement)) continue;

      outputLine.dataset.editorInserting = '';
      const outputCode = outputLine.querySelector('.code');
      if (outputCode) {
        getTextNodes(outputCode).forEach((node) => {
          node.data = '';
        });
      }
      const referenceLine = getLines(code)[startIndex + index] ?? null;
      code.insertBefore(outputLine, referenceLine);

      await updateCaretPosition(outputLine, 0, index === 0 ? 180 : 55);
      if (!(await typeLine(sourceLine, outputLine, charactersPerStep))) return false;
      delete outputLine.dataset.editorInserting;
      await wait(34);
    }
    return true;
  };

  const animateVariantChange = async (language: AppHostLanguage, targetVariant: string) => {
    const frame = stage.querySelector<HTMLElement>('[data-editor-frame]');
    const code = frame?.querySelector<HTMLElement>('pre > code');
    const template = getTemplate(language, targetVariant);
    if (!frame || !code || !template) {
      mountFrame(language, targetVariant);
      return;
    }

    const oldLines = getLines(frame);
    const targetLines = getLines(template);
    const targetTexts = targetLines.map(getLineText);
    const hunks = createDiffHunks(oldLines.map(getLineText), targetTexts);
    let lineOffset = 0;

    for (const hunk of hunks) {
      const editIndex = hunk.startOld + lineOffset;

      if (hunk.deleteCount > 0) {
        if (!(await selectAndDeleteLines(editIndex, hunk.deleteCount))) {
          mountFrame(language, targetVariant);
          await placeCaretAtEnd();
          return;
        }
      }

      const insertedLines = hunk.insertIndices
        .map((lineIndex) => targetLines[lineIndex])
        .filter((line): line is HTMLElement => line !== undefined);
      if (insertedLines.length > 0) {
        if (!(await insertLines(code, editIndex, insertedLines))) {
          mountFrame(language, targetVariant);
          await placeCaretAtEnd();
          return;
        }
      } else {
        const remainingLines = getLines(stage);
        const nextLine =
          remainingLines[editIndex] ??
          remainingLines[Math.max(0, Math.min(editIndex - 1, remainingLines.length - 1))];
        if (nextLine) {
          const column = remainingLines[editIndex] ? 0 : getLineText(nextLine).length;
          await updateCaretPosition(nextLine, column, 80);
        }
      }

      lineOffset += insertedLines.length - hunk.deleteCount;
    }

    const finalLines = getLines(stage);
    const finalMatchesTarget =
      finalLines.length === targetTexts.length &&
      finalLines.every((line, index) => getLineText(line) === targetTexts[index]);

    if (!finalMatchesTarget) {
      mountFrame(language, targetVariant);
      await placeCaretAtEnd();
    } else {
      stage.dataset.codeVariant = targetVariant;
    }
  };

  const switchLanguage = async (language: AppHostLanguage, variant: string) => {
    const currentFrame = stage.querySelector<HTMLElement>('[data-editor-frame]');
    setEditorState('switching');

    if (currentFrame) {
      await currentFrame.animate(
        [
          { opacity: 1, transform: 'translateY(0)' },
          { opacity: 0, transform: 'translateY(-0.25rem)' },
        ],
        {
          duration: 130,
          easing: 'cubic-bezier(0.4, 0, 1, 1)',
          fill: 'forwards',
        }
      ).finished;
      if (!isEditorMotionAllowed()) {
        mountFrame(language, variant);
        await placeCaretAtEnd();
        return;
      }
    }

    const nextFrame = mountFrame(language, variant);
    if (nextFrame) {
      await nextFrame.animate(
        [
          { opacity: 0, transform: 'translateY(0.25rem)' },
          { opacity: 1, transform: 'translateY(0)' },
        ],
        {
          duration: 180,
          easing: 'cubic-bezier(0.16, 1, 0.3, 1)',
          fill: 'both',
        }
      ).finished;
    }

    await placeCaretAtEnd();
  };

  const processRequestedState = async () => {
    if (processing) return;
    processing = true;
    codeDisplay.setAttribute('aria-busy', 'true');

    try {
      while (
        root.isConnected &&
        (currentLanguage !== desiredLanguage || currentVariant !== desiredVariant)
      ) {
        const nextLanguage = desiredLanguage;
        const nextVariant = desiredVariant;
        const shouldAnimate = isEditorMotionAllowed();

        codeDisplay.dataset.editorMotion = shouldAnimate ? 'animated' : 'reduced';
        if (!shouldAnimate) {
          mountFrame(nextLanguage, nextVariant);
          await placeCaretAtEnd();
        } else if (currentLanguage !== nextLanguage) {
          await switchLanguage(nextLanguage, nextVariant);
        } else {
          await animateVariantChange(nextLanguage, nextVariant);
        }

        currentLanguage = nextLanguage;
        currentVariant = nextVariant;
      }
    } catch (error) {
      console.error('AppHost editor animation failed.', error);
      mountFrame(desiredLanguage, desiredVariant);
      currentLanguage = desiredLanguage;
      currentVariant = desiredVariant;
      await placeCaretAtEnd();
    } finally {
      setEditorState('idle');
      codeDisplay.setAttribute('aria-busy', 'false');
      status.textContent = `${pendingAnnouncement} Code preview updated.`;
      processing = false;

      if (currentLanguage !== desiredLanguage || currentVariant !== desiredVariant) {
        void processRequestedState();
      }
    }
  };

  function getVariantKey(): string {
    const isSelected = (name: string) =>
      root.querySelector(`.toggle[data-toggle="${name}"]`)?.classList.contains('active') ?? false;
    const hasFrontend = isSelected('frontend');
    const hasDatabase = isSelected('database');
    const hasApi = isSelected('api');
    const hasContainer = isSelected('container');
    const hasDeployment = isSelected('deployment');

    if (!hasFrontend && !hasDatabase && !hasApi && !hasContainer) {
      return 'empty';
    }

    let variant = '';
    if (hasDatabase && hasApi && hasFrontend) {
      variant = 'databaseApiFrontend';
    } else if (hasDatabase && hasApi) {
      variant = 'databaseApi';
    } else if (hasDatabase && hasFrontend) {
      variant = 'databaseFrontend';
    } else if (hasDatabase) {
      variant = 'database';
    } else if (hasApi && hasFrontend) {
      variant = 'apiFrontend';
    } else if (hasApi) {
      variant = 'api';
    } else if (hasFrontend) {
      variant = 'frontend';
    } else if (hasContainer) {
      variant = 'container';
    }

    if (hasContainer && variant !== 'container') {
      variant += 'Container';
    }
    if (hasDeployment) {
      variant += 'Deployment';
    }

    return variant;
  }

  motionToggle.addEventListener('change', () => {
    const enabled = motionToggle.checked;
    root.dataset.editorMotionEnabled = String(enabled);
    codeDisplay.dataset.editorMotion = enabled
      ? reducedMotion.matches
        ? 'reduced'
        : 'animated'
      : 'disabled';

    if (enabled) {
      void placeCaretAtEnd();
    }
  });

  languageButtons.forEach((button) => {
    button.addEventListener('click', () => {
      const language = button.dataset.lang;
      if (!isAppHostLanguage(language) || desiredLanguage === language) return;

      languageButtons.forEach((candidate) => {
        const isSelected = candidate === button;
        candidate.classList.toggle('active', isSelected);
        candidate.setAttribute('aria-pressed', String(isSelected));
      });

      desiredLanguage = language;
      desiredVariant = getVariantKey();
      pendingAnnouncement = `AppHost code language changed to ${button.textContent?.trim() ?? language}.`;
      root.dispatchEvent(
        new CustomEvent('aspire:apphost-language-change', {
          bubbles: true,
          detail: { language },
        })
      );
      void processRequestedState();
    });
  });

  toggleButtons.forEach((button) => {
    button.addEventListener('click', () => {
      const isSelected = button.classList.toggle('active');
      button.setAttribute('aria-pressed', String(isSelected));
      desiredVariant = getVariantKey();

      const label = button.textContent?.trim() ?? 'Option';
      pendingAnnouncement = `${label} ${isSelected ? 'added to' : 'removed from'} the AppHost.`;
      void processRequestedState();
    });
  });

  const initialFrame = mountFrame(currentLanguage, currentVariant);
  if (!initialFrame) return;

  root.dataset.editorEnhanced = 'true';
  root.dataset.editorMotionEnabled = String(motionToggle.checked);
  codeDisplay.dataset.editorEnhanced = 'true';
  stage.hidden = false;
  languageGroups.forEach((group) => {
    group.hidden = true;
  });
  setEditorState('idle');

  window.requestAnimationFrame(() => {
    void placeCaretAtEnd();
  });
  void document.fonts?.ready.then(repositionCaret);
  stage.addEventListener('scroll', repositionCaret, true);
}

export function initializeAppHostBuilders(): void {
  document
    .querySelectorAll<HTMLElement>('[data-apphost-builder]')
    .forEach(initializeAppHostBuilder);
}
