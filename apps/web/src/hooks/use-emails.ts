"use client";

import { useState, useCallback, useEffect } from "react";
import type { IncomingEmail, Filter, Category } from "@/types";

interface UseEmailsOptions {
  channelId?: string | null;
}

export function useEmails(options: UseEmailsOptions = {}) {
  const { channelId } = options;
  const [emails, setEmails] = useState<IncomingEmail[]>([]);
  const [filter, setFilter] = useState<Filter>("all");
  const [category, setCategory] = useState<Category>("all");
  const [page, setPage] = useState(1);
  const [totalPages, setTotalPages] = useState(1);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(true);

  const fetchEmails = useCallback(async () => {
    setLoading(true);
    const params = new URLSearchParams({ filter, page: String(page) });
    if (category !== "all") params.set("category", category);
    if (channelId) params.set("channelId", channelId);
    const res = await fetch(`/api/emails?${params}`);
    const data = await res.json();
    setEmails(data.emails);
    setTotalPages(data.totalPages);
    setTotal(data.total);
    setLoading(false);
  }, [filter, category, page, channelId]);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- data fetching pattern
    void fetchEmails();
    const interval = setInterval(() => void fetchEmails(), 60_000);
    return () => clearInterval(interval);
  }, [fetchEmails]);

  const handleFilterChange = useCallback((f: Filter) => {
    setFilter(f);
    setPage(1);
  }, []);

  const handleCategoryChange = useCallback((c: Category) => {
    setCategory(c);
    setPage(1);
  }, []);

  async function handleArchive(id: string) {
    await fetch(`/api/emails/${id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ archived: true }),
    });
    fetchEmails();
  }

  return {
    emails, filter, category, page, totalPages, total, loading,
    setPage, setFilter: handleFilterChange, setCategory: handleCategoryChange,
    fetchEmails, handleArchive,
  };
}
