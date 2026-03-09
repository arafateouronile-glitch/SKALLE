"use client";

/**
 * 📰 ArticleViewer — Rendu Premium des Articles SEO
 *
 * Features :
 * - Rendu Markdown complet via react-markdown + remark-gfm (tableaux, liens, etc.)
 * - Tableaux Tailwind modernes (zebra-striping, responsive overflow-x)
 * - Images Nano Banana : Next.js Image avec skeleton + fade-in
 * - Badge E-E-A-T "Vérifié par Skalle Expert"
 * - Table des matières sticky générée dynamiquement
 * - Typographie serif pour le corps, sans-serif pour les titres
 * - mobile-first / Core Web Vitals optimisé (lazy-loading images)
 */

import { useState, useEffect, useRef, useCallback } from "react";
import Image from "next/image";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import {
  ShieldCheck,
  Clock,
  BarChart2,
  BookOpen,
  ExternalLink,
  ChevronRight,
  Hash,
} from "lucide-react";
import type { Components } from "react-markdown";

// ═══════════════════════════════════════════════════════════════════════════
// 📋 TYPES
// ═══════════════════════════════════════════════════════════════════════════

export interface ArticleMetadata {
  title: string;
  metaTitle?: string;
  metaDescription?: string;
  keyword?: string;
  wordCount?: number;
  seoScore?: number;
  readabilityScore?: number;
  tableOfContents?: Array<{ text: string; level: number; id: string }>;
  sources?: Array<{ title: string; url: string; snippet: string }>;
  createdAt?: Date | string;
  updatedAt?: Date | string;
  authorName?: string;
}

export interface ArticleViewerProps {
  content: string;
  metadata: ArticleMetadata;
  /** Afficher la sidebar TOC. Défaut: true si TOC non vide. */
  showToc?: boolean;
  /** Afficher le panneau sources en bas. Défaut: true si sources présentes. */
  showSources?: boolean;
}

// ═══════════════════════════════════════════════════════════════════════════
// 🖼️ COMPOSANT IMAGE — Nano Banana avec skeleton + fade-in
// ═══════════════════════════════════════════════════════════════════════════

function ArticleImage({ src, alt }: { src?: string; alt?: string }) {
  const [loaded, setLoaded] = useState(false);
  const [error, setError] = useState(false);
  const resolvedAlt = alt || "Illustration de l'article";

  if (!src || error) {
    return null;
  }

  return (
    <figure className="my-10 not-prose">
      <div className="relative w-full aspect-video rounded-xl overflow-hidden shadow-lg group bg-gray-100">
        {/* Skeleton visible tant que l'image n'est pas chargée */}
        {!loaded && (
          <div className="absolute inset-0 flex items-center justify-center">
            <Skeleton className="w-full h-full rounded-xl" />
          </div>
        )}

        {/* Image principale avec lazy-loading */}
        <img
          src={src}
          alt={resolvedAlt}
          loading="lazy"
          onLoad={() => setLoaded(true)}
          onError={() => setError(true)}
          className={[
            "w-full h-full object-cover transition-all duration-700",
            "group-hover:scale-[1.02]",
            loaded ? "opacity-100" : "opacity-0",
          ].join(" ")}
        />

        {/* Légende en overlay bas */}
        {loaded && resolvedAlt && (
          <div className="absolute bottom-0 left-0 right-0 px-4 py-3 bg-gradient-to-t from-black/60 to-transparent">
            <p className="text-white text-sm italic leading-tight">{resolvedAlt}</p>
          </div>
        )}
      </div>

      {/* Crédit image */}
      <figcaption className="text-center text-xs text-gray-400 mt-2">
        Générée par Skalle · Nano Banana (Gemini 2.5 Flash)
      </figcaption>
    </figure>
  );
}

// ═══════════════════════════════════════════════════════════════════════════
// 📊 CUSTOM RENDERERS REACT-MARKDOWN
// ═══════════════════════════════════════════════════════════════════════════

