import React, { useState } from 'react';

interface PaginationProps {
  currentPage: number;
  totalPages: number;
  totalItems: number;
  pageSize: number;
  pageSizeOptions?: number[];
  onPageChange: (page: number) => void;
  onPageSizeChange: (size: number) => void;
}

export default function Pagination({
  currentPage,
  totalPages,
  totalItems,
  pageSize,
  pageSizeOptions = [10, 20, 30, 50],
  onPageChange,
  onPageSizeChange
}: PaginationProps) {
  const [jumpInput, setJumpInput] = useState<string>('');
  const [showJumpInput, setShowJumpInput] = useState(false);

  // 智能計算顯示的頁碼
  const getPageNumbers = () => {
    const pages: (number | string)[] = [];
    const maxButtons = 5;
    const sideButtons = 2;

    if (totalPages <= maxButtons + 2) {
      // 頁數較少，顯示所有
      for (let i = 1; i <= totalPages; i++) {
        pages.push(i);
      }
    } else {
      // 顯示: 1 2 ... [當前-2 當前-1 當前 當前+1 當前+2] ... N-1 N
      pages.push(1);

      if (currentPage > sideButtons + 2) {
        pages.push('...');
      }

      const start = Math.max(2, currentPage - sideButtons);
      const end = Math.min(totalPages - 1, currentPage + sideButtons);

      for (let i = start; i <= end; i++) {
        pages.push(i);
      }

      if (currentPage < totalPages - sideButtons - 1) {
        pages.push('...');
      }

      if (totalPages > 1) {
        pages.push(totalPages);
      }
    }

    return pages;
  };

  const handleJump = () => {
    const pageNum = parseInt(jumpInput);
    if (pageNum && pageNum >= 1 && pageNum <= totalPages) {
      onPageChange(pageNum);
      setJumpInput('');
      setShowJumpInput(false);
    }
  };

  const handleKeyPress = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Enter') {
      handleJump();
    } else if (e.key === 'Escape') {
      setShowJumpInput(false);
      setJumpInput('');
    }
  };

  const pageNumbers = getPageNumbers();
  const startRecord = (currentPage - 1) * pageSize + 1;
  const endRecord = Math.min(currentPage * pageSize, totalItems);

  return (
    <div className="bg-white border border-gray-200 p-4">
      <div className="flex flex-wrap items-center justify-between gap-4">
        {/* 左側：記錄信息 */}
        <div className="text-sm text-gray-600 flex items-center gap-6">
          <span>
            顯示第 <span className="font-semibold text-gray-700">{startRecord}</span> 到 
            <span className="font-semibold text-gray-700"> {endRecord}</span> 條，
            共 <span className="font-semibold text-gray-700">{totalItems.toLocaleString()}</span> 條記錄
          </span>
          
          {/* 每頁條數選擇器 */}
          <div className="flex items-center gap-2">
            <label className="text-gray-600 whitespace-nowrap">每頁:</label>
            <select
              value={pageSize}
              onChange={(e) => onPageSizeChange(parseInt(e.target.value))}
              className="px-3 py-1 border border-gray-300 rounded text-sm hover:border-gray-400 focus:border-blue-500 focus:ring-1 focus:ring-blue-500 outline-none transition-colors"
            >
              {pageSizeOptions.map(size => (
                <option key={size} value={size}>
                  {size} 條
                </option>
              ))}
            </select>
          </div>
        </div>

        {/* 右側：分頁控件 */}
        <div className="flex items-center gap-2 flex-wrap">
          {/* 快速跳转输入框 */}
          {showJumpInput ? (
            <div className="flex items-center gap-1">
              <span className="text-sm text-gray-600">轉到:</span>
              <input
                type="number"
                min="1"
                max={totalPages}
                value={jumpInput}
                onChange={(e) => setJumpInput(e.target.value)}
                onKeyPress={handleKeyPress}
                placeholder="頁碼"
                className="w-16 px-2 py-1 border border-gray-300 rounded text-sm focus:border-blue-500 focus:ring-1 focus:ring-blue-500 outline-none"
                autoFocus
              />
              <button
                onClick={handleJump}
                className="px-2 py-1 text-sm bg-blue-500 text-white rounded hover:bg-blue-600 transition-colors"
              >
                跳轉
              </button>
              <button
                onClick={() => {
                  setShowJumpInput(false);
                  setJumpInput('');
                }}
                className="px-2 py-1 text-sm text-gray-600 hover:text-gray-800 transition-colors"
              >
                取消
              </button>
            </div>
          ) : (
            <>
              {/* 首頁按鈕 */}
              <button
                onClick={() => onPageChange(1)}
                disabled={currentPage === 1}
                className="px-3 py-1 text-sm border border-gray-300 rounded text-gray-700 hover:bg-gray-50 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
                title="首頁"
              >
                ⟨⟨
              </button>

              {/* 上一頁按鈕 */}
              <button
                onClick={() => onPageChange(Math.max(1, currentPage - 1))}
                disabled={currentPage === 1}
                className="px-3 py-1 text-sm border border-gray-300 rounded text-gray-700 hover:bg-gray-50 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
                title="上一頁"
              >
                ⟨
              </button>

              {/* 頁碼按鈕 */}
              <div className="flex items-center gap-1">
                {pageNumbers.map((page, index) => {
                  if (page === '...') {
                    return (
                      <span key={`ellipsis-${index}`} className="px-2 py-1 text-gray-600">
                        …
                      </span>
                    );
                  }

                  const pageNum = page as number;
                  return (
                    <button
                      key={pageNum}
                      onClick={() => onPageChange(pageNum)}
                      className={`px-3 py-1 text-sm rounded transition-colors ${
                        currentPage === pageNum
                          ? 'bg-blue-500 text-white font-semibold'
                          : 'border border-gray-300 text-gray-700 hover:bg-gray-50'
                      }`}
                    >
                      {pageNum}
                    </button>
                  );
                })}
              </div>

              {/* 下一頁按鈕 */}
              <button
                onClick={() => onPageChange(Math.min(totalPages, currentPage + 1))}
                disabled={currentPage === totalPages}
                className="px-3 py-1 text-sm border border-gray-300 rounded text-gray-700 hover:bg-gray-50 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
                title="下一頁"
              >
                ⟩
              </button>

              {/* 末頁按鈕 */}
              <button
                onClick={() => onPageChange(totalPages)}
                disabled={currentPage === totalPages}
                className="px-3 py-1 text-sm border border-gray-300 rounded text-gray-700 hover:bg-gray-50 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
                title="末頁"
              >
                ⟩⟩
              </button>

              {/* 快速跳轉按鈕 */}
              <button
                onClick={() => setShowJumpInput(true)}
                className="px-3 py-1 text-sm border border-gray-300 rounded text-gray-700 hover:bg-gray-50 transition-colors ml-1"
                title="快速跳轉"
              >
                跳轉
              </button>
            </>
          )}

          {/* 頁碼信息 */}
          <div className="text-sm text-gray-600 ml-2 whitespace-nowrap">
            第 <span className="font-semibold">{currentPage}</span> / 
            <span className="font-semibold"> {totalPages}</span> 頁
          </div>
        </div>
      </div>
    </div>
  );
}
