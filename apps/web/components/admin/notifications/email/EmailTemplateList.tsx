"use client";

import { useMemo, useState } from "react";
import { ArrowDownAZ, Clock, Mail, Search } from "lucide-react";
import type { EmailTemplateDTO } from "@insurance/shared";
import { formatDate } from "../../../../lib/format";
import { Badge } from "../../../ui/Badge";
import { Card, CardHeader } from "../../../ui/Card";
import { Input, Select } from "../../../ui/Field";
import { EmptyState } from "../../../ui/States";
import { cn } from "../../../ui/cn";

type Sort = "name" | "modified";

export function TemplateStatusBadge({ isDefault }: { isDefault: boolean }) {
  return isDefault ? <Badge tone="gray">Default</Badge> : <Badge tone="amber" dot>Customized</Badge>;
}

export function EmailTemplateList({
  templates,
  selectedId,
  onSelect,
}: {
  templates: EmailTemplateDTO[];
  selectedId: string | null;
  onSelect: (id: string) => void;
}) {
  const [query, setQuery] = useState("");
  const [sort, setSort] = useState<Sort>("name");

  const visible = useMemo(() => {
    const q = query.trim().toLowerCase();
    const matches = q ? templates.filter((t) => t.name.toLowerCase().includes(q) || t.subject.toLowerCase().includes(q)) : templates;
    return [...matches].sort((a, b) => (sort === "name" ? a.name.localeCompare(b.name) : b.updatedAt.localeCompare(a.updatedAt)));
  }, [templates, query, sort]);

  return (
    <Card className="min-w-0">
      <CardHeader
        icon={<Mail className="h-4 w-4" />}
        title="Email templates"
        description={`${templates.length} editable · ${templates.filter((t) => !t.isDefault).length} customized`}
      />
      <div className="flex flex-col gap-2 border-b border-gray-100 px-4 py-3 sm:flex-row lg:flex-col">
        <div className="relative min-w-0 flex-1">
          <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-gray-400" aria-hidden />
          <Input
            type="search"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search name or subject"
            aria-label="Search email templates"
            className="pl-9"
          />
        </div>
        <div className="relative shrink-0">
          {sort === "name" ? (
            <ArrowDownAZ className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-gray-400" aria-hidden />
          ) : (
            <Clock className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-gray-400" aria-hidden />
          )}
          <Select value={sort} onChange={(e) => setSort(e.target.value as Sort)} aria-label="Sort templates" className="pl-9">
            <option value="name">Name (A–Z)</option>
            <option value="modified">Last modified</option>
          </Select>
        </div>
      </div>

      {visible.length === 0 ? (
        <EmptyState title="No matching templates" description={`Nothing matches "${query.trim()}".`} className="py-10" />
      ) : (
        <ul className="divide-y divide-gray-100" role="listbox" aria-label="Email templates">
          {visible.map((t) => {
            const active = t.id === selectedId;
            return (
              <li key={t.id}>
                <button
                  type="button"
                  role="option"
                  aria-selected={active}
                  onClick={() => onSelect(t.id)}
                  className={cn(
                    "relative flex w-full flex-col gap-1 px-5 py-3.5 text-left transition-colors",
                    active ? "bg-indigo-50" : "hover:bg-gray-50",
                  )}
                >
                  {active && <span className="absolute inset-y-0 left-0 w-1 rounded-r bg-[#1e3a5f] dark:bg-[#5b86c4]" aria-hidden />}
                  <span className="flex items-center justify-between gap-2">
                    <span className="truncate text-sm font-medium text-gray-900">{t.name}</span>
                    <TemplateStatusBadge isDefault={t.isDefault} />
                  </span>
                  <span className="truncate text-xs text-gray-600" title={t.subject}>
                    <span className="text-gray-400">Subject:</span> {t.subject}
                  </span>
                  <span className="text-xs text-gray-400">
                    Modified {formatDate(t.updatedAt)}
                    {t.updatedBy && <> · {t.updatedBy}</>}
                  </span>
                </button>
              </li>
            );
          })}
        </ul>
      )}
    </Card>
  );
}
