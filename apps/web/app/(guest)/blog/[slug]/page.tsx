import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import type { BlogPostDTO } from "@insurance/shared";
import { serverApi } from "../../../../lib/server-api";
import { BlogArticle } from "../../../../components/cms/BlogArticle";

export const dynamic = "force-dynamic";

async function load(slug: string): Promise<BlogPostDTO | null> {
  const res = await serverApi<{ post: BlogPostDTO }>(`/api/blog/posts/${encodeURIComponent(slug)}`);
  return res?.post ?? null;
}

// SEO fields fall back to the title and excerpt when editors leave them blank.
export async function generateMetadata({ params }: { params: { slug: string } }): Promise<Metadata> {
  const post = await load(params.slug).catch(() => null);
  if (!post) return { title: "Article not found" };
  const description = post.seoDescription ?? post.excerpt ?? undefined;
  return {
    title: post.seoTitle ?? post.title,
    description,
    alternates: { canonical: `/blog/${post.slug}` },
    openGraph: {
      type: "article",
      title: post.seoTitle ?? post.title,
      description,
      publishedTime: post.publishedAt ?? undefined,
      images: post.featuredImageUrl ? [{ url: post.featuredImageUrl, alt: post.featuredImageAlt ?? "" }] : undefined,
    },
  };
}

export default async function BlogPostPage({ params }: { params: { slug: string } }) {
  const post = await load(params.slug);
  if (!post) notFound();
  return (
    <div>
      <BlogArticle post={post} />
      <div className="mx-auto max-w-3xl px-4 pb-16 sm:px-6">
        <div className="rounded-2xl border border-gray-200 bg-white p-6 text-center shadow-card">
          <p className="font-semibold text-gray-900">Ready to compare plans?</p>
          <p className="mt-1 text-sm text-gray-500">Enter your ZIP code to see plans available in your area.</p>
          <Link href="/plans" className="mt-4 inline-flex rounded-lg bg-gray-900 px-4 py-2 text-sm font-medium text-white hover:bg-gray-800">
            Find plans
          </Link>
        </div>
        <p className="mt-6 text-center text-sm">
          <Link href="/blog" className="text-gray-500 hover:text-gray-900">← All articles</Link>
        </p>
      </div>
    </div>
  );
}
