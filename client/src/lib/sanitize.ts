import DOMPurify, { type Config, type DOMPurify as Purifier } from "dompurify";

// What markdown may put on the page.
//
// A note is somebody's text, and a PUBLIC or shared one is read by people who
// did not write it — so its raw HTML is untrusted, and everything the renderer
// produces passes through here before it reaches the DOM. The rules are the
// rewrite's (REWRITE.md "Fixes"), the same ones the server applies to its
// pre-render:
//   - no script, style, iframe/frame, object/embed/applet, form controls,
//     base, meta, link (nor noscript/template, which only exist to smuggle);
//   - no on* attributes (DOMPurify never keeps them);
//   - URLs only http(s):, mailto: or relative.
// One exception, because notes depend on it: an image may be a data:image/
// URI. Pasting a screenshot into the editor stores it that way
// (useImagePaste), and refusing them would blank every pasted picture.

const FORBID_TAGS = [
  "script",
  "style",
  "iframe",
  "frame",
  "frameset",
  "object",
  "embed",
  "applet",
  "form",
  "input",
  "button",
  "select",
  "textarea",
  "option",
  "optgroup",
  "datalist",
  "output",
  "base",
  "meta",
  "link",
  "noscript",
  "template",
];

// Attributes that carry a URL DOMPurify does not check, or that act on their own.
const FORBID_ATTR = ["srcset", "ping", "action", "formaction", "background"];

// DOMPurify's own pattern minus every scheme but http(s) and mailto. The second
// half still lets through what is not a URL at all (a width, "center") and a
// relative reference ("/x", "#y", "./z", "z"); a word followed by a colon is a
// scheme and is refused.
export const SAFE_URI = /^(?:(?:https?|mailto):|[^a-z]|[a-z+.-]+(?:[^a-z+.\-:]|$))/i;

const DATA_IMAGE = /^data:image\/(?:png|jpe?g|gif|webp|avif|bmp|svg\+xml)[;,]/i;

/**
 * The attribute the renderer marks its own task checkboxes with. Raw HTML in a
 * note cannot forge it: data-* attributes are stripped, and only a value
 * carrying the current render's nonce is let through (see `sanitize`).
 */
export const TASK_ATTR = "data-kb-task";

const CONFIG: Config = {
  FORBID_TAGS,
  FORBID_ATTR,
  ALLOWED_URI_REGEXP: SAFE_URI,
  ALLOW_DATA_ATTR: false,
};

let purifier: Purifier | null = null;
let nonce = "";

function instance(): Purifier {
  if (purifier) return purifier;
  // Its own instance, so the hooks below never reach anybody else's
  // DOMPurify (Nuxt UI or a library could share the default one).
  const p = DOMPurify(window);
  p.addHook("uponSanitizeAttribute", (node, data) => {
    const name = data.attrName;
    // The renderer's checkbox placeholders, and only those of this render.
    if (name === TASK_ATTR) {
      if (nonce && data.attrValue.startsWith(`${nonce}:`)) data.forceKeepAttr = true;
      else data.keepAttr = false;
      return;
    }
    // data: URIs: an <img src> holding an image, and nothing else.
    if ((name === "src" || name === "href" || name === "xlink:href") && /^\s*data:/i.test(data.attrValue)) {
      if (!(node.nodeName === "IMG" && name === "src" && DATA_IMAGE.test(data.attrValue.trim()))) {
        data.keepAttr = false;
      }
    }
  });
  purifier = p;
  return p;
}

/**
 * Sanitize an HTML string into a fragment of the current document.
 *
 * `trusted` is the nonce the renderer stamped on its own placeholders for this
 * render; without it none survive.
 */
export function sanitize(html: string, trusted = ""): DocumentFragment {
  const p = instance();
  nonce = trusted;
  try {
    return p.sanitize(html, { ...CONFIG, RETURN_DOM_FRAGMENT: true });
  } finally {
    nonce = "";
  }
}
