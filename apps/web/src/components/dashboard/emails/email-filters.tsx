"use client";

import { FilterTabs } from "@/components/ui/filter-tabs";
import type { Filter } from "@/types";
import { filterLabels } from "@/types";

interface EmailFiltersProps {
  filter: Filter;
  onFilterChange: (f: Filter) => void;
}

export function EmailFilters({ filter, onFilterChange }: EmailFiltersProps) {
  return (
    <div className="mb-6">
      <FilterTabs value={filter} onChange={onFilterChange} labels={filterLabels} />
    </div>
  );
}
