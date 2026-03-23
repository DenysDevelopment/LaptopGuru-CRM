"use client";

interface FilterTabsProps<T extends string> {
  value: T;
  onChange: (value: T) => void;
  labels: Record<T, string>;
}

export function FilterTabs<T extends string>({ value, onChange, labels }: FilterTabsProps<T>) {
  return (
    <div className="flex gap-1 bg-gray-100 rounded-lg p-1 w-fit">
      {(Object.keys(labels) as T[]).map((key) => (
        <button
          key={key}
          onClick={() => onChange(key)}
          className={`px-3 py-1.5 text-sm font-medium rounded-md transition-colors ${
            value === key
              ? "bg-white text-gray-900 shadow-sm"
              : "text-gray-500 hover:text-gray-700"
          }`}
        >
          {labels[key]}
        </button>
      ))}
    </div>
  );
}
