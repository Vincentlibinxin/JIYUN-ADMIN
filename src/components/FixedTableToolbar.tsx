import type { ReactNode } from 'react';

type FixedTableToolbarProps = {
  children: ReactNode;
};

export default function FixedTableToolbar({ children }: FixedTableToolbarProps) {
  return (
    <div className="w-full bg-white p-2.5 border border-gray-200 border-b-0 rounded-t">
      {children}
    </div>
  );
}
