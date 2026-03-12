/**
 * 🏗️ Headless CMS Adapters
 *
 * Adaptateurs pour publier des articles SEO vers les CMS headless populaires :
 * - REST API générique (sites custom, Next.js, Nuxt, etc.)
 * - Strapi v4/v5
 * - Sanity (via HTTP API)
 * - Contentful (Management API)
 *
 * Tous les configs sont stockés en JSON chiffré dans ExternalIntegration.
 */

// ═══════════════════════════════════════════════════════════════════════════
// TYPES
// ═══════════════════════════════════════════════════════════════════════════

export interface ArticlePayload {
  title: string;
  content: string;       // HTML
  excerpt?: string;
  imageUrl?: string;
  metaTitle?: string;
  metaDescription?: string;
  keywords?: string[];
  slug?: string;
}

export interface CmsPublishResult {
  success: boolean;
  postId?: string;
  url?: string;
  error?: string;
}

// ─── Config types (stockés comme JSON dans ExternalIntegration.encryptedApiKey) ─

export interface RestApiConfig {
  url: string;           // endpoint POST complet ex: https://mon-site.com/api/articles
  token?: string;        // Bearer token optionnel
  fieldMap?: {           // mapping optionnel des champs Skalle → champs de l'API
    title?: string;
    content?: string;
    excerpt?: string;
    imageUrl?: string;
    metaTitle?: string;
    metaDescription?: string;
    keywords?: string;
    slug?: string;
  };
}

export interface StrapiConfig {
  url: string;           // base URL ex: https://mon-strapi.com
  token: string;         // API token (Settings → API Tokens)
  contentType?: string;  // slug du content type, défaut: "articles"
}

export interface SanityConfig {
  projectId: string;     // ex: abc123
  dataset: string;       // ex: production
  token: string;         // token avec write access
  documentType?: string; // _type Sanity, défaut: "post"
  apiVersion?: string;   // défaut: "2024-01-01"
}

export interface ContentfulConfig {
  spaceId: string;
  accessToken: string;   // Management API token (pas Delivery API)
  environmentId?: string; // défaut: "master"
  contentTypeId?: string; // défaut: "blogPost"
}

// ═══════════════════════════════════════════════════════════════════════════
// 1. REST API GÉNÉRIQUE
// ═══════════════════════════════════════════════════════════════════════════

/**
 * Envoie l'article vers n'importe quel endpoint REST.
 * Le payload suit la structure Skalle sauf si un fieldMap est fourni.
 */
export async function publishToRestApi(
  config: RestApiConfig,
  article: ArticlePayload
): Promise<CmsPublishResult> {
  try {
    // Construire le payload avec mapping optionnel
    const fm = config.fieldMap ?? {};
    const body: Record<string, unknown> = {
      [fm.title ?? "title"]: article.title,
      [fm.content ?? "content"]: article.content,
    };
    if (article.excerpt) body[fm.excerpt ?? "excerpt"] = article.excerpt;
    if (article.imageUrl) body[fm.imageUrl ?? "imageUrl"] = article.imageUrl;
    if (article.metaTitle) body[fm.metaTitle ?? "metaTitle"] = article.metaTitle;
    if (article.metaDescription) body[fm.metaDescription ?? "metaDescription"] = article.metaDescription;
    if (article.keywords?.length) body[fm.keywords ?? "keywords"] = article.keywords;
    if (article.slug) body[fm.slug ?? "slug"] = article.slug;

    const headers: Record<string, string> = { "Content-Type": "application/json" };
    if (config.token) headers["Authorization"] = `Bearer ${config.token}`;

    const res = await fetch(config.url, {
      method: "POST",
      headers,
      body: JSON.stringify(body),
    });

    if (!res.ok) {
      const text = await res.text().catch(() => `HTTP ${res.status}`);
      return { success: false, error: `Erreur ${res.status} : ${text.slice(0, 200)}` };
    }

    const data = await res.json().catch(() => ({}));
    return {
      success: true,
      postId: String(data.id ?? data._id ?? data.data?.id ?? ""),
      url: data.url ?? data.link ?? data.data?.attributes?.url ?? undefined,
    };
  } catch (error) {
    return {
      success: false,
      error: error instanceof Error ? error.message : "Erreur réseau",
    };
  }
}

// ═══════════════════════════════════════════════════════════════════════════
// 2. STRAPI v4 / v5
// ═══════════════════════════════════════════════════════════════════════════

/**
 * Crée une entrée dans Strapi via l'API REST.
 * L'article est créé en "draft" (publishedAt: null).
 */
