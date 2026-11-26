// The page's <head>, kept current as the app navigates — what useSeoMeta and
// useHead did in the Nuxt pages.
//
// The server writes the right tags into index.html for the page a visitor (or
// a crawler) first lands on. After that the app moves between pages itself, so
// each page states its own title, description and so on here; a tag a page
// does not state is removed, as unhead removed the tags of a page left behind.

export interface Head {
  title: string;
  description?: string | null;
  robots?: string;
  ogTitle?: string;
  ogDescription?: string | null;
  ogType?: string;
  ogUrl?: string;
  canonical?: string;
}

/**
 * Where the site lives, for canonical and og:url: the origin the production
 * build is served from. In dev (behind a proxy, under a prefix) nothing — the
 * Nuxt app emitted these only when NUXT_PUBLIC_SITE_URL was set.
 */
export function siteOrigin(): string {
  return import.meta.env.PROD ? window.location.origin : "";
}

function meta(attr: "name" | "property", key: string, value: string | null | undefined) {
  let el = document.head.querySelector<HTMLMetaElement>(`meta[${attr}="${key}"]`);
  if (!value) {
    el?.remove();
    return;
  }
  if (!el) {
    el = document.createElement("meta");
    el.setAttribute(attr, key);
    document.head.append(el);
  }
  el.setAttribute("content", value);
}

export function setHead(head: Head): void {
  document.title = head.title;
  meta("name", "description", head.description);
  meta("name", "robots", head.robots);
  meta("property", "og:title", head.ogTitle);
  meta("property", "og:description", head.ogDescription);
  meta("property", "og:type", head.ogType);
  meta("property", "og:url", head.ogUrl);

  let link = document.head.querySelector<HTMLLinkElement>('link[rel="canonical"]');
  if (!head.canonical) {
    link?.remove();
  } else {
    if (!link) {
      link = document.createElement("link");
      link.rel = "canonical";
      document.head.append(link);
    }
    link.href = head.canonical;
  }
}
