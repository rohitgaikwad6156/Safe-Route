import { ChevronDown, ChevronLeft, ChevronRight, ChevronUp, Navigation } from 'lucide-react';
import { ReactNode } from 'react';
import { useMediaQuery } from '../hooks/useMediaQuery';

export type BottomSheetState = 'collapsed' | 'half' | 'full';

interface MobileBottomSheetProps {
  children: ReactNode;
  desktopCollapsed: boolean;
  onDesktopCollapsedChange: (collapsed: boolean) => void;
  mobileState: BottomSheetState;
  onMobileStateChange: (state: BottomSheetState) => void;
  mobileCollapsedContent: ReactNode;
  mobileHalfContent: ReactNode;
  mobileFullContent: ReactNode;
  desktopFooter?: ReactNode;
  title: string;
  mobileLabel?: string;
}

export function MobileBottomSheet({
  children,
  desktopCollapsed,
  onDesktopCollapsedChange,
  mobileState,
  onMobileStateChange,
  mobileCollapsedContent,
  mobileHalfContent,
  mobileFullContent,
  desktopFooter,
  title,
  mobileLabel,
}: MobileBottomSheetProps) {
  const isMobile = useMediaQuery('(max-width: 767px)');

  if (!isMobile) {
    return (
      <>
        <aside
          aria-label={title}
          aria-hidden={desktopCollapsed}
          className={`absolute bottom-4 left-4 top-4 z-20 flex w-[440px] max-w-[calc(100%-2rem)] flex-col overflow-hidden rounded-2xl border border-slate-200/90 bg-white/95 shadow-2xl backdrop-blur-md transition-transform duration-300 lg:w-[460px] ${
            desktopCollapsed
              ? 'invisible -translate-x-[calc(100%+24px)] pointer-events-none'
              : 'translate-x-0 pointer-events-auto'
          }`}
        >
          <div className="flex min-h-11 flex-shrink-0 items-center justify-between border-b border-slate-100 bg-slate-50/90 px-4">
            <div className="flex items-center gap-2 text-sm font-bold text-slate-800">
              <Navigation className="h-4 w-4 text-blue-600" />
              <span>{title}</span>
            </div>
            <button
              type="button"
              onClick={() => onDesktopCollapsedChange(true)}
              className="flex h-11 w-11 items-center justify-center rounded-xl text-slate-500 hover:bg-slate-200/70 hover:text-slate-800"
              aria-label="Hide navigation panel"
            >
              <ChevronLeft className="h-5 w-5" />
            </button>
          </div>
          {children}
          {desktopFooter ? (
            <div className="flex-shrink-0 border-t border-slate-200 bg-white p-3 shadow-[0_-8px_20px_rgba(15,23,42,0.06)]">
              {desktopFooter}
            </div>
          ) : null}
        </aside>

        {desktopCollapsed ? (
          <button
            type="button"
            onClick={() => onDesktopCollapsedChange(false)}
            className="absolute left-4 top-4 z-20 flex min-h-11 items-center gap-2 rounded-2xl border border-slate-200/90 bg-white/95 px-4 text-sm font-bold text-slate-800 shadow-xl hover:bg-slate-50"
          >
            <Navigation className="h-4 w-4 text-blue-600" />
            <span>Open Navigation Panel</span>
            <ChevronRight className="h-4 w-4 text-slate-400" />
          </button>
        ) : null}
      </>
    );
  }

  const heightClass =
    mobileState === 'collapsed'
      ? 'mobile-sheet--collapsed'
      : mobileState === 'half'
        ? 'mobile-sheet--half'
        : 'mobile-sheet--full';

  const content =
    mobileState === 'collapsed'
      ? mobileCollapsedContent
      : mobileState === 'half'
        ? mobileHalfContent
        : mobileFullContent;

  return (
    <aside
      aria-label={title}
      data-sheet-state={mobileState}
      className={`absolute bottom-0 left-0 right-0 z-30 flex flex-col overflow-hidden rounded-t-3xl border-x border-t border-slate-200 bg-white shadow-[0_-12px_40px_rgba(15,23,42,0.18)] transition-[height] duration-300 ${heightClass}`}
    >
      <div className="relative flex min-h-11 flex-shrink-0 items-center justify-center border-b border-slate-100 px-2">
        {mobileState !== 'collapsed' ? (
          <button
            type="button"
            onClick={() => onMobileStateChange(mobileState === 'full' ? 'half' : 'collapsed')}
            className="absolute left-2 flex h-11 w-11 items-center justify-center rounded-xl text-slate-500"
            aria-label={mobileState === 'full' ? 'Show route planning' : 'Collapse trip details'}
          >
            <ChevronDown className="h-5 w-5" />
          </button>
        ) : null}
        <button
          type="button"
          onClick={() => onMobileStateChange(mobileState === 'collapsed' ? 'half' : mobileState === 'half' ? 'full' : 'half')}
          className="flex min-h-11 min-w-32 flex-col items-center justify-center gap-1 text-sm font-semibold text-slate-700"
          aria-label={mobileState === 'full' ? 'Collapse safety details' : 'Expand trip details'}
        >
          <span className="h-1.5 w-12 rounded-full bg-slate-300" />
          <span className="flex items-center gap-1">
            {mobileLabel ?? (mobileState === 'collapsed' ? 'Trip overview' : mobileState === 'half' ? 'Plan route' : 'Safety details')}
            {mobileState === 'full' ? <ChevronDown className="h-4 w-4" /> : <ChevronUp className="h-4 w-4" />}
          </span>
        </button>
        {mobileState === 'half' ? (
          <button
            type="button"
            onClick={() => onMobileStateChange('full')}
            className="absolute right-2 flex h-11 w-11 items-center justify-center rounded-xl text-slate-500"
            aria-label="Show full safety details"
          >
            <ChevronUp className="h-5 w-5" />
          </button>
        ) : null}
      </div>
      <div className={`min-h-0 flex-1 ${mobileState === 'collapsed' ? 'overflow-hidden' : 'overflow-y-auto overscroll-contain'} pb-[env(safe-area-inset-bottom)]`}>
        {content}
      </div>
    </aside>
  );
}
