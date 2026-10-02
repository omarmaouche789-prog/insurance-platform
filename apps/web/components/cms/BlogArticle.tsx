import { Clock } from "lucide-react";
import type { BlogPostDTO } from "@insurance/shared";
import { formatDate } from "../../lib/format";

// The single rendering of a post, shared by the public blog and the admin
// preview, so "preview" is exactly what readers will see. `content` was
// sanitized by the API when it was saved.
export function BlogArticle({ post }: { post: Pick<BlogPostDTO, "title" | "excerpt" | "content" | "publishedAt" | "author" | "featuredImageUrl" | "featuredImageAlt" | "readingMinutes"> }) {
  return (
    <article className="mx-auto max-w-3xl px-4 py-10 sm:px-6 sm:py-14">
      <header className="mb-8">
        <p className="flex flex-wrap items-center gap-x-3 gap-y-1 text-sm text-gray-500">
          {post.publishedAt && <time dateTime={post.publishedAt}>{formatDate(post.publishedAt)}</time>}
          <span className="inline-flex items-center gap-1">
            <Clock className="h-3.5 w-3.5" aria-hidden /> {post.readingMinutes} min read
          </span>
          {post.author && (
            <span>
              by {post.author.firstName} {post.author.lastName}
            </span>
          )}
        </p>
        <h1 className="mt-3 text-3xl font-bold tracking-tight text-gray-900 sm:text-4xl">{post.title}</h1>
        {post.excerpt && <p className="mt-4 text-lg text-gray-600">{post.excerpt}</p>}
      </header>
      {post.featuredImageUrl && (
        // eslint-disable-next-line @next/next/no-img-element -- served by our API with long cache headers
        <img src={post.featuredImageUrl} alt={post.featuredImageAlt ?? ""} className="mb-10 aspect-[2/1] w-full rounded-2xl border border-gray-200 object-cover" />
      )}
      <div className="prose-content text-gray-800" dangerouslySetInnerHTML={{ __html: post.content }} />
    </article>
  );
}
