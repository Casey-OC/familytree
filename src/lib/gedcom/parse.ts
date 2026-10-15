// GEDCOM 5.5.1 line parser: bytes → text → a tree of records.

export interface GNode {
  level: number;
  xref?: string; // e.g. "@I1@"
  tag: string;
  value: string;
  line: number;
  children: GNode[];
}

export interface Problem {
  line: number;
  kind: 'Warning' | 'Skipped';
  msg: string;
}

/** Works out the text encoding: byte-order marks, then the CHAR header, then UTF-8 with a Windows-1252 fallback. */
export function decodeGedcom(bytes: Uint8Array): { text: string; encoding: string } {
  if (bytes[0] === 0xef && bytes[1] === 0xbb && bytes[2] === 0xbf) return { text: new TextDecoder('utf-8').decode(bytes.subarray(3)), encoding: 'UTF-8' };
  if (bytes[0] === 0xff && bytes[1] === 0xfe) return { text: new TextDecoder('utf-16le').decode(bytes.subarray(2)), encoding: 'UTF-16' };
  if (bytes[0] === 0xfe && bytes[1] === 0xff) return { text: new TextDecoder('utf-16be').decode(bytes.subarray(2)), encoding: 'UTF-16' };
  const head = new TextDecoder('latin1').decode(bytes.subarray(0, 4000));
  const char = (head.match(/\n\s*1\s+CHAR\s+(\S+)/i)?.[1] || '').toUpperCase();
  if (char === 'ANSI' || char === 'WINDOWS-1252' || char === 'CP1252' || char === 'ASCII' || char === 'IBMPC') {
    return { text: new TextDecoder('windows-1252').decode(bytes), encoding: char };
  }
  try {
    return { text: new TextDecoder('utf-8', { fatal: true }).decode(bytes), encoding: char || 'UTF-8' };
  } catch {
    // ANSEL and other legacy encodings: Windows-1252 keeps plain letters readable.
    return { text: new TextDecoder('windows-1252').decode(bytes), encoding: (char || 'Unknown') + ' (read as Windows-1252)' };
  }
}

const LINE = /^\s*(\d{1,2})\s+(?:(@[^@\s]+@)\s+)?([A-Za-z0-9_]+)(?:\s(.*))?$/;

export function parseGedcom(text: string): { roots: GNode[]; problems: Problem[] } {
  const roots: GNode[] = [];
  const problems: Problem[] = [];
  const stack: GNode[] = [];
  const lines = text.split(/\r\n|\r|\n/);
  for (let i = 0; i < lines.length; i++) {
    const raw = lines[i];
    if (!raw.trim()) continue;
    const m = raw.match(LINE);
    if (!m) {
      problems.push({ line: i + 1, kind: 'Skipped', msg: `line “${raw.slice(0, 40)}” isn’t valid GEDCOM.` });
      continue;
    }
    const level = +m[1];
    const tag = m[3].toUpperCase();
    const value = m[4] ?? '';
    if (tag === 'CONC' || tag === 'CONT') {
      const parent = stack[level - 1];
      if (parent) parent.value += (tag === 'CONT' ? '\n' : '') + value;
      continue;
    }
    const node: GNode = { level, tag, value, line: i + 1, children: [] };
    if (m[2]) node.xref = m[2];
    while (stack.length > level) stack.pop();
    if (level === 0) roots.push(node);
    else {
      const parent = stack[level - 1];
      if (!parent) {
        problems.push({ line: i + 1, kind: 'Skipped', msg: `“${tag}” has no parent record.` });
        continue;
      }
      parent.children.push(node);
    }
    stack[level] = node;
    stack.length = level + 1;
  }
  return { roots, problems };
}

export const child = (n: GNode | undefined, tag: string) => n?.children.find((c) => c.tag === tag);
export const children = (n: GNode | undefined, tag: string) => (n ? n.children.filter((c) => c.tag === tag) : []);
export const val = (n: GNode | undefined, tag: string) => child(n, tag)?.value.trim() ?? '';
