"use client";

import { FilterTabs } from "@/components/ui/filter-tabs";
import type { Filter, Category } from "@/types";
import { filterLabels, categoryLabels } from "@/types";

interface EmailFiltersProps {
  filter: Filter;
  category: Category;
  onFilterChange: (f: Filter) => void;
  onCategoryChange: (c: Category) => void;
}

export function EmailFilters({ filter, category, onFilterChange, onCategoryChange }: EmailFiltersProps) {
  return (
    <>
      <div className="mb-3">
        <FilterTabs value={filter} onChange={onFilterChange} labels={filterLabels} />
      </div>
      <div className="mb-6">
        <FilterTabs value={category} onChange={onCategoryChange} labels={categoryLabels} />
      </div>
    </>
  );
}
