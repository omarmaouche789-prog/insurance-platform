import type { Metadata } from "next";
import Link from "next/link";
import { BookOpen, Clock } from "lucide-react";
import type { PublicBlogPostListResponseDTO } from "@insurance/shared";
import { formatDate } from "../../../lib/format";
import { serverApi } from "../../../lib/server-api";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "Learn",
  description: "Plain-English guides to choosing and using health insurance.",
};

const PAGE_SIZE = 9;

export default async function BlogIndexPage({ searchParams }: { searchParams: { page?: string } }) {
  const page = Math.max(1, Number(searchParams.page) || 1);
  let data: PublicBlogPostListResponseDTO | null = null;
  let failed = false;
  try {
    data = await serverApi<PublicBlogPostListResponseDTO>(`/api/blog/posts?page=${page}&pageSize=${PAGE_SIZE}`);
  } catch {
    failed = true;
  }
  const pages = data ? Math.max(1, Math.ceil(data.total / PAGE_SIZE)) : 1;

  return (
    <div className="mx-auto max-w-6xl px-4 py-12 sm:px-6">
      <header className="mb-10 max-w-2xl">
        <p className="text-sm font-semibold uppercase tracking-wide text-indigo-600">Learn</p>
        <h1 className="mt-2 text-3xl font-bold tracking-tight text-gray-900 sm:text-4xl">Health insurance, explained</h1>
        <p className="mt-3 text-lg text-gray-600">Guides from our licensed agents to help you compare plans and enroll with confidence.</p>
      </header>

      {failed ? (
        <p className="rounded-xl border border-gray-200 bg-white p-10 text-center text-sm text-gray-500">The blog is temporarily unavailable. Please try again shortly.</p>
      ) : !data || data.posts.length === 0 ? (
        <div className="rounded-xl border border-gray-200 bg-white p-14 text-center">
          <BookOpen className="mx-auto h-8 w-8 text-gray-300" aria-hidden />
          <p className="mt-3 font-medium text-gray-900">No articles yet</p>
          <p className="mt-1 text-sm text-gray-500">Check back soon.</p>
        </div>
      ) : (
        <>
          <ul className="grid gap-6 sm:grid-cols-2 lg:grid-cols-3">
            {data.posts.map((p) => (
              <li key={p.id}>
                <Link href={`/blog/${p.slug}`} className="group flex h-full flex-col overflow-hidden rounded-2xl border border-gray-200 bg-white shadow-card transition-shadow hover:shadow-overlay">
                  {p.featuredImageUrl ? (
                    // eslint-disable-next-line @next/next/no-img-element -- API-served image with cache headers
                    <img src={p.featuredImageUrl} alt={p.featuredImageAlt ?? ""} className="aspect-[2/1] w-full object-cover" />
                  ) : (
                    <div className="flex aspect-[2/1] items-center justify-center bg-gradient-to-br from-indigo-50 to-sky-50">
                      <BookOpen className="h-8 w-8 text-indigo-300" aria-hidden />
                    </div>
                  )}
                  <div className="flex flex-1 flex-col p-5">
                    <h2 className="text-lg font-semibold leading-snug text-gray-900 group-hover:text-indigo-700">{p.title}</h2>
                    {p.excerpt && <p className="mt-2 line-clamp-3 text-sm text-gray-600">{p.excerpt}</p>}
                    <p className="mt-auto flex items-center gap-3 pt-4 text-xs text-gray-500">
                      <time dateTime={p.publishedAt ?? undefined}>{formatDate(p.publishedAt)}</time>
                      <span className="inline-flex items-center gap-1"><Clock className="h-3 w-3" aria-hidden /> {p.readingMinutes} min</span>
                    </p>
                  </div>
                </Link>
              </li>
            ))}
          </ul>
          {pages > 1 && (
            <nav className="mt-10 flex justify-center gap-2 text-sm" aria-label="Pagination">
              {page > 1 && <Link className="rounded-lg border border-gray-300 bg-white px-3 py-1.5 hover:bg-gray-50" href={`/blog?page=${page - 1}`}>← Newer</Link>}
              {page < pages && <Link className="rounded-lg border border-gray-300 bg-white px-3 py-1.5 hover:bg-gray-50" href={`/blog?page=${page + 1}`}>Older →</Link>}
            </nav>
          )}
        </>
      )}
    </div>
  );
}