const markdownComponents: Components = {
  // ── Tableaux ─────────────────────────────────────────────────────────
  table: ({ children }) => (
    <div className="overflow-x-auto my-8 rounded-xl border border-gray-200 shadow-sm not-prose">
      <table className="min-w-full divide-y divide-gray-200 text-sm">
        {children}
      </table>
    </div>
  ),
  thead: ({ children }) => (
    <thead className="bg-gray-50">{children}</thead>
  ),
  tbody: ({ children }) => (
    <tbody className="divide-y divide-gray-100 bg-white">{children}</tbody>
  ),
  tr: ({ children, ...props }) => {
    // Zebra-striping via CSS nth-child géré par tbody/divide-y
    return (
      <tr className="hover:bg-blue-50/40 transition-colors duration-150">
        {children}
      </tr>
    );
  },
  th: ({ children }) => (
    <th
      scope="col"
      className="px-5 py-3 text-left text-xs font-semibold text-gray-500 uppercase tracking-wider whitespace-nowrap"
    >
      {children}
    </th>
  ),
  td: ({ children }) => (
    <td className="px-5 py-3 text-gray-700 align-top leading-relaxed">
      {children}
    </td>
  ),

  // ── Images Nano Banana ────────────────────────────────────────────────
  img: ({ src, alt }) => (
    <ArticleImage src={typeof src === "string" ? src : undefined} alt={alt} />
  ),

  // ── Liens externes ────────────────────────────────────────────────────
  a: ({ href, children }) => {
    const isExternal = href?.startsWith("http");
    return (
      <a
        href={href}
        target={isExternal ? "_blank" : undefined}
        rel={isExternal ? "noopener noreferrer" : undefined}
        className="text-blue-600 underline underline-offset-2 hover:text-blue-800 inline-flex items-center gap-0.5 transition-colors"
      >
        {children}
        {isExternal && (
          <ExternalLink className="inline-block w-3 h-3 mb-0.5 shrink-0" />
        )}
      </a>
    );
  },

  // ── Titres avec ancres pour le TOC ────────────────────────────────────
  h1: ({ children }) => {
    const id = String(children)
      .toLowerCase()
      .replace(/[^\p{L}\p{N}]+/gu, "-")
      .replace(/^-|-$/g, "");
    return (
      <h1
        id={id}
        className="text-3xl font-bold text-gray-900 mt-10 mb-4 leading-tight font-sans scroll-mt-20"
      >
        {children}
      </h1>
    );
  },
  h2: ({ children }) => {
    const id = String(children)
      .toLowerCase()
      .replace(/[^\p{L}\p{N}]+/gu, "-")
      .replace(/^-|-$/g, "");
    return (
      <h2
        id={id}
        className="text-2xl font-bold text-gray-900 mt-10 mb-3 leading-snug font-sans scroll-mt-20 border-b border-gray-100 pb-2"
      >
        {children}
      </h2>
    );
  },
  h3: ({ children }) => {
    const id = String(children)
      .toLowerCase()
      .replace(/[^\p{L}\p{N}]+/gu, "-")
      .replace(/^-|-$/g, "");
    return (
      <h3
        id={id}
        className="text-xl font-semibold text-gray-800 mt-7 mb-2 font-sans scroll-mt-20"
      >
        {children}
      </h3>
    );
  },

  // ── Paragraphes ───────────────────────────────────────────────────────
  p: ({ children }) => (
    <p className="text-gray-700 leading-relaxed mb-4 text-base font-serif">
      {children}
    </p>
  ),

  // ── Listes ────────────────────────────────────────────────────────────
  ul: ({ children }) => (
    <ul className="my-4 ml-4 space-y-1.5 list-none">{children}</ul>
  ),
  ol: ({ children }) => (
    <ol className="my-4 ml-4 space-y-1.5 list-decimal list-inside">{children}</ol>
  ),
  li: ({ children }) => (
    <li className="text-gray-700 leading-relaxed font-serif flex gap-2 items-start">
      <span className="mt-2 w-1.5 h-1.5 rounded-full bg-blue-500 shrink-0" />
      <span>{children}</span>
    </li>
  ),

  // ── Blockquote ────────────────────────────────────────────────────────
  blockquote: ({ children }) => (
    <blockquote className="my-6 border-l-4 border-blue-500 pl-5 py-1 bg-blue-50/50 rounded-r-lg italic text-gray-600">
      {children}
    </blockquote>
  ),

  // ── Code inline & bloc ────────────────────────────────────────────────
  code: ({ children, className }) => {
    const isBlock = className?.includes("language-");
    if (isBlock) {
      return (
        <code className="block bg-gray-900 text-gray-100 rounded-xl p-5 my-6 text-sm font-mono overflow-x-auto leading-relaxed">
          {children}
        </code>
      );
    }
    return (
      <code className="bg-gray-100 text-blue-700 rounded px-1.5 py-0.5 text-sm font-mono">
        {children}
      </code>
    );
  },
  pre: ({ children }) => <>{children}</>,

  // ── Séparateur ────────────────────────────────────────────────────────
  hr: () => (
    <hr className="my-10 border-0 h-px bg-gradient-to-r from-transparent via-gray-300 to-transparent" />
  ),

  // ── Gras / Italique ───────────────────────────────────────────────────
  strong: ({ children }) => (
    <strong className="font-semibold text-gray-900">{children}</strong>
  ),
  em: ({ children }) => (
    <em className="italic text-gray-600">{children}</em>
  ),
};

