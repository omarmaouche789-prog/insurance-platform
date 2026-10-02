"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { ExternalLink, Eye, FileText, Newspaper, Pencil, Plus, Search } from "lucide-react";
import type { BlogPostDisplayStatus, BlogPostListResponseDTO } from "@insurance/shared";
import { canEditCms } from "@insurance/shared";
import { useAuth } from "../../../lib/auth-context";
import { formatDate, formatDateTime, formatRelative } from "../../../lib/format";
import { useApiQuery, useDebounced } from "../../../lib/use-api";
import { PostStatusBadge } from "../../../components/cms/PostStatusBadge";
import { ButtonLink } from "../../../components/ui/Button";
import { Card } from "../../../components/ui/Card";
import { Input } from "../../../components/ui/Field";
import { Menu } from "../../../components/ui/Menu";
import { PageContainer, PageHeader } from "../../../components/ui/PageHeader";
import { Pagination } from "../../../components/ui/Pagination";
import { EmptyState, ErrorState, TableSkeleton } from "../../../components/ui/States";
import { FilterTabs } from "../../../components/ui/Tabs";
import { Table, TBody, Td, Th, THead } from "../../../components/ui/Table";

type Tab = "ALL" | BlogPostDisplayStatus;
const PAGE_SIZE = 20;

export default function AdminCmsPage() {
  const { user } = useAuth();
  const router = useRouter();
  const canEdit = canEditCms(user?.adminRole ?? null);
  const [tab, setTab] = useState<Tab>("ALL");
  const [search, setSearch] = useState("");
  const [page, setPage] = useState(1);
  const debounced = useDebounced(search.trim());
  useEffect(() => setPage(1), [tab, debounced]);

  const path = useMemo(() => {
    const p = new URLSearchParams({ page: String(page), pageSize: String(PAGE_SIZE) });
    if (tab !== "ALL") p.set("status", tab);
    if (debounced) p.set("search", debounced);
    return `/api/admin/cms/posts?${p}`;
  }, [tab, debounced, page]);
  const { data, error, loading, reload } = useApiQuery<BlogPostListResponseDTO>(path, "Couldn't load posts");
  const c = data?.statusCounts;

  return (
    <PageContainer wide>
      <PageHeader
        title="Blog"
        description="Educational articles for shoppers. Draft, schedule and publish."
        actions={
          <>
            <ButtonLink href="/blog" icon={<ExternalLink className="h-4 w-4" />}>
              View blog
            </ButtonLink>
            {canEdit && (
              <ButtonLink href="/admin/cms/new" variant="primary" icon={<Plus className="h-4 w-4" />}>
                New post
              </ButtonLink>
            )}
          </>
        }
      />

      <div className="mb-4 flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
        <FilterTabs<Tab>
          label="Post status"
          value={tab}
          onChange={setTab}
          tabs={[
            { value: "ALL", label: "All", count: c ? c.DRAFT + c.SCHEDULED + c.PUBLISHED + c.ARCHIVED : undefined },
            { value: "PUBLISHED", label: "Published", count: c?.PUBLISHED },
            { value: "SCHEDULED", label: "Scheduled", count: c?.SCHEDULED },
            { value: "DRAFT", label: "Drafts", count: c?.DRAFT },
            { value: "ARCHIVED", label: "Archived", count: c?.ARCHIVED },
          ]}
        />
        <div className="relative sm:w-72">
          <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-gray-400" aria-hidden />
          <Input type="search" value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Search titles" className="pl-9" aria-label="Search posts" />
        </div>
      </div>

      <Card>
        {error ? (
          <ErrorState message={error} onRetry={reload} />
        ) : !data ? (
          <TableSkeleton rows={5} cols={4} />
        ) : data.posts.length === 0 ? (
          <EmptyState
            icon={<Newspaper className="h-5 w-5" />}
            title={debounced || tab !== "ALL" ? "No posts match" : "No posts yet"}
            description={debounced || tab !== "ALL" ? "Try another filter." : "Write your first article to help shoppers understand their options."}
            action={canEdit && !debounced && tab === "ALL" && <ButtonLink href="/admin/cms/new" variant="primary">Write a post</ButtonLink>}
          />
        ) : (
          <div className={loading ? "opacity-60 transition-opacity" : "transition-opacity"}>
            <Table>
              <THead>
                <tr>
                  <Th>Post</Th>
                  <Th>Status</Th>
                  <Th>Publish date</Th>
                  <Th>Author</Th>
                  <Th>Updated</Th>
                  <Th className="w-12"><span className="sr-only">Actions</span></Th>
                </tr>
              </THead>
              <TBody>
                {data.posts.map((p) => (
                  <tr key={p.id} className="cursor-pointer transition-colors hover:bg-gray-50" onClick={() => router.push(`/admin/cms/${p.id}`)}>
                    <Td>
                      <div className="flex items-center gap-3">
                        {p.featuredImageUrl ? (
                          // eslint-disable-next-line @next/next/no-img-element -- small API-served thumbnail
                          <img src={p.featuredImageUrl} alt="" className="h-10 w-16 shrink-0 rounded-md border border-gray-200 object-cover" />
                        ) : (
                          <span className="flex h-10 w-16 shrink-0 items-center justify-center rounded-md bg-gray-100 text-gray-400"><FileText className="h-4 w-4" aria-hidden /></span>
                        )}
                        <div className="min-w-0">
                          <Link href={`/admin/cms/${p.id}`} onClick={(e) => e.stopPropagation()} className="block truncate font-medium text-gray-900 hover:underline">{p.title}</Link>
                          <span className="block truncate font-mono text-xs text-gray-500">/blog/{p.slug} · {p.readingMinutes} min</span>
                        </div>
                      </div>
                    </Td>
                    <Td><PostStatusBadge status={p.displayStatus} /></Td>
                    <Td className="whitespace-nowrap text-gray-500">{p.displayStatus === "SCHEDULED" ? formatDateTime(p.publishedAt) : formatDate(p.publishedAt)}</Td>
                    <Td className="whitespace-nowrap">{p.author ? `${p.author.firstName} ${p.author.lastName}` : "—"}</Td>
                    <Td className="whitespace-nowrap text-gray-500">{formatRelative(p.updatedAt)}</Td>
                    <Td>
                      <Menu
                        label={`Actions for ${p.title}`}
                        items={[
                          { label: canEdit ? "Edit" : "Open", href: `/admin/cms/${p.id}`, icon: <Pencil className="h-4 w-4 text-gray-400" aria-hidden /> },
                          { label: "Preview", href: `/admin/cms/${p.id}/preview`, icon: <Eye className="h-4 w-4 text-gray-400" aria-hidden /> },
                          { label: "View live", hidden: p.displayStatus !== "PUBLISHED", href: `/blog/${p.slug}`, icon: <ExternalLink className="h-4 w-4 text-gray-400" aria-hidden /> },
                        ]}
                      />
                    </Td>
                  </tr>
                ))}
              </TBody>
            </Table>
            <Pagination page={page} pageSize={PAGE_SIZE} total={data.total} onPage={setPage} />
          </div>
        )}
      </Card>
    </PageContainer>
  );
}
