import React from 'react';

export type ActiveView = 'board' | 'my_token' | 'booths' | 'chat' | 'staff';

interface HeaderProps {
  activeView: ActiveView;
  onSelectView: (view: ActiveView) => void;
  trackedToken: number | null;
  onOpenTokenEntry: () => void;
}

const NAV_ITEMS: { id: ActiveView; label: string }[] = [
  { id: 'board', label: 'Live Board' },
  { id: 'my_token', label: 'My Token' },
  { id: 'booths', label: 'Booths & Pace' },
  { id: 'chat', label: 'Voice Chat' },
  { id: 'staff', label: 'Staff Desk' },
];

export const Header: React.FC<HeaderProps> = ({
  activeView,
  onSelectView,
  trackedToken,
  onOpenTokenEntry,
}) => {
  return (
    <header className="sticky top-0 z-30 bg-white/95 backdrop-blur-md border-b border-slate-200">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 h-16 flex items-center justify-between gap-8">
        <button
          type="button"
          onClick={() => onSelectView('board')}
          className="text-xl font-bold tracking-tight text-slate-900 font-display whitespace-nowrap shrink-0 focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-blue-700 rounded"
        >
          DriveLine
        </button>

        <nav
          aria-label="Primary navigation"
          className="hidden md:flex items-center gap-7 text-sm font-medium"
        >
          {NAV_ITEMS.map((item) => {
            const isActive = activeView === item.id;
            return (
              <button
                key={item.id}
                type="button"
                onClick={() => onSelectView(item.id)}
                className={`relative py-2 transition-colors whitespace-nowrap shrink-0 focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-blue-700 rounded ${
                  isActive
                    ? 'text-blue-700 font-semibold'
                    : 'text-slate-600 hover:text-slate-900'
                }`}
              >
                {item.label}
                {isActive && (
                  <span
                    aria-hidden="true"
                    className="absolute bottom-0 left-0 right-0 h-0.5 bg-blue-700 rounded-full"
                  />
                )}
              </button>
            );
          })}
        </nav>

        <div className="shrink-0">
          <button
            type="button"
            onClick={onOpenTokenEntry}
            className="px-4 py-2.5 min-h-[40px] text-sm font-semibold text-white bg-blue-700 hover:bg-blue-800 active:bg-blue-900 rounded-lg transition-colors whitespace-nowrap shrink-0 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-blue-700 tabular-nums"
          >
            {trackedToken !== null ? `Token #${trackedToken}` : 'Track My Token'}
          </button>
        </div>
      </div>
    </header>
  );
};