export async function publishToStrapi(
  config: StrapiConfig,
  article: ArticlePayload
): Promise<CmsPublishResult> {
  try {
    const base = config.url.replace(/\/$/, "");
    const type = config.contentType ?? "articles";
    const slug = article.slug ?? slugify(article.title);

    const payload = {
      data: {
        title: article.title,
        content: article.content,
        excerpt: article.excerpt,
        cover: article.imageUrl,
        seo: {
          metaTitle: article.metaTitle ?? article.title,
          metaDescription: article.metaDescription ?? article.excerpt,
          keywords: article.keywords?.join(", "),
        },
        slug,
        publishedAt: null, // draft
      },
    };

    const res = await fetch(`${base}/api/${type}`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${config.token}`,
      },
      body: JSON.stringify(payload),
    });

    if (!res.ok) {
      const err = await res.json().catch(() => ({}));
      return {
        success: false,
        error: err?.error?.message ?? `Strapi HTTP ${res.status}`,
      };
    }

    const data = await res.json();
    const id = String(data.data?.id ?? "");
    const urlPath = data.data?.attributes?.slug ?? slug;

    return { success: true, postId: id, url: `${base}/${type}/${urlPath}` };
  } catch (error) {
    return {
      success: false,
      error: error instanceof Error ? error.message : "Erreur Strapi",
    };
  }
}

// ═══════════════════════════════════════════════════════════════════════════
// 3. SANITY
// ═══════════════════════════════════════════════════════════════════════════

/**
 * Crée un document dans Sanity via la Mutations API (sans SDK).
 * Le document est créé sans publishedAt (brouillon côté Sanity Studio).
 */
export async function publishToSanity(
  config: SanityConfig,
  article: ArticlePayload
): Promise<CmsPublishResult> {
  try {
    const apiVersion = config.apiVersion ?? "2024-01-01";
    const docType = config.documentType ?? "post";
    const docId = `drafts.${crypto.randomUUID()}`;
    const slug = article.slug ?? slugify(article.title);

    const document = {
      _id: docId,
      _type: docType,
      title: article.title,
      slug: { _type: "slug", current: slug },
      body: article.content,
      excerpt: article.excerpt,
      mainImage: article.imageUrl
        ? { _type: "image", url: article.imageUrl }
        : undefined,
      seo: {
        metaTitle: article.metaTitle ?? article.title,
        metaDescription: article.metaDescription ?? article.excerpt,
        keywords: article.keywords,
      },
    };

    const res = await fetch(
      `https://${config.projectId}.api.sanity.io/v${apiVersion}/data/mutate/${config.dataset}`,
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${config.token}`,
        },
        body: JSON.stringify({
          mutations: [{ createOrReplace: document }],
        }),
      }
    );

    if (!res.ok) {
      const err = await res.json().catch(() => ({}));
      return {
        success: false,
        error: err?.message ?? `Sanity HTTP ${res.status}`,
      };
    }

    return {
      success: true,
      postId: docId,
      url: `https://${config.projectId}.sanity.studio/desk/${docType};${docId}`,
    };
  } catch (error) {
    return {
      success: false,
      error: error instanceof Error ? error.message : "Erreur Sanity",
    };
  }
}

// ═══════════════════════════════════════════════════════════════════════════
// 4. CONTENTFUL
// ═══════════════════════════════════════════════════════════════════════════

/**
 * Crée une entry dans Contentful via la Management API (sans SDK).
 * L'entry est créée en draft (non publiée côté Contentful).
 */
export async function publishToContentful(
  config: ContentfulConfig,
  article: ArticlePayload
): Promise<CmsPublishResult> {
  try {
    const env = config.environmentId ?? "master";
    const contentType = config.contentTypeId ?? "blogPost";
    const slug = article.slug ?? slugify(article.title);

    const fields: Record<string, Record<string, unknown>> = {
      title: { "en-US": article.title },
      slug: { "en-US": slug },
      body: { "en-US": article.content },
    };
    if (article.excerpt) fields.excerpt = { "en-US": article.excerpt };
    if (article.metaTitle) fields.metaTitle = { "en-US": article.metaTitle };
    if (article.metaDescription) fields.metaDescription = { "en-US": article.metaDescription };
    if (article.keywords?.length) fields.keywords = { "en-US": article.keywords };
    if (article.imageUrl) fields.coverImageUrl = { "en-US": article.imageUrl };

    const res = await fetch(
      `https://api.contentful.com/spaces/${config.spaceId}/environments/${env}/entries`,
      {
        method: "POST",
        headers: {
          "Content-Type": "application/vnd.contentful.management.v1+json",
          Authorization: `Bearer ${config.accessToken}`,
          "X-Contentful-Content-Type": contentType,
        },
        body: JSON.stringify({ fields }),
      }
    );

    if (!res.ok) {
      const err = await res.json().catch(() => ({}));
      return {
        success: false,
        error: err?.message ?? `Contentful HTTP ${res.status}`,
      };
    }

    const data = await res.json();
    const entryId = data.sys?.id ?? "";

    return {
      success: true,
      postId: entryId,
      url: `https://app.contentful.com/spaces/${config.spaceId}/entries/${entryId}`,
    };
  } catch (error) {
    return {
      success: false,
      error: error instanceof Error ? error.message : "Erreur Contentful",
    };
  }
}

// ═══════════════════════════════════════════════════════════════════════════
// UTILS
// ═══════════════════════════════════════════════════════════════════════════

function slugify(text: string): string {
  return text
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/(^-|-$)/g, "")
    .slice(0, 100);
}