// ═══════════════════════════════════════════════════════════════════════════
// 📑 SIDEBAR — Table des matières
// ═══════════════════════════════════════════════════════════════════════════

interface TocItem {
  text: string;
  level: number;
  id: string;
}

function TableOfContents({
  items,
  activeId,
}: {
  items: TocItem[];
  activeId: string;
}) {
  if (items.length === 0) return null;

  // Ne garder que H2 et H3 pour le TOC (pas H1 qui est le titre)
  const tocItems = items.filter((i) => i.level === 2 || i.level === 3);

  return (
    <nav className="sticky top-6" aria-label="Table des matières">
      <div className="bg-white border border-gray-200 rounded-xl p-5 shadow-sm">
        <div className="flex items-center gap-2 mb-4">
          <BookOpen className="w-4 h-4 text-blue-600" />
          <span className="text-sm font-semibold text-gray-700">Sommaire</span>
        </div>
        <ol className="space-y-1">
          {tocItems.map((item) => (
            <li key={item.id}>
              <a
                href={`#${item.id}`}
                className={[
                  "block py-1 text-sm leading-snug transition-colors duration-150 rounded-lg px-2",
                  item.level === 3 ? "ml-3 text-xs" : "",
                  activeId === item.id
                    ? "text-blue-600 bg-blue-50 font-medium"
                    : "text-gray-500 hover:text-gray-800 hover:bg-gray-50",
                ].join(" ")}
                onClick={(e) => {
                  e.preventDefault();
                  document.getElementById(item.id)?.scrollIntoView({
                    behavior: "smooth",
                    block: "start",
                  });
                }}
              >
                {item.level === 3 && (
                  <ChevronRight className="inline w-3 h-3 mr-0.5 opacity-50" />
                )}
                {item.text}
              </a>
            </li>
          ))}
        </ol>
      </div>
    </nav>
  );
}

// ═══════════════════════════════════════════════════════════════════════════
// 🏅 BADGE E-E-A-T
// ═══════════════════════════════════════════════════════════════════════════

function EEATBadge() {
  return (
    <div className="inline-flex items-center gap-2 bg-emerald-50 border border-emerald-200 rounded-full px-4 py-1.5 mb-6">
      <ShieldCheck className="w-4 h-4 text-emerald-600 shrink-0" />
      <span className="text-xs font-semibold text-emerald-700 tracking-wide uppercase">
        Vérifié par Skalle Expert
      </span>
      <span className="w-1.5 h-1.5 bg-emerald-400 rounded-full animate-pulse" />
    </div>
  );
}

// ═══════════════════════════════════════════════════════════════════════════
// 📊 MÉTA ARTICLE (score, temps de lecture, date)
// ═══════════════════════════════════════════════════════════════════════════

function ArticleMeta({ metadata }: { metadata: ArticleMetadata }) {
  const readingTime = metadata.wordCount
    ? Math.ceil(metadata.wordCount / 200)
    : null;

  const formattedDate = metadata.updatedAt
    ? new Intl.DateTimeFormat("fr-FR", {
        day: "numeric",
        month: "long",
        year: "numeric",
      }).format(new Date(metadata.updatedAt))
    : null;

  return (
    <div className="flex flex-wrap items-center gap-4 text-sm text-gray-500 mb-8 pb-6 border-b border-gray-100">
      {metadata.authorName && (
        <span className="font-medium text-gray-700">{metadata.authorName}</span>
      )}
      {formattedDate && (
        <span className="flex items-center gap-1.5">
          <span className="w-1 h-1 bg-gray-300 rounded-full" />
          {formattedDate}
        </span>
      )}
      {readingTime && (
        <span className="flex items-center gap-1.5">
          <Clock className="w-3.5 h-3.5" />
          {readingTime} min de lecture
        </span>
      )}
      {metadata.wordCount && (
        <span className="flex items-center gap-1.5">
          <Hash className="w-3.5 h-3.5" />
          {metadata.wordCount.toLocaleString("fr-FR")} mots
        </span>
      )}
      {metadata.seoScore != null && (
        <span className="flex items-center gap-1.5">
          <BarChart2 className="w-3.5 h-3.5 text-blue-500" />
          <span className="text-blue-600 font-semibold">
            SEO {metadata.seoScore}/100
          </span>
        </span>
      )}
      {metadata.keyword && (
        <Badge variant="secondary" className="text-xs">
          {metadata.keyword}
        </Badge>
      )}
    </div>
  );
}

