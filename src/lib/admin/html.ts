/**
 * The one shared traversal module (spec §2.2). Every admin endpoint parses
 * content files with parse5 and walks elements depth-first in document order,
 * assigning each element a sequential ID. Text is addressed as
 * (element ID, child-node index); images by element ID. Because the field
 * list, the preview annotations, and the save operation all run this same
 * traversal over the same source file, IDs are stable across all three.
 */
import { parseFragment, serialize } from 'parse5';

// Elements whose subtrees contain no editable content.
const SKIP_TAGS = new Set(['script', 'style', 'iframe', 'template', 'noscript']);
// Traversal stops descending here (the element itself still gets an ID so
// images/whole-svg clicks resolve, but svg internals are not editable).
const OPAQUE_TAGS = new Set(['svg', 'canvas']);

type P5Node = any;

export interface TextField {
  kind: 'text';
  id: number;
  childIndex: number;
  value: string;
  tag: string;
  group: string;
}

export interface ImageField {
  kind: 'image';
  id: number;
  value: string; // src
  alt: string;
  tag: 'img';
  group: string;
}

export type Field = TextField | ImageField;

export interface Edit {
  kind: 'text' | 'image';
  id: number;
  childIndex?: number;
  value: string;
  baseline?: string;
}

const isElement = (n: P5Node) => typeof n?.tagName === 'string';
const isText = (n: P5Node) => n?.nodeName === '#text';

export const collapseWs = (s: string) => s.replace(/\s+/g, ' ').trim();

function getAttr(el: P5Node, name: string): string | undefined {
  return el.attrs?.find((a: any) => a.name === name)?.value;
}

function setAttr(el: P5Node, name: string, value: string) {
  const existing = el.attrs?.find((a: any) => a.name === name);
  if (existing) existing.value = value;
  else (el.attrs ??= []).push({ name, value });
}

function removeAttr(el: P5Node, name: string) {
  if (el.attrs) el.attrs = el.attrs.filter((a: any) => a.name !== name);
}

/**
 * Depth-first walk over a parsed fragment. `visit` is called for every
 * element with its sequential ID; return value is ignored. Subtrees of
 * skip/opaque tags are not descended into.
 */
function walk(fragment: P5Node, visit: (el: P5Node, id: number) => void) {
  let nextId = 0;
  const visitNode = (node: P5Node) => {
    if (!isElement(node)) return;
    const tag = node.tagName.toLowerCase();
    if (SKIP_TAGS.has(tag)) return;
    const id = nextId++;
    visit(node, id);
    if (OPAQUE_TAGS.has(tag)) return;
    for (const child of node.childNodes ?? []) visitNode(child);
  };
  for (const child of fragment.childNodes ?? []) visitNode(child);
}

/** Human label for a section group, derived from id/class/tag (spec: content endpoint). */
function groupLabel(topLevel: P5Node): string {
  const source = getAttr(topLevel, 'id') || (getAttr(topLevel, 'class') || '').split(/\s+/)[0] || topLevel.tagName;
  const pretty = source
    .replace(/[-_]+/g, ' ')
    .trim()
    .replace(/\b\w/g, (c: string) => c.toUpperCase());
  return pretty || 'Content';
}

/** Extract the editable field list for a content file (spec §3, content endpoint). */
export function extractFields(html: string): Field[] {
  const fragment = parseFragment(html);
  const fields: Field[] = [];

  // Map each element to the top-level fragment child that contains it, for grouping.
  const groups = new Map<P5Node, string>();
  for (const top of fragment.childNodes ?? []) {
    if (!isElement(top)) continue;
    const label = groupLabel(top);
    const stamp = (n: P5Node) => {
      groups.set(n, label);
      for (const c of n.childNodes ?? []) stamp(c);
    };
    stamp(top);
  }

  walk(fragment, (el, id) => {
    const tag = el.tagName.toLowerCase();
    const group = groups.get(el) ?? 'Content';
    if (tag === 'img') {
      fields.push({
        kind: 'image',
        id,
        value: getAttr(el, 'src') ?? '',
        alt: getAttr(el, 'alt') ?? '',
        tag: 'img',
        group,
      });
      return;
    }
    if (OPAQUE_TAGS.has(tag)) return;
    (el.childNodes ?? []).forEach((child: P5Node, childIndex: number) => {
      if (isText(child) && collapseWs(child.value) !== '') {
        fields.push({
          kind: 'text',
          id,
          childIndex,
          value: collapseWs(child.value),
          tag,
          group,
        });
      }
    });
  });

  return fields;
}

/**
 * Return the file's HTML with every traversed element stamped with
 * data-edit-id="<fileKey>#<id>" for the live preview (spec §2.3).
 */
export function annotate(html: string, fileKey: string): string {
  const fragment = parseFragment(html);
  walk(fragment, (el, id) => setAttr(el, 'data-edit-id', `${fileKey}#${id}`));
  return serialize(fragment);
}

export interface ApplyResult {
  html: string;
  applied: number;
  skipped: { id: number; reason: string }[];
}

/**
 * Apply edits by ID against a fresh parse of the file (spec §2.4, §4.8).
 * An edit is skipped when its target no longer exists or its baseline no
 * longer matches (content changed underneath).
 */
export function applyEdits(html: string, edits: Edit[]): ApplyResult {
  const fragment = parseFragment(html);
  const byId = new Map<number, P5Node>();
  walk(fragment, (el, id) => byId.set(id, el));

  let applied = 0;
  const skipped: { id: number; reason: string }[] = [];

  for (const edit of edits) {
    const el = byId.get(edit.id);
    if (!el) {
      skipped.push({ id: edit.id, reason: 'element not found' });
      continue;
    }
    if (edit.kind === 'image') {
      if (el.tagName?.toLowerCase() !== 'img') {
        skipped.push({ id: edit.id, reason: 'not an image' });
        continue;
      }
      if (edit.baseline !== undefined && (getAttr(el, 'src') ?? '') !== edit.baseline) {
        skipped.push({ id: edit.id, reason: 'image changed underneath' });
        continue;
      }
      setAttr(el, 'src', edit.value);
      // A replaced URL must not be overridden by stale responsive sources.
      removeAttr(el, 'srcset');
      removeAttr(el, 'sizes');
      applied++;
    } else {
      const node = (el.childNodes ?? [])[edit.childIndex ?? -1];
      if (!node || !isText(node)) {
        skipped.push({ id: edit.id, reason: 'text node not found' });
        continue;
      }
      if (edit.baseline !== undefined && collapseWs(node.value) !== collapseWs(edit.baseline)) {
        skipped.push({ id: edit.id, reason: 'text changed underneath' });
        continue;
      }
      node.value = edit.value;
      applied++;
    }
  }

  return { html: serialize(fragment), applied, skipped };
}
