// Taking over the markup a server wrote, instead of building it again. The first render of an app is a walk over the spec that makes
// one node per element, text and marker; with an adopter, each of those steps takes the node the server wrote at that place and makes
// a new one only where the server's markup is not what the render would have made. What was there keeps what a replaced node loses:
// an iframe or a video that is playing, the scroll position of a box, an animation that runs, the text the visitor selected.
//
// The adopter keeps a cursor: `parent` is the element whose children are being taken, `next` the first child not taken yet. A spec
// element is found by its tag and its data-id (the spec path or the explicit id, written on every element); a row of a list by its
// data-key first (alignRow), because all rows share one data-id. Text is found by its place: the server writes a comment between
// neighbouring texts (TEXT_SEPARATOR), so a parser keeps one node for each, and none for an empty one. The separators stay in the page.
//
// A node that is not where it should be never stops the take-over. The step makes a new node at the cursor and goes on, and what the
// server wrote that nothing asked for is removed when its parent is finished (or earlier, when a later step finds its node beyond it).
// So the finished page is always the one a render from nothing makes, and a difference costs the nodes that differ, not the page. The
// count and the first difference are handed to the app (finish), which reports them: they are a bug of the page (a derived value that is
// not pure, markup the HTML parser rewrites), never of the visitor.
//
// Text that comes from a binding is different: its value is state, and state may legitimately differ between the server's last
// render and the browser's first (a shell that is told its page's values after it started). Writing it again is not counted.

import { TEXT_SEPARATOR } from './spec-core.js';
import { describeAdoptionDifference } from './runtime-checks.js';

// The two comments the document writer puts around the markup inside the root (server/document.mjs): they are how a built document is written
// again, not part of the page. They are stepped over and stay.
const isDocumentMarker = (node) => node.nodeType === 8 && (node.data === 'ssr:start' || node.data === 'ssr:end');

// How many siblings are looked at for a node that is not at the cursor. A difference is rare; the bound keeps a page whose whole list
// changed linear instead of quadratic.
const LOOKAHEAD = 100;

export const createAdopter = (root, document) => {
  let parent = root;
  let next = root.firstChild;
  if (next && isDocumentMarker(next)) next = next.nextSibling;
  const frames = [];
  let created = 0; // nodes the render had to make because the server's were not there
  let removed = 0; // nodes the server wrote that nothing asked for
  let first = null; // what the first difference was
  let freshElement = false; // the next element is made new: alignRow found no row for it
  let afterText = false; // the node before the cursor is a text, so a separator the server wrote may be next

  // The words of the first difference are the development checks' (a production build keeps the count and leaves them out).
  const note = (kind, subject, found) => {
    first ??= describeAdoptionDifference(kind, subject, parent === root ? null : parent, found);
  };
  // Takes out the nodes from the cursor up to `until` (not included), or to the end.
  const dropUntil = (until) => {
    while (next && next !== until) {
      const following = next.nextSibling;
      if (!isDocumentMarker(next)) {
        note('extra', null, next);
        next.remove();
        removed++;
      }
      next = following;
    }
  };
  const insertFresh = (node) => {
    parent.insertBefore(node, next);
    created++;
    return node;
  };

  return {
    // Takes the element for a spec element, or makes it, and moves the cursor inside it. The caller finishes with leave().
    element: (tag, dataId, namespace) => {
      const wanted = tag.toLowerCase();
      let found = null;
      if (!freshElement) {
        let node = next;
        for (let looked = 0; node && looked <= LOOKAHEAD; node = node.nextSibling, looked++) {
          if (node.nodeType === 1 && node.localName.toLowerCase() === wanted && node.getAttribute('data-id') === dataId) {
            found = node;
            break;
          }
        }
      }
      freshElement = false;
      let element = found;
      if (found) dropUntil(found);
      else {
        note('element', { tag: wanted, dataId }, next);
        element = insertFresh(namespace ? document.createElementNS(namespace, tag) : document.createElement(tag));
        element.setAttribute('data-id', dataId);
      }
      frames.push({ parent, resume: element.nextSibling });
      parent = element;
      next = element.firstChild;
      afterText = false;
      return element;
    },
    // The element's children are done. What the server wrote beyond them goes, unless the children are not the spec's to take: the
    // slot of a shell (the page's app takes them next) and a textarea (its content is its value).
    leave: (keepChildren) => {
      if (!keepChildren) dropUntil(null);
      ({ parent, resume: next } = frames.pop());
      afterText = false;
    },
    // The text node for a text of the spec. The server wrote a comment between neighbouring texts, so each has a node of its own: it is
    // taken whatever it holds, and written again when it holds something else (counted for a text of the spec, not for one a binding
    // makes: its value is state). An empty text has no node in the markup, so one is made, which is not a difference.
    text: (value, dynamic) => {
      if (afterText && next?.nodeType === 8 && next.data === TEXT_SEPARATOR) next = next.nextSibling; // the comment stays: taking it out would be a write for nothing
      afterText = true;
      // A text node the server wrote for this text is taken even when the value is now empty: a binding whose value became empty is state, and
      // making a new empty node beside the server's would push the cursor past it and rewrite the texts that follow.
      if (next && next.nodeType === 3) {
        const node = next;
        next = node.nextSibling;
        if (node.data !== value) {
          if (!dynamic) {
            note('text', value, node);
            created++;
          }
          node.data = value;
        }
        return node;
      }
      if (value === '') return parent.insertBefore(document.createTextNode(''), next);
      if (!dynamic) note('text', value, next);
      const node = document.createTextNode(value);
      parent.insertBefore(node, next);
      if (!dynamic) created++;
      return node;
    },
    // The marker of a `when` or an `each`: the server wrote an empty comment at each end. Texts and rows that no longer belong are
    // skipped to reach it; an element that is not a row means it is not there.
    comment: () => {
      let node = next;
      for (let looked = 0; node && looked <= LOOKAHEAD; node = node.nextSibling, looked++) {
        if (node.nodeType === 8 && node.data === '') {
          dropUntil(node);
          next = node.nextSibling;
          afterText = false;
          return node;
        }
        if (node.nodeType === 1 && node.getAttribute('data-key') === null) break;
      }
      note('marker', null, next);
      afterText = false;
      return insertFresh(document.createComment(''));
    },
    // Before the row for `key` of a list: the rows the server wrote that come before it and are not in the list any more go. A row
    // that the server did not write is made new, instead of taking another row's element.
    alignRow: (key) => {
      const wanted = String(key);
      let node = next;
      for (let looked = 0; node && looked <= LOOKAHEAD; node = node.nextSibling, looked++) {
        if (node.nodeType === 1 && node.getAttribute('data-key') === wanted) {
          dropUntil(node);
          return;
        }
      }
      freshElement = true;
    },
    // The root is done: what is left of the server's markup goes. Returns what the app reports, or null when nothing differed.
    finish: () => {
      dropUntil(null);
      return created || removed ? { created, removed, first } : null;
    },
  };
};