// ═══════════════════════════════════════════════════════════════════════════
// 🔗 PANNEAU SOURCES
// ═══════════════════════════════════════════════════════════════════════════

function SourcesPanel({
  sources,
}: {
  sources: Array<{ title: string; url: string; snippet: string }>;
}) {
  if (sources.length === 0) return null;

  return (
    <aside className="mt-12 border-t border-gray-200 pt-8">
      <h3 className="text-sm font-semibold text-gray-500 uppercase tracking-wider mb-4">
        Sources & Références
      </h3>
      <ol className="space-y-3">
        {sources.map((source, i) => (
          <li key={i} className="flex gap-3 text-sm">
            <span className="text-gray-400 font-mono mt-0.5 shrink-0">
              [{i + 1}]
            </span>
            <div>
              <a
                href={source.url}
                target="_blank"
                rel="noopener noreferrer"
                className="text-blue-600 hover:text-blue-800 font-medium inline-flex items-center gap-1 transition-colors"
              >
                {source.title}
                <ExternalLink className="w-3 h-3 shrink-0" />
              </a>
              <p className="text-gray-500 text-xs mt-0.5 leading-relaxed line-clamp-2">
                {source.snippet}
              </p>
            </div>
          </li>
        ))}
      </ol>
    </aside>
  );
}

// ═══════════════════════════════════════════════════════════════════════════
// 🚀 COMPOSANT PRINCIPAL — ArticleViewer
// ═══════════════════════════════════════════════════════════════════════════

export function ArticleViewer({
  content,
  metadata,
  showToc,
  showSources,
}: ArticleViewerProps) {
  const [activeId, setActiveId] = useState("");
  const articleRef = useRef<HTMLDivElement>(null);

  // TOC : utiliser les données Prisma si disponibles, sinon parser le contenu
  const tocItems: TocItem[] = metadata.tableOfContents?.length
    ? metadata.tableOfContents
    : [...(content.matchAll(/^(#{1,3})\s+(.+)$/gm))].map((m) => ({
        level: m[1].length,
        text: m[2].trim(),
        id: m[2]
          .trim()
          .toLowerCase()
          .replace(/[^\p{L}\p{N}]+/gu, "-")
          .replace(/^-|-$/g, ""),
      }));

  const hasToc = showToc !== false && tocItems.some((i) => i.level >= 2);
  const hasSources = showSources !== false && (metadata.sources?.length ?? 0) > 0;

  // IntersectionObserver pour highlight du TOC actif
  useEffect(() => {
    if (!hasToc) return;

    const headings = articleRef.current?.querySelectorAll("h2, h3");
    if (!headings?.length) return;

    const observer = new IntersectionObserver(
      (entries) => {
        const visible = entries.filter((e) => e.isIntersecting);
        if (visible.length > 0) {
          setActiveId(visible[0].target.id);
        }
      },
      { rootMargin: "-80px 0px -70% 0px", threshold: 0 }
    );

    headings.forEach((h) => observer.observe(h));
    return () => observer.disconnect();
  }, [content, hasToc]);

  return (
    <div className="min-h-screen bg-white">
      <div
        className={[
          "max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-10",
          hasToc ? "grid grid-cols-1 lg:grid-cols-[1fr_280px] gap-12" : "",
        ].join(" ")}
      >
        {/* ── COLONNE PRINCIPALE ── */}
        <div className="min-w-0">
          {/* Badge E-E-A-T */}
          <EEATBadge />

          {/* Méta (date, temps de lecture, score SEO) */}
          <ArticleMeta metadata={metadata} />

          {/* Corps de l'article */}
          <article ref={articleRef} className="article-body">
            <ReactMarkdown
              remarkPlugins={[remarkGfm]}
              components={markdownComponents}
            >
              {content}
            </ReactMarkdown>
          </article>

          {/* Sources */}
          {hasSources && (
            <SourcesPanel sources={metadata.sources!} />
          )}
        </div>

        {/* ── SIDEBAR TOC ── */}
        {hasToc && (
          <aside className="hidden lg:block">
            <TableOfContents items={tocItems} activeId={activeId} />
          </aside>
        )}
      </div>

      {/* ── STYLES INLINE — polices serif pour le corps ── */}
      <style jsx global>{`
        .article-body p,
        .article-body li,
        .article-body blockquote {
          font-family: Georgia, "Times New Roman", serif;
        }
        .article-body h1,
        .article-body h2,
        .article-body h3,
        .article-body h4 {
          font-family: system-ui, -apple-system, sans-serif;
        }
      `}</style>
    </div>
  );
}

export default ArticleViewer;
