import type { ReactNode } from 'react';

type TableSearchBarProps = {
  value: string;
  placeholder: string;
  onChange: (value: string) => void;
  onSearch: () => void;
  onReset: () => void;
  extraControls?: ReactNode;
};

export default function TableSearchBar({
  value,
  placeholder,
  onChange,
  onSearch,
  onReset,
  extraControls,
}: TableSearchBarProps) {
  return (
    <div className="flex flex-wrap gap-2 items-center">
      <input
        type="text"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === 'Enter') {
            onSearch();
          }
        }}
        placeholder={placeholder}
        className="flex-1 min-w-[220px] px-2.5 py-1.5 border border-gray-300 rounded text-sm focus:ring-2 focus:ring-blue-500 focus:border-transparent outline-none"
      />
      {extraControls}
      <button
        onClick={onSearch}
        className="px-3 py-1.5 bg-blue-500 hover:bg-blue-600 text-white rounded text-xs font-medium transition-colors"
      >
        搜尋
      </button>
      <button
        onClick={onReset}
        className="px-3 py-1.5 bg-gray-200 hover:bg-gray-300 text-gray-700 rounded text-xs font-medium transition-colors"
      >
        重設
      </button>
    </div>
  );
}
