'use client';

import {
  AlertCircle,
  AlertTriangle,
  ArrowLeft,
  Calendar as CalendarIcon,
  Check,
  CheckCircle2,
  ChevronDown,
  ChevronLeft,
  ChevronRight,
  Clock,
  ExternalLink,
  Filter,
  FolderGit2,
  Maximize2,
  Minimize2,
  MoveHorizontal,
  RotateCcw,
  Search,
  Sparkles,
  Users,
  X,
  ZoomIn,
  ZoomOut,
} from 'lucide-react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useCallback, useEffect, useMemo, useRef, useState, useTransition } from 'react';
import { extendTimelineItemDeadline } from '@/actions/content';
import { sendTimelineRequest } from '@/actions/members';
import type { GanttProject, GanttTimelineItem } from '@/lib/queries';

export type GanttTimelineProps = {
  projects: GanttProject[];
  isAdmin: boolean;
  todayDate?: string;
  drilldownBaseUrl?: string;
  initialSelectedProjectId?: string;
};

type ViewMode = 'day' | 'week' | 'month';

function parseDate(iso: string): Date {
  const [y, m, d] = iso.split('-').map(Number);
  return new Date(y, m - 1, d, 0, 0, 0, 0);
}

function toIso(d: Date): string {
  const year = d.getFullYear();
  const month = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

function addDays(d: Date, days: number): Date {
  const next = new Date(d.getTime());
  next.setDate(next.getDate() + days);
  return next;
}

function diffDays(d1: Date, d2: Date): number {
  const ms1 = Date.UTC(d1.getFullYear(), d1.getMonth(), d1.getDate());
  const ms2 = Date.UTC(d2.getFullYear(), d2.getMonth(), d2.getDate());
  return Math.round((ms1 - ms2) / (1000 * 60 * 60 * 24));
}

const DAY_NAMES = ['Sen', 'Sel', 'Rab', 'Kam', 'Jum', 'Sab', 'Min'];

const MONTH_NAMES_ID = [
  'Januari',
  'Februari',
  'Maret',
  'April',
  'Mei',
  'Juni',
  'Juli',
  'Agustus',
  'September',
  'Oktober',
  'November',
  'Desember',
];

/**
 * Exact 6-dot drag indicator icon (2 columns of 3 dots) matching Image 2
 */
function DragGripIcon({ className = '' }: { className?: string }) {
  return (
    <svg
      width="10"
      height="16"
      viewBox="0 0 10 16"
      fill="currentColor"
      className={className}
      xmlns="http://www.w3.org/2000/svg"
    >
      <circle cx="2.5" cy="2.5" r="1.5" />
      <circle cx="7.5" cy="2.5" r="1.5" />
      <circle cx="2.5" cy="8" r="1.5" />
      <circle cx="7.5" cy="8" r="1.5" />
      <circle cx="2.5" cy="13.5" r="1.5" />
      <circle cx="7.5" cy="13.5" r="1.5" />
    </svg>
  );
}

// Calendar horizon: Starts from January 1, 2026 through February 28, 2027
const CALENDAR_START_ISO = '2026-01-01';
const CALENDAR_END_ISO = '2027-02-28';
const CALENDAR_START_DATE = parseDate(CALENDAR_START_ISO);
const CALENDAR_END_DATE = parseDate(CALENDAR_END_ISO);
const TOTAL_CALENDAR_DAYS = diffDays(CALENDAR_END_DATE, CALENDAR_START_DATE) + 1;

export function GanttTimeline({
  projects: initialProjects,
  isAdmin,
  todayDate = new Date().toISOString().split('T')[0],
  drilldownBaseUrl,
  initialSelectedProjectId,
}: GanttTimelineProps) {
  const router = useRouter();
  const [projectsList, setProjectsList] = useState<GanttProject[]>(initialProjects);
  const [viewMode, setViewMode] = useState<ViewMode>('day');
  const [showDone, setShowDone] = useState(true);
  const [searchQuery, setSearchQuery] = useState('');
  const [statusFilter, setStatusFilter] = useState<'all' | 'on_progress' | 'open' | 'done'>('all');
  const [isStatusDropdownOpen, setIsStatusDropdownOpen] = useState(false);

  // Zoom Level state: 0.75, 1.0, 1.25, 1.5
  const [zoomScale, setZoomScale] = useState<number>(1.0);

  // Ref to the scrollable timeline canvas
  const scrollContainerRef = useRef<HTMLDivElement>(null);
  const dropdownRef = useRef<HTMLDivElement>(null);

  // Level Selection: null = Level 1 (All Projects Overview Gantt); string = Level 2 (Selected Project Milestones Gantt)
  const [selectedProjectId, setSelectedProjectId] = useState<string | null>(() => {
    if (initialSelectedProjectId) return initialSelectedProjectId;
    return null;
  });

  // Highlighted milestone ID when clicked from left column
  const [highlightedItemId, setHighlightedItemId] = useState<string | null>(null);
  // Highlighted project ID when clicked from left column in Level 1
  const [highlightedProjectId, setHighlightedProjectId] = useState<string | null>(null);

  // Modal extension request for members
  const [selectedItemForExtension, setSelectedItemForExtension] = useState<{
    item: GanttTimelineItem;
    projectName: string;
  } | null>(null);

  // Success toast state
  const [toastMessage, setToastMessage] = useState<string | null>(null);

  // Date Selector state (Jump/Search by time: Year, Month, Day)
  const [isDatePickerOpen, setIsDatePickerOpen] = useState(false);
  const [selectedYear, setSelectedYear] = useState<number>(2026);
  const [selectedMonth, setSelectedMonth] = useState<number>(11); // 11 = Desember (0-indexed)
  const [selectedDay, setSelectedDay] = useState<number>(20); // 20
  const [jumpMarkerDateIso, setJumpMarkerDateIso] = useState<string | null>(null);
  const [jumpMarkerLabel, setJumpMarkerLabel] = useState<string>('');
  const datePickerRef = useRef<HTMLDivElement>(null);

  // Close custom dropdown and datepicker on outside click
  useEffect(() => {
    const handleOutsideClick = (e: MouseEvent) => {
      if (dropdownRef.current && !dropdownRef.current.contains(e.target as Node)) {
        setIsStatusDropdownOpen(false);
      }
      if (datePickerRef.current && !datePickerRef.current.contains(e.target as Node)) {
        setIsDatePickerOpen(false);
      }
    };
    document.addEventListener('mousedown', handleOutsideClick);
    return () => document.removeEventListener('mousedown', handleOutsideClick);
  }, []);

  // Synchronize when initialProjects prop changes
  useEffect(() => {
    setProjectsList(initialProjects);
  }, [initialProjects]);

  // Compute active project when in Level 2
  const selectedProject = useMemo(() => {
    if (!selectedProjectId) return null;
    return projectsList.find((p) => p.id === selectedProjectId) ?? null;
  }, [projectsList, selectedProjectId]);

  // Filter projects for Level 1
  const filteredProjects = useMemo(() => {
    return projectsList
      .filter((p) => {
        if (statusFilter !== 'all' && p.status !== statusFilter) return false;
        if (searchQuery.trim()) {
          const q = searchQuery.toLowerCase();
          const matchProject = p.name.toLowerCase().includes(q);
          const matchItem = p.items.some((i) => i.title.toLowerCase().includes(q));
          const matchMember = p.members.some((m) => m.fullName.toLowerCase().includes(q));
          if (!matchProject && !matchItem && !matchMember) return false;
        }
        return true;
      })
      .map((p) => {
        let items = p.items;
        if (!showDone) {
          items = items.filter((i) => i.status !== 'done');
        }
        return { ...p, items };
      });
  }, [projectsList, statusFilter, searchQuery, showDone]);

  // Base Column widths multiplied by zoomScale
  const config = useMemo(() => {
    if (viewMode === 'day') {
      return { colWidth: Math.round(48 * zoomScale), unitDays: 1 };
    }
    if (viewMode === 'week') {
      return { colWidth: Math.round(130 * zoomScale), unitDays: 7 };
    }
    return { colWidth: Math.round(180 * zoomScale), unitDays: 30 };
  }, [viewMode, zoomScale]);

  // Generate full list of days from Jan 1, 2026 to Feb 28, 2027
  const allDays = useMemo(() => {
    const list: Date[] = [];
    for (let i = 0; i < TOTAL_CALENDAR_DAYS; i++) {
      list.push(addDays(CALENDAR_START_DATE, i));
    }
    return list;
  }, []);

  // Effective pixels per day in current mode
  const pixelsPerDay = useMemo(() => {
    return config.colWidth / config.unitDays;
  }, [config]);

  // Sticky left column width (wider 360px so text/badges never wrap awkwardly!)
  const leftColWidth = 360;
  const totalGridWidth = TOTAL_CALENDAR_DAYS * pixelsPerDay;

  // Month grouping headers
  const monthHeaders = useMemo(() => {
    const groups: { label: string; countDays: number }[] = [];
    let currentMonth = '';
    let count = 0;

    for (const d of allDays) {
      const mStr = d.toLocaleDateString('id-ID', { month: 'long', year: 'numeric' });
      if (mStr !== currentMonth) {
        if (currentMonth) {
          groups.push({ label: currentMonth, countDays: count });
        }
        currentMonth = mStr;
        count = 1;
      } else {
        count++;
      }
    }
    if (count > 0) {
      groups.push({ label: currentMonth, countDays: count });
    }
    return groups;
  }, [allDays]);

  // Weekly Sub-Headers grouped strictly M1 - M4 per month!
  // Instead of global N+1 counter, each month starts clean with M1, M2, M3, M4...
  const weeklyColumns = useMemo(() => {
    const cols: {
      weekStart: Date;
      weekEnd: Date;
      label: string;
      subLabel: string;
      widthPx: number;
    }[] = [];

    let currentMonthIndex = -1;
    let weekInMonth = 1;

    const totalWeeks = Math.ceil(TOTAL_CALENDAR_DAYS / 7);
    for (let w = 0; w < totalWeeks; w++) {
      const wStart = addDays(CALENDAR_START_DATE, w * 7);
      const wEnd = addDays(wStart, 6);
      const monthNum = wStart.getMonth();

      if (monthNum !== currentMonthIndex) {
        currentMonthIndex = monthNum;
        weekInMonth = 1;
      } else {
        weekInMonth++;
      }

      const startDay = wStart.getDate();
      const endDay = wEnd.getDate();
      const monthShort = wEnd.toLocaleDateString('id-ID', { month: 'short' });

      cols.push({
        weekStart: wStart,
        weekEnd: wEnd,
        label: `M${weekInMonth}`,
        subLabel: `${startDay} - ${endDay} ${monthShort}`,
        widthPx: config.colWidth,
      });
    }

    return cols;
  }, [config.colWidth]);

  // Today marker offset in pixels from the left edge of the grid canvas
  const todayOffsetPx = useMemo(() => {
    const today = parseDate(todayDate);
    const daysFromStart = diffDays(today, CALENDAR_START_DATE);
    if (daysFromStart < 0 || daysFromStart >= TOTAL_CALENDAR_DAYS) return null;
    return daysFromStart * pixelsPerDay + pixelsPerDay / 2;
  }, [todayDate, pixelsPerDay]);

  // Target jump marker offset in pixels from the left edge of the grid canvas
  const jumpMarkerOffsetPx = useMemo(() => {
    if (!jumpMarkerDateIso) return null;
    const d = parseDate(jumpMarkerDateIso);
    const daysFromStart = diffDays(d, CALENDAR_START_DATE);
    if (daysFromStart < 0 || daysFromStart >= TOTAL_CALENDAR_DAYS) return null;
    return daysFromStart * pixelsPerDay + pixelsPerDay / 2;
  }, [jumpMarkerDateIso, pixelsPerDay]);

  // --------------------------------------------------------------------------
  // AUTO-SCROLL TO TARGET DATE ON LOAD & LEVEL SWITCH
  // --------------------------------------------------------------------------
  const scrollToTargetDate = useCallback(
    (targetIso: string, smooth = true) => {
      if (!scrollContainerRef.current) return;
      const targetDate = parseDate(targetIso);
      const daysFromStart = diffDays(targetDate, CALENDAR_START_DATE);
      const targetPx = Math.max(0, daysFromStart * pixelsPerDay - 60);

      scrollContainerRef.current.scrollTo({
        left: targetPx,
        behavior: smooth ? 'smooth' : 'auto',
      });
    },
    [pixelsPerDay]
  );

  // Jump to project start date or today when entering level 2 or on initial load
  useEffect(() => {
    const timer = setTimeout(() => {
      if (selectedProject && selectedProject.items.length > 0) {
        const sorted = [...selectedProject.items].sort((a, b) =>
          a.startDate.localeCompare(b.startDate)
        );
        scrollToTargetDate(sorted[0].startDate, true);
      } else {
        scrollToTargetDate(todayDate, false);
      }
    }, 120);

    return () => clearTimeout(timer);
  }, [selectedProjectId, selectedProject, todayDate, scrollToTargetDate]);

  // Jump to January 2026 (Awal Tahun)
  const handleJumpToStartOfYear = () => {
    if (scrollContainerRef.current) {
      scrollContainerRef.current.scrollTo({ left: 0, behavior: 'smooth' });
    }
  };

  // Jump to Today
  const handleJumpToday = () => {
    scrollToTargetDate(todayDate, true);
  };

  // Jump to specific selected date (Year, Month, Day) from Date Selector
  const handleJumpToSelectedDate = (
    y = selectedYear,
    m = selectedMonth,
    d = selectedDay
  ) => {
    const monthStr = String(m + 1).padStart(2, '0');
    const dayStr = String(d).padStart(2, '0');
    const iso = `${y}-${monthStr}-${dayStr}`;

    scrollToTargetDate(iso, true);
    setIsDatePickerOpen(false);

    const formattedLabel = `${d} ${MONTH_NAMES_ID[m]} ${y}`;
    setJumpMarkerDateIso(iso);
    setJumpMarkerLabel(formattedLabel);
    setToastMessage(`Lompat ke tanggal ${d} ${MONTH_NAMES_ID[m]} ${y}`);
    setTimeout(() => setToastMessage(null), 3500);
    setTimeout(() => setJumpMarkerDateIso(null), 8000);
  };

  // Zoom In / Out Handlers: Expanded range 25% (0.25) to 200% (2.0)
  const handleZoomIn = () => {
    setZoomScale((prev) => Math.min(2.0, Math.round((prev + 0.25) * 100) / 100));
  };

  const handleZoomOut = () => {
    setZoomScale((prev) => Math.max(0.25, Math.round((prev - 0.25) * 100) / 100));
  };

  const handleZoomReset = () => {
    setZoomScale(1.0);
  };

  // --------------------------------------------------------------------------
  // CLICK ON LEFT PROJECT ROW -> AUTO-SCROLL CANVAS TO THAT PROJECT!
  // (Redirects/focuses view to that project; click the card to enter)
  // --------------------------------------------------------------------------
  const handleProjectRowClick = (project: GanttProject, projectLeftPx: number) => {
    if (!scrollContainerRef.current) return;
    const containerWidth = scrollContainerRef.current.clientWidth - leftColWidth;
    const targetScroll = Math.max(0, projectLeftPx - containerWidth / 4);

    scrollContainerRef.current.scrollTo({
      left: targetScroll,
      behavior: 'smooth',
    });

    setHighlightedProjectId(project.id);
    setTimeout(() => {
      setHighlightedProjectId(null);
    }, 2500);
  };

  // --------------------------------------------------------------------------
  // CLICK ON LEFT SPRINT ROW -> AUTO-SCROLL CANVAS TO THAT SPRINT!
  // --------------------------------------------------------------------------
  const handleSprintClick = (item: GanttTimelineItem, itemLeftPx: number) => {
    if (!scrollContainerRef.current) return;
    const containerWidth = scrollContainerRef.current.clientWidth - leftColWidth;
    const targetScroll = Math.max(0, itemLeftPx - containerWidth / 3);

    scrollContainerRef.current.scrollTo({
      left: targetScroll,
      behavior: 'smooth',
    });

    setHighlightedItemId(item.id);
    setTimeout(() => {
      setHighlightedItemId(null);
    }, 2500);
  };

  // --------------------------------------------------------------------------
  // INTERACTIVE DRAG-TO-EXTEND DEADLINE (CANNOT EXTEND IF DONE)
  // --------------------------------------------------------------------------
  const [dragState, setDragState] = useState<{
    itemId: string;
    itemTitle: string;
    originalStartDate: string;
    originalEndDate: string;
    currentEndDate: string;
    startClientX: number;
    deltaDays: number;
  } | null>(null);

  const [isPendingExtend, startTransition] = useTransition();

  const handleStartDrag = (
    e: React.MouseEvent,
    item: GanttTimelineItem
  ) => {
    // Completed/Done projects or milestones cannot be extended!
    if (item.status === 'done') {
      alert('Tahapan ini sudah selesai (Done) dan tidak dapat diubah lagi.');
      return;
    }

    e.preventDefault();
    e.stopPropagation();

    document.body.style.cursor = 'ew-resize';
    document.body.style.userSelect = 'none';

    setDragState({
      itemId: item.id,
      itemTitle: item.title,
      originalStartDate: item.startDate,
      originalEndDate: item.endDate,
      currentEndDate: item.endDate,
      startClientX: e.clientX,
      deltaDays: 0,
    });
  };

  useEffect(() => {
    if (!dragState) return;

    const onMouseMove = (e: MouseEvent) => {
      e.preventDefault();
      const deltaX = e.clientX - dragState.startClientX;

      // Snap calculation per menu:
      // Daily: 1 column = 1 day
      // Weekly: 1 column = 7 days (1 week)
      // Monthly: 1 column = 30 days (1 month)
      let snapDays = 0;
      if (viewMode === 'day') {
        snapDays = Math.round(deltaX / config.colWidth) * 1;
      } else if (viewMode === 'week') {
        snapDays = Math.round(deltaX / config.colWidth) * 7;
      } else {
        snapDays = Math.round(deltaX / config.colWidth) * 30;
      }

      const origEnd = parseDate(dragState.originalEndDate);
      const newEndCandidate = addDays(origEnd, snapDays);
      const startD = parseDate(dragState.originalStartDate);

      // Clamp: end date cannot precede start date
      const finalEnd = newEndCandidate < startD ? startD : newEndCandidate;
      const finalIso = toIso(finalEnd);

      setDragState((prev) =>
        prev
          ? {
              ...prev,
              deltaDays: snapDays,
              currentEndDate: finalIso,
            }
          : null
      );
    };

    const onMouseUp = () => {
      document.body.style.cursor = '';
      document.body.style.userSelect = '';

      const { itemId, originalEndDate, currentEndDate, itemTitle, deltaDays } = dragState;

      if (currentEndDate !== originalEndDate) {
        // Optimistic UI update
        setProjectsList((prev) =>
          prev.map((proj) => ({
            ...proj,
            items: proj.items.map((it) =>
              it.id === itemId ? { ...it, endDate: currentEndDate } : it
            ),
          }))
        );

        startTransition(async () => {
          const res = await extendTimelineItemDeadline(itemId, currentEndDate);
          if (res.ok) {
            const deltaLabel =
              deltaDays > 0 ? `+${deltaDays} hari` : `${deltaDays} hari`;
            setToastMessage(`Deadline "${itemTitle}" diperpanjang ke ${currentEndDate} (${deltaLabel})`);
            setTimeout(() => setToastMessage(null), 3500);
            router.refresh();
          } else {
            // Revert on error
            setProjectsList((prev) =>
              prev.map((proj) => ({
                ...proj,
                items: proj.items.map((it) =>
                  it.id === itemId ? { ...it, endDate: originalEndDate } : it
                ),
              }))
            );
            alert(`Gagal memperpanjang: ${res.error || 'Terjadi kendala sistem'}`);
          }
        });
      }

      setDragState(null);
    };

    window.addEventListener('mousemove', onMouseMove);
    window.addEventListener('mouseup', onMouseUp);

    return () => {
      window.removeEventListener('mousemove', onMouseMove);
      window.removeEventListener('mouseup', onMouseUp);
      document.body.style.cursor = '';
      document.body.style.userSelect = '';
    };
  }, [dragState, viewMode, config, router]);

  // --------------------------------------------------------------------------
  // CANVAS MOUSE-DRAG PAN (CLICK ON EMPTY CANVAS TO SCROLL LEFT/RIGHT)
  // --------------------------------------------------------------------------
  const [isPanning, setIsPanning] = useState(false);
  const panStartRef = useRef<{ startX: number; scrollLeft: number } | null>(null);

  const handleCanvasMouseDown = (e: React.MouseEvent<HTMLDivElement>) => {
    if ((e.target as HTMLElement).closest('.timeline-card') || (e.target as HTMLElement).closest('button')) {
      return;
    }
    if (!scrollContainerRef.current) return;

    setIsPanning(true);
    panStartRef.current = {
      startX: e.clientX,
      scrollLeft: scrollContainerRef.current.scrollLeft,
    };
  };

  useEffect(() => {
    if (!isPanning) return;

    const onPanMove = (e: MouseEvent) => {
      if (!panStartRef.current || !scrollContainerRef.current) return;
      const dx = e.clientX - panStartRef.current.startX;
      scrollContainerRef.current.scrollLeft = panStartRef.current.scrollLeft - dx;
    };

    const onPanUp = () => {
      setIsPanning(false);
      panStartRef.current = null;
    };

    window.addEventListener('mousemove', onPanMove);
    window.addEventListener('mouseup', onPanUp);
    return () => {
      window.removeEventListener('mousemove', onPanMove);
      window.removeEventListener('mouseup', onPanUp);
    };
  }, [isPanning]);

  return (
    <div className="flex flex-col gap-6 select-none font-sans relative">
      {/* Toast Alert */}
      {toastMessage && (
        <div className="fixed top-20 right-8 z-50 flex items-center gap-2.5 rounded-md border border-teal-solid/40 bg-surface px-4 py-3 text-xs font-semibold text-teal-text shadow-xl animate-in fade-in slide-in-from-top-2">
          <CheckCircle2 className="h-4 w-4 text-teal-text shrink-0" />
          <span>{toastMessage}</span>
        </div>
      )}

      {/* Top Header Card: Spacious Spacing with Argos Design Polish */}
      <div className="rounded-md border border-line bg-surface p-6 sm:p-8 shadow-xs">
        <div className="flex flex-wrap items-center justify-between gap-6">
          <div className="min-w-0 flex-1">
            {/* Breadcrumb Hierarchy */}
            <div className="flex items-center gap-2 text-xs font-semibold text-gray-500 mb-2">
              <span className="flex items-center gap-1.5 text-teal-text font-bold">
                <CalendarIcon className="h-4 w-4 text-brand-orange" />
                <span>Roadmap Timeline</span>
              </span>
              <span>/</span>
              {selectedProject ? (
                <button
                  type="button"
                  onClick={() => setSelectedProjectId(null)}
                  className="hover:text-brand-orange transition-colors cursor-pointer font-medium"
                >
                  Semua Proyek
                </button>
              ) : (
                <span className="text-heading font-bold">Semua Proyek (5 Proyek Aktif)</span>
              )}
              {selectedProject && (
                <>
                  <span>/</span>
                  <span className="text-heading truncate font-bold text-teal-text">{selectedProject.name}</span>
                </>
              )}
            </div>

            {/* View Title & Description with Generous Spacing */}
            <div className="flex items-start gap-3 mt-1">
              {selectedProject && (
                <button
                  type="button"
                  onClick={() => setSelectedProjectId(null)}
                  className="mt-0.5 flex h-9 w-9 items-center justify-center rounded-sm border border-teal-solid bg-teal-solid/10 text-teal-text hover:border-brand-orange hover:bg-brand-orange hover:text-ink transition-all shadow-xs cursor-pointer shrink-0"
                  title="Kembali ke Ringkasan Semua Proyek"
                >
                  <ArrowLeft className="h-4 w-4" />
                </button>
              )}
              <div>
                <h1 className="text-2xl font-bold tracking-tight text-heading">
                  {selectedProject ? selectedProject.name : 'Project Timeline Roadmap (5 Proyek Aktif)'}
                </h1>
                <p className="mt-2 text-sm text-gray-500 leading-relaxed max-w-3xl">
                  {selectedProject
                    ? 'Visualisasi 5 Sprint tahapan milestone. Klik pada daftar sprint di kolom kiri untuk langsung berpindah ke posisinya, atau tarik gagang 6 titik (:::) untuk memperpanjang deadline. Tahapan yang sudah selesai (Done) tidak dapat diubah lagi.'
                    : 'Tampilan multi-view ringkasan 5 proyek (1 baris per proyek). Klik daftar project di kolom kiri untuk fokus view ke posisinya, atau klik card project pada timeline untuk masuk dan melihat 5 sprint di dalamnya.'}
                </p>
              </div>
            </div>
          </div>

          {/* Quick Actions & Navigation Controls: Distinct High-Contrast Buttons */}
          <div className="flex flex-wrap items-center gap-3">
            <button
              type="button"
              onClick={handleJumpToStartOfYear}
              className="rounded-sm border border-teal-solid bg-teal-solid/10 px-4 py-2 text-xs font-bold text-teal-text dark:text-[#7cc4d3] hover:border-brand-orange hover:bg-brand-orange hover:text-ink transition-all shadow-xs cursor-pointer"
              title="Lompat ke awal tahun (Januari 2026)"
            >
              Jan 2026 (Awal Tahun)
            </button>
            <button
              type="button"
              onClick={handleJumpToday}
              className="rounded-sm border border-teal-solid bg-teal-solid/10 px-4 py-2 text-xs font-bold text-teal-text dark:text-[#7cc4d3] hover:border-brand-orange hover:bg-brand-orange hover:text-ink transition-all shadow-xs cursor-pointer"
            >
              Hari Ini
            </button>
          </div>
        </div>

        {/* Action, View Mode & Filter Controls: Generous Margins & Argos Theming */}
        <div className="mt-7 pt-6 flex flex-wrap items-center justify-between gap-4 border-t border-line/60">
          {/* View Mode Switching: Daily, Weekly, Monthly */}
          <div className="flex items-center gap-1 rounded-sm bg-surface-muted p-1 border border-line/80">
            {(['day', 'week', 'month'] as ViewMode[]).map((mode) => (
              <button
                key={mode}
                type="button"
                onClick={() => setViewMode(mode)}
                className={`rounded-xs px-3.5 py-1.5 text-xs font-semibold transition cursor-pointer ${
                  viewMode === mode
                    ? 'bg-surface text-heading shadow-xs border border-line font-bold'
                    : 'text-gray-500 hover:text-brand-orange'
                }`}
              >
                {mode === 'day' ? 'Daily' : mode === 'week' ? 'Weekly' : 'Monthly'}
              </button>
            ))}
          </div>

          {/* Pan / Drag Hint & Scroll Indicator */}
          <div className="hidden lg:flex items-center gap-2 text-xs font-medium text-gray-400">
            <MoveHorizontal className="h-4 w-4 text-brand-orange animate-pulse" />
            <span>Klik & geser canvas untuk scroll bebas ke bulan sebelumnya (hingga Jan 2026)</span>
          </div>

          {/* Right Tools: Show Done Toggle, Custom Argos Status Dropdown, Search Input */}
          <div className="flex flex-wrap items-center gap-3">
            <label className="flex items-center gap-2 cursor-pointer text-xs font-semibold text-gray-600 mr-1">
              <span>Show done</span>
              <input
                type="checkbox"
                checked={showDone}
                onChange={(e) => setShowDone(e.target.checked)}
                className="h-4 w-4 rounded-xs text-teal-solid focus:ring-brand-orange cursor-pointer"
              />
            </label>

            {/* Custom Argos Status Dropdown (Replaces native browser select!) */}
            <div className="relative" ref={dropdownRef}>
              <button
                type="button"
                onClick={() => setIsStatusDropdownOpen(!isStatusDropdownOpen)}
                className="inline-flex items-center gap-2 rounded-sm border border-teal-solid/60 bg-surface px-3 py-1.5 text-xs font-bold text-teal-text dark:text-[#7cc4d3] hover:border-brand-orange hover:text-brand-orange transition-colors cursor-pointer shadow-xs"
              >
                <Filter className="h-3.5 w-3.5" />
                <span>
                  {statusFilter === 'all'
                    ? 'Semua Status'
                    : statusFilter === 'on_progress'
                    ? 'On Progress'
                    : statusFilter === 'done'
                    ? 'Done'
                    : 'Open'}
                </span>
                <ChevronDown className="h-3.5 w-3.5 opacity-70" />
              </button>

              {isStatusDropdownOpen && (
                <div className="absolute right-0 top-full mt-1.5 w-44 rounded-md border border-line bg-surface p-1 shadow-xl z-50 animate-in fade-in slide-in-from-top-1">
                  {[
                    { id: 'all', label: 'Semua Status' },
                    { id: 'on_progress', label: 'On Progress' },
                    { id: 'open', label: 'Open' },
                    { id: 'done', label: 'Done' },
                  ].map((opt) => (
                    <button
                      key={opt.id}
                      type="button"
                      onClick={() => {
                        setStatusFilter(opt.id as any);
                        setIsStatusDropdownOpen(false);
                      }}
                      className={`w-full flex items-center justify-between rounded-xs px-2.5 py-1.5 text-xs text-left transition-colors cursor-pointer ${
                        statusFilter === opt.id
                          ? 'bg-teal-solid/15 text-teal-text font-bold'
                          : 'text-heading hover:bg-brand-orange/15 hover:text-brand-orange font-medium'
                      }`}
                    >
                      <span>{opt.label}</span>
                      {statusFilter === opt.id && <Check className="h-3.5 w-3.5 text-teal-text" />}
                    </button>
                  ))}
                </div>
              )}
            </div>

            {/* Search Input with Argos Accent Border & Hover Orange */}
            <div className="relative">
              <Search className="absolute left-2.5 top-2.5 h-3.5 w-3.5 text-teal-text" />
              <input
                type="text"
                placeholder={selectedProject ? 'Cari sprint...' : 'Cari project...'}
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="rounded-sm border border-teal-solid/60 bg-surface pl-8 pr-3 py-1.5 text-xs text-ink dark:text-gray-100 placeholder:text-gray-400 focus:outline-none focus:border-brand-orange focus:ring-1 focus:ring-brand-orange hover:border-brand-orange transition-colors w-44 sm:w-56 shadow-xs"
              />
            </div>

            {/* Date Calendar Selector Popover (Search/Jump by Time: Year, Month, Day) */}
            <div className="relative" ref={datePickerRef}>
              <button
                type="button"
                onClick={() => setIsDatePickerOpen(!isDatePickerOpen)}
                className="inline-flex items-center gap-1.5 rounded-sm border border-teal-solid/60 bg-surface px-3 py-1.5 text-xs font-bold text-teal-text dark:text-[#7cc4d3] hover:border-brand-orange hover:text-brand-orange transition-colors cursor-pointer shadow-xs"
                title="Pilih tanggal untuk langsung navigasi/fokus ke tanggal tersebut pada timeline (Year, Month, Day)"
              >
                <CalendarIcon className="h-3.5 w-3.5 text-brand-orange" />
                <span className="hidden sm:inline">Pilih Waktu</span>
                <ChevronDown className="h-3 w-3 opacity-70" />
              </button>

              {isDatePickerOpen && (
                <div className="absolute right-0 top-full mt-1.5 w-80 sm:w-88 rounded-md border border-line bg-surface p-4 shadow-2xl z-50 animate-in fade-in slide-in-from-top-1 text-heading">
                  {/* Popover Header */}
                  <div className="flex items-center justify-between border-b border-line pb-2.5 mb-3">
                    <div className="flex items-center gap-1.5 text-xs font-bold text-heading">
                      <CalendarIcon className="h-4 w-4 text-brand-orange" />
                      <span>Navigasi Waktu & Tanggal</span>
                    </div>
                    <button
                      type="button"
                      onClick={() => setIsDatePickerOpen(false)}
                      className="p-1 rounded-sm text-gray-400 hover:text-ink hover:bg-surface-muted transition-colors cursor-pointer"
                    >
                      <X className="h-3.5 w-3.5" />
                    </button>
                  </div>

                  <div className="flex flex-col gap-3">
                    {/* 1. Selector Tahun */}
                    <div className="flex items-center gap-2">
                      <span className="text-[11px] font-semibold text-gray-400 w-12 shrink-0">Tahun:</span>
                      <div className="flex gap-1.5 flex-1">
                        {[2026, 2027].map((y) => (
                          <button
                            key={y}
                            type="button"
                            onClick={() => {
                              setSelectedYear(y);
                              if (y === 2027 && selectedMonth > 1) {
                                setSelectedMonth(1); // Clamp to February for 2027
                              }
                            }}
                            className={`flex-1 rounded-xs py-1 text-xs font-bold transition-all cursor-pointer border ${
                              selectedYear === y
                                ? 'bg-teal-solid text-white border-teal-solid shadow-2xs'
                                : 'bg-surface-muted/60 text-gray-400 border-line hover:text-brand-orange hover:bg-surface-muted'
                            }`}
                          >
                            {y}
                          </button>
                        ))}
                      </div>
                    </div>

                    {/* 2. Selector Bulan */}
                    <div>
                      <div className="flex items-center justify-between mb-1.5">
                        <span className="text-[11px] font-semibold text-gray-400">Bulan:</span>
                        <span className="text-[11px] font-bold text-teal-text">
                          {MONTH_NAMES_ID[selectedMonth]} {selectedYear}
                        </span>
                      </div>
                      <div className="grid grid-cols-4 gap-1">
                        {MONTH_NAMES_ID.map((mName, mIdx) => {
                          const isOutOfRange = selectedYear === 2027 && mIdx > 1;
                          const isSelected = selectedMonth === mIdx;
                          return (
                            <button
                              key={mIdx}
                              type="button"
                              disabled={isOutOfRange}
                              onClick={() => {
                                setSelectedMonth(mIdx);
                                const maxDays = new Date(selectedYear, mIdx + 1, 0).getDate();
                                if (selectedDay > maxDays) {
                                  setSelectedDay(maxDays);
                                }
                              }}
                              className={`rounded-xs py-1 text-[11px] transition-all cursor-pointer border ${
                                isSelected
                                  ? 'bg-teal-solid text-white border-teal-solid font-bold shadow-2xs'
                                  : isOutOfRange
                                  ? 'opacity-25 cursor-not-allowed border-transparent text-gray-600'
                                  : 'bg-surface-muted/50 text-heading border-line/40 hover:bg-brand-orange/15 hover:text-brand-orange hover:border-brand-orange/40 font-medium'
                              }`}
                            >
                              {mName.slice(0, 3)}
                            </button>
                          );
                        })}
                      </div>
                    </div>

                    {/* 3. Selector Hari (Days Grid) */}
                    <div>
                      <div className="flex items-center justify-between mb-1.5">
                        <span className="text-[11px] font-semibold text-gray-400">
                          Hari (Pilih Tanggal):
                        </span>
                        <span className="text-[11px] font-bold text-brand-orange">
                          Tgl {selectedDay} {MONTH_NAMES_ID[selectedMonth].slice(0, 3)}
                        </span>
                      </div>
                      <div className="grid grid-cols-7 gap-1 max-h-36 overflow-y-auto pr-0.5">
                        {Array.from(
                          { length: new Date(selectedYear, selectedMonth + 1, 0).getDate() },
                          (_, i) => i + 1
                        ).map((dayNum) => {
                          const isSelected = selectedDay === dayNum;
                          return (
                            <button
                              key={dayNum}
                              type="button"
                              onClick={() => setSelectedDay(dayNum)}
                              className={`rounded-xs h-7 text-xs font-semibold transition-all cursor-pointer border flex items-center justify-center ${
                                isSelected
                                  ? 'bg-brand-orange text-ink font-bold border-brand-orange shadow-xs scale-105'
                                  : 'bg-surface-muted/40 text-heading border-line/40 hover:bg-surface-muted hover:text-brand-orange'
                              }`}
                            >
                              {dayNum}
                            </button>
                          );
                        })}
                      </div>
                    </div>

                    {/* Quick Presets */}
                    <div className="pt-2 border-t border-line/60 flex flex-wrap gap-1.5 items-center">
                      <span className="text-[10px] text-gray-400 font-semibold mr-1">Pilihan Cepat:</span>
                      <button
                        type="button"
                        onClick={() => handleJumpToSelectedDate(2026, 11, 20)}
                        className="rounded-xs bg-brand-orange/15 px-2 py-0.5 text-[10px] font-bold text-brand-orange hover:bg-brand-orange hover:text-ink transition-colors cursor-pointer border border-brand-orange/40"
                      >
                        20 Des 2026
                      </button>
                      <button
                        type="button"
                        onClick={() => {
                          const today = new Date();
                          handleJumpToSelectedDate(today.getFullYear(), today.getMonth(), today.getDate());
                        }}
                        className="rounded-xs bg-teal-solid/15 px-2 py-0.5 text-[10px] font-bold text-teal-text hover:bg-teal-solid hover:text-white transition-colors cursor-pointer border border-teal-solid/40"
                      >
                        Hari Ini
                      </button>
                      <button
                        type="button"
                        onClick={() => handleJumpToSelectedDate(2026, 0, 1)}
                        className="rounded-xs bg-surface-muted px-2 py-0.5 text-[10px] font-medium text-gray-400 hover:text-heading transition-colors cursor-pointer border border-line"
                      >
                        1 Jan 2026
                      </button>
                    </div>

                    {/* Primary Jump Action Button */}
                    <button
                      type="button"
                      onClick={() => handleJumpToSelectedDate()}
                      className="w-full mt-1 rounded-sm bg-brand-orange py-2 text-xs font-bold text-ink hover:bg-amber-400 transition-colors shadow-xs flex items-center justify-center gap-1.5 cursor-pointer"
                    >
                      <CalendarIcon className="h-3.5 w-3.5" />
                      <span>Lompat ke {selectedDay} {MONTH_NAMES_ID[selectedMonth]} {selectedYear} ➔</span>
                    </button>
                  </div>
                </div>
              )}
            </div>
          </div>
        </div>
      </div>

      {/* ========================================================================= */}
      {/* LEVEL 1: MULTI-PROJECT GANTT OVERVIEW (TAMPILAN AWAL 5 PROYEK)          */}
      {/* 1 Row = 1 Project Bar. Spans start to end date. Zero overlapping!       */}
      {/* Sticky Column: z-30 with 100% solid background so cards slide UNDER!     */}
      {/* Canvas can be scrolled all the way to January 2026!                     */}
      {/* ========================================================================= */}
      {!selectedProject ? (
        filteredProjects.length === 0 ? (
          <div className="rounded-md border border-line bg-surface p-12 text-center">
            <FolderGit2 className="mx-auto h-12 w-12 text-gray-400 mb-3" />
            <h3 className="text-base font-bold text-heading">Tidak ada project yang terdaftar</h3>
            <p className="mt-1 text-xs text-gray-500">
              {searchQuery
                ? 'Tidak ditemukan project yang sesuai dengan filter pencarian.'
                : 'Belum ada project aktif di roadmap ini.'}
            </p>
          </div>
        ) : (
          <div className="overflow-hidden rounded-md border border-line bg-surface shadow-xs relative">
            <div
              ref={scrollContainerRef}
              onMouseDown={handleCanvasMouseDown}
              className={`overflow-x-auto timeline-scrollbar ${isPanning ? 'cursor-grabbing' : 'cursor-default'}`}
            >
              <div
                className="min-w-fit flex flex-col relative"
                style={{
                  width: `${leftColWidth + totalGridWidth}px`,
                }}
              >
                {/* Header: Months & Days/Weeks */}
                <div className="sticky top-0 z-30 bg-surface border-b border-line shadow-2xs">
                  {/* Top Row: Month Grouping (First Row - Always shown) */}
                  <div className={`flex ${viewMode !== 'month' ? 'border-b border-line/60' : ''}`}>
                    <div
                      style={{ width: `${leftColWidth}px` }}
                      className="sticky left-0 z-40 shrink-0 border-r border-line bg-surface px-4 py-2 text-xs font-bold uppercase tracking-wider text-gray-500 flex items-center justify-between shadow-[4px_0_12px_rgba(0,0,0,0.06)] dark:shadow-[4px_0_12px_rgba(0,0,0,0.4)]"
                    >
                      <span>Daftar Proyek</span>
                      <span className="text-[11px] font-bold text-teal-text">
                        {filteredProjects.length} Proyek
                      </span>
                    </div>
                    <div className="flex flex-1">
                      {monthHeaders.map((m, idx) => (
                        <div
                          key={idx}
                          style={{ width: `${m.countDays * pixelsPerDay}px` }}
                          className="border-r border-line/60 px-3 py-2 text-xs font-bold text-heading bg-surface-muted/30 truncate"
                        >
                          {m.label}
                        </div>
                      ))}
                    </div>
                  </div>

                  {/* Sub Row: Only for Day & Week views (In Monthly view, second row is removed!) */}
                  {viewMode !== 'month' && (
                    <div className="flex">
                      <div
                        style={{ width: `${leftColWidth}px` }}
                        className="sticky left-0 z-40 shrink-0 border-r border-line bg-surface px-4 py-1.5 text-xs font-semibold text-gray-500 shadow-[4px_0_12px_rgba(0,0,0,0.06)] dark:shadow-[4px_0_12px_rgba(0,0,0,0.4)]"
                      >
                        Klik baris di bawah untuk fokus view ➔
                      </div>
                      <div className="flex flex-1 relative">
                        {viewMode === 'day' ? (
                          allDays.map((d, idx) => {
                            const isToday = toIso(d) === todayDate;
                            const dayNum = d.getDate();
                            const dayLetter = DAY_NAMES[(d.getDay() + 6) % 7];
                            const isWeekend = d.getDay() === 0 || d.getDay() === 6;

                            return (
                              <div
                                key={idx}
                                style={{ width: `${config.colWidth}px` }}
                                className={`shrink-0 border-r border-line/40 py-1 text-center transition-colors overflow-hidden ${
                                  isToday
                                    ? 'bg-teal-solid/15 font-bold text-teal-text'
                                    : isWeekend
                                    ? 'bg-surface-muted/50 text-gray-400'
                                    : 'text-gray-600'
                                }`}
                              >
                                {config.colWidth >= 26 && (
                                  <div className="text-[9px] uppercase font-medium truncate">{dayLetter}</div>
                                )}
                                <div className={`text-[10px] sm:text-xs truncate ${isToday ? 'font-bold' : ''}`}>{dayNum}</div>
                              </div>
                            );
                          })
                        ) : (
                          /* M1-M4 Weekly Headers per Month: No more cramped N+1 weeks! */
                          weeklyColumns.map((col, wIdx) => (
                            <div
                              key={wIdx}
                              style={{ width: `${col.widthPx}px` }}
                              className="shrink-0 border-r border-line/40 py-1 text-center transition-colors hover:bg-surface-muted/30 overflow-hidden px-0.5"
                            >
                              <div className="text-xs font-bold text-heading truncate">{col.label}</div>
                              {col.widthPx >= 65 && (
                                <div className="text-[10px] text-gray-500 font-medium truncate px-1">
                                  {col.subLabel}
                                </div>
                              )}
                            </div>
                          ))
                        )}
                      </div>
                    </div>
                  )}
                </div>

                {/* Grid Canvas Content */}
                <div className="relative divide-y divide-line/60">
                  {/* Vertical "Today" Marker Line */}
                  {todayOffsetPx !== null && (
                    <div
                      className="pointer-events-none absolute bottom-0 top-0 z-20 w-0.5 bg-brand-orange shadow-[0_0_8px_rgba(247,149,82,0.6)]"
                      style={{
                        left: `${leftColWidth + todayOffsetPx}px`,
                      }}
                    >
                      <div className="sticky top-[80px] -ml-2.5 flex h-5 w-5 items-center justify-center rounded-full bg-brand-orange text-[9px] font-bold text-white shadow-md">
                        •
                      </div>
                    </div>
                  )}

                  {/* Vertical Jump Target Marker Line: Refined design with centered, auto-expanding badge */}
                  {jumpMarkerDateIso && jumpMarkerOffsetPx !== null && (
                    <div
                      className="pointer-events-none absolute bottom-0 top-0 z-25 w-0.5 bg-cyan-400 shadow-[0_0_12px_rgba(34,211,238,0.9)]"
                      style={{
                        left: `${leftColWidth + jumpMarkerOffsetPx}px`,
                      }}
                    >
                      <div className="sticky top-[80px] -translate-x-1/2 inline-flex items-center gap-2 rounded-full bg-cyan-500 text-slate-950 font-bold text-xs px-4 py-1.5 shadow-[0_4px_20px_rgba(34,211,238,0.45)] border border-cyan-200/90 whitespace-nowrap z-30 animate-in fade-in zoom-in-95 duration-200">
                        <span className="relative flex h-2.5 w-2.5">
                          <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-slate-950 opacity-75"></span>
                          <span className="relative inline-flex rounded-full h-2.5 w-2.5 bg-slate-950"></span>
                        </span>
                        <span>{jumpMarkerLabel}</span>
                      </div>
                    </div>
                  )}

                  {/* Loop Projects: 1 Project = 1 Dedicated Row (NO OVERLAPPING!) */}
                  {filteredProjects.map((project) => {
                    const completedItems = project.items.filter((i) => i.status === 'done').length;
                    const totalItems = project.items.length;

                    // Calculate project span: min start to max end
                    let pStartIso = todayDate;
                    let pEndIso = todayDate;
                    if (project.items.length > 0) {
                      const sortedStarts = [...project.items].sort((a, b) =>
                        a.startDate.localeCompare(b.startDate)
                      );
                      const sortedEnds = [...project.items].sort((a, b) =>
                        b.endDate.localeCompare(a.endDate)
                      );
                      pStartIso = sortedStarts[0].startDate;
                      pEndIso = sortedEnds[0].endDate;
                    }

                    const pStart = parseDate(pStartIso);
                    const pEnd = parseDate(pEndIso);
                    const startOffsetDays = diffDays(pStart, CALENDAR_START_DATE);
                    const durationDays = Math.max(1, diffDays(pEnd, pStart) + 1);

                    const leftPx = startOffsetDays * pixelsPerDay;
                    const widthPx = durationDays * pixelsPerDay;
                    const isHighlighted = highlightedProjectId === project.id;

                    return (
                      <div
                        key={project.id}
                        className="flex items-center hover:bg-surface-muted/30 transition group"
                      >
                        {/* Left Sticky Info Column: CLICKABLE TO JUMP & FOCUS VIEW (Does not open sprints) */}
                        <div
                          style={{ width: `${leftColWidth}px` }}
                          onClick={() => handleProjectRowClick(project, leftPx)}
                          className="sticky left-0 z-30 shrink-0 border-r border-line bg-surface shadow-[4px_0_12px_rgba(0,0,0,0.06)] dark:shadow-[4px_0_12px_rgba(0,0,0,0.4)] px-4 py-3 flex items-center justify-between gap-3 transition-colors cursor-pointer hover:bg-surface-muted/60 group/row"
                          title="Klik baris ini untuk melompat dan fokus ke posisi project pada timeline"
                        >
                          <div className="min-w-0 flex items-center gap-3 flex-1">
                            <span className="flex h-8 w-8 items-center justify-center rounded-sm bg-teal-solid/10 text-teal-text shrink-0 group-hover/row:bg-teal-solid group-hover/row:text-white transition-colors">
                              <FolderGit2 className="h-4 w-4" />
                            </span>
                            <div className="min-w-0 flex-1">
                              <p
                                className="text-xs font-bold text-heading truncate group-hover/row:text-brand-orange transition-colors"
                                title={project.name}
                              >
                                {project.name}
                              </p>
                              {/* Single-line badges: Strictly whitespace-nowrap to prevent ugly wrapping! */}
                              <div className="flex items-center gap-2 mt-1">
                                <span
                                  className={`inline-flex items-center whitespace-nowrap rounded-xs px-2 py-0.5 text-[9px] font-bold uppercase tracking-wider shrink-0 ${
                                    project.status === 'on_progress'
                                      ? 'bg-teal-solid/15 text-teal-text'
                                      : project.status === 'done'
                                      ? 'bg-emerald-100 text-emerald-800 dark:bg-emerald-950/60 dark:text-emerald-300'
                                      : 'bg-gray-100 text-gray-700 dark:bg-gray-800 dark:text-gray-300'
                                  }`}
                                >
                                  {project.status.replace('_', ' ')}
                                </span>
                                <span className="text-[10px] text-gray-400 whitespace-nowrap">
                                  {completedItems}/{totalItems} goals (5 sprint)
                                </span>
                              </div>
                            </div>
                          </div>

                          {/* Members Avatar Stack */}
                          {project.members.length > 0 && (
                            <div className="flex -space-x-1.5 shrink-0 pl-1">
                              {project.members.slice(0, 3).map((m) => (
                                <div
                                  key={m.id}
                                  title={m.fullName}
                                  className="h-6 w-6 rounded-full bg-teal-solid text-[9px] font-bold text-white flex items-center justify-center border border-white dark:border-background shadow-2xs"
                                >
                                  {m.fullName.charAt(0)}
                                </div>
                              ))}
                            </div>
                          )}
                        </div>

                        {/* Right Grid Track: Cards have z-10 so they slide UNDER the sticky column cleanly! */}
                        <div
                          style={{ width: `${totalGridWidth}px` }}
                          className="relative h-14 flex items-center"
                        >
                          {/* Background Grid Lines */}
                          <div className="absolute inset-0 flex pointer-events-none">
                            {allDays.map((d, idx) => {
                              const isWeekend = d.getDay() === 0 || d.getDay() === 6;
                              return (
                                <div
                                  key={idx}
                                  style={{ width: `${pixelsPerDay}px` }}
                                  className={`shrink-0 border-r border-line/30 h-full ${
                                    isWeekend ? 'bg-surface-muted/30' : ''
                                  }`}
                                />
                              );
                            })}
                          </div>

                          {/* Master Project Bar: Clean Card matching Gambar 2 (Click opens the project!) */}
                          <div
                            style={{
                              left: `${leftPx}px`,
                              width: `${Math.max(widthPx, 180)}px`,
                            }}
                            onClick={(e) => {
                              e.stopPropagation();
                              setSelectedProjectId(project.id);
                            }}
                            className={`timeline-card absolute h-11 rounded-sm pl-3 pr-3.5 flex items-center justify-between border shadow-xs select-none cursor-pointer group/card ${
                              isHighlighted
                                ? 'z-20 ring-2 ring-brand-orange shadow-lg scale-[1.02] transition-all'
                                : 'z-10 transition-all duration-75 hover:border-teal-solid hover:scale-[1.005]'
                            } ${
                              project.status === 'done'
                                ? 'bg-emerald-50/95 dark:bg-emerald-950/40 border-emerald-400 dark:border-emerald-700 text-emerald-950 dark:text-emerald-100'
                                : 'bg-surface border-line text-heading'
                            }`}
                            title="Klik card ini untuk membuka detail 5 sprint milestone project ini"
                          >
                            {/* Left Accent Bar & Title / Dates: Identical refined layout to Gambar 2 */}
                            <div className="flex items-center gap-2.5 min-w-0 pr-1">
                              <div
                                className={`h-5 w-1 rounded-full shrink-0 ${
                                  project.status === 'done' ? 'bg-emerald-600' : 'bg-teal-solid'
                                }`}
                              />
                              <div className="min-w-0 truncate">
                                <span className="block text-xs font-bold leading-tight text-heading group-hover/card:text-brand-orange transition-colors truncate">
                                  {project.name}
                                </span>
                                <span className="block text-[10px] text-gray-500 font-medium leading-none truncate mt-0.5">
                                  {pStartIso.slice(5)} – {pEndIso.slice(5)} ({durationDays} hari)
                                </span>
                              </div>
                            </div>
                          </div>
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>
            </div>
          </div>
        )
      ) : (
        /* ========================================================================= */
        /* LEVEL 2: DETAIL PROJECT TIMELINE (5 SPRINTS MILESTONE GANTT)             */
        /* 1 Row = 1 Milestone Bar. Left column clicks auto-scroll to milestone!    */
        /* Drag handle (6 dots :::) extends card to next grid column!               */
        /* Completed/Done items CANNOT be extended!                                  */
        /* ========================================================================= */
        <div className="flex flex-col gap-4">
          {/* Project Details Bar */}
          <div className="flex flex-wrap items-center justify-between gap-3 rounded-md border border-line bg-surface p-5 shadow-xs">
            <div className="flex items-center gap-3">
              <span className="flex h-9 w-9 items-center justify-center rounded-sm bg-teal-solid text-white shrink-0">
                <FolderGit2 className="h-4 w-4" />
              </span>
              <div>
                <div className="flex items-center gap-2">
                  <h2 className="text-base font-bold text-heading">{selectedProject.name}</h2>
                  <span
                    className={`rounded-xs px-2 py-0.5 text-[10px] font-semibold uppercase ${
                      selectedProject.status === 'on_progress'
                        ? 'bg-teal-solid/15 text-teal-text'
                        : selectedProject.status === 'done'
                        ? 'bg-emerald-100 text-emerald-800'
                        : 'bg-gray-100 text-gray-700'
                    }`}
                  >
                    {selectedProject.status.replace('_', ' ')}
                  </span>
                </div>
                <div className="flex items-center gap-3 text-xs text-gray-500 mt-1">
                  <span>
                    Anggota:{' '}
                    {selectedProject.members.map((m) => m.fullName).join(', ') || 'Belum ada'}
                  </span>
                  <span>•</span>
                  <span>
                    {selectedProject.items.filter((i) => i.status === 'done').length} dari{' '}
                    {selectedProject.items.length} sprint selesai
                  </span>
                </div>
              </div>
            </div>

            <div className="flex items-center gap-2">
              {isAdmin && drilldownBaseUrl && (
                <Link
                  href={`/committee/projects/${selectedProject.id}`}
                  className="inline-flex items-center gap-1.5 rounded-sm border border-teal-solid bg-teal-solid/10 px-3.5 py-1.5 text-xs font-bold text-teal-text hover:border-brand-orange hover:bg-brand-orange hover:text-ink transition-all shadow-2xs"
                >
                  <ExternalLink className="h-3.5 w-3.5" /> Kelola Project
                </Link>
              )}
              <button
                type="button"
                onClick={() => setSelectedProjectId(null)}
                className="inline-flex items-center gap-1.5 rounded-sm bg-teal-solid px-3.5 py-1.5 text-xs font-bold text-white hover:bg-teal-solid-hover transition shadow-2xs cursor-pointer"
              >
                <ArrowLeft className="h-3.5 w-3.5" /> Kembali ke Daftar Project
              </button>
            </div>
          </div>

          {/* Main Milestones Gantt Canvas */}
          {selectedProject.items.length === 0 ? (
            <div className="rounded-md border border-line bg-surface p-12 text-center">
              <CalendarIcon className="mx-auto h-12 w-12 text-gray-400 mb-3" />
              <h3 className="text-base font-bold text-heading">Belum ada milestone pada project ini</h3>
              <p className="mt-1 text-xs text-gray-500">
                Tambahkan milestone tahapan kerja pada menu manajemen project untuk memulai tracking.
              </p>
            </div>
          ) : (
            <div className="overflow-hidden rounded-md border border-line bg-surface shadow-xs relative">
              <div
                ref={scrollContainerRef}
                onMouseDown={handleCanvasMouseDown}
                className={`overflow-x-auto timeline-scrollbar ${isPanning ? 'cursor-grabbing' : 'cursor-default'}`}
              >
                <div
                  className="min-w-fit flex flex-col relative"
                  style={{
                    width: `${leftColWidth + totalGridWidth}px`,
                  }}
                >
                  {/* Header: Months & Days/Weeks */}
                  <div className="sticky top-0 z-30 bg-surface border-b border-line shadow-2xs">
                    {/* Top Row: Month Grouping (First Row - Always shown) */}
                    <div className={`flex ${viewMode !== 'month' ? 'border-b border-line/60' : ''}`}>
                      <div
                        style={{ width: `${leftColWidth}px` }}
                        className="sticky left-0 z-40 shrink-0 border-r border-line bg-surface px-4 py-2 text-xs font-bold uppercase tracking-wider text-gray-500 flex items-center justify-between shadow-[4px_0_12px_rgba(0,0,0,0.06)] dark:shadow-[4px_0_12px_rgba(0,0,0,0.4)]"
                      >
                        <span>Daftar Sprint Milestone</span>
                        <span className="text-[11px] font-bold text-teal-text">
                          {selectedProject.items.length} Sprint
                        </span>
                      </div>
                      <div className="flex flex-1">
                        {monthHeaders.map((m, idx) => (
                          <div
                            key={idx}
                            style={{ width: `${m.countDays * pixelsPerDay}px` }}
                            className="border-r border-line/60 px-3 py-2 text-xs font-bold text-heading bg-surface-muted/30 truncate"
                          >
                            {m.label}
                          </div>
                        ))}
                      </div>
                    </div>

                    {/* Sub Row: Only for Day & Week views (In Monthly view, second row is removed!) */}
                    {viewMode !== 'month' && (
                      <div className="flex">
                        <div
                          style={{ width: `${leftColWidth}px` }}
                          className="sticky left-0 z-40 shrink-0 border-r border-line bg-surface px-4 py-1.5 text-xs font-semibold text-gray-500 shadow-[4px_0_12px_rgba(0,0,0,0.06)] dark:shadow-[4px_0_12px_rgba(0,0,0,0.4)]"
                        >
                          Klik sprint di bawah untuk melompat ➔
                        </div>
                        <div className="flex flex-1 relative">
                          {viewMode === 'day' ? (
                            allDays.map((d, idx) => {
                              const isToday = toIso(d) === todayDate;
                              const dayNum = d.getDate();
                              const dayLetter = DAY_NAMES[(d.getDay() + 6) % 7];
                              const isWeekend = d.getDay() === 0 || d.getDay() === 6;

                              return (
                                <div
                                  key={idx}
                                  style={{ width: `${config.colWidth}px` }}
                                  className={`shrink-0 border-r border-line/40 py-1 text-center transition-colors ${
                                    isToday
                                      ? 'bg-teal-solid/15 font-bold text-teal-text'
                                      : isWeekend
                                      ? 'bg-surface-muted/50 text-gray-400'
                                      : 'text-gray-600'
                                  }`}
                                >
                                  {config.colWidth >= 26 && (
                                    <div className="text-[9px] uppercase font-medium truncate">{dayLetter}</div>
                                  )}
                                  <div className={`text-[10px] sm:text-xs truncate ${isToday ? 'font-bold' : ''}`}>{dayNum}</div>
                                </div>
                              );
                            })
                          ) : (
                            /* M1-M4 Weekly Headers per Month */
                            weeklyColumns.map((col, wIdx) => (
                              <div
                                key={wIdx}
                                style={{ width: `${col.widthPx}px` }}
                                className="shrink-0 border-r border-line/40 py-1 text-center transition-colors hover:bg-surface-muted/30 overflow-hidden px-0.5"
                              >
                                <div className="text-xs font-bold text-heading truncate">{col.label}</div>
                                {col.widthPx >= 65 && (
                                  <div className="text-[10px] text-gray-500 font-medium truncate px-1">
                                    {col.subLabel}
                                  </div>
                                )}
                              </div>
                            ))
                          )}
                        </div>
                      </div>
                    )}
                  </div>

                  {/* Milestones Content: 1 Milestone = 1 Dedicated Row (Zero Overlapping!) */}
                  <div className="relative divide-y divide-line/60">
                    {/* Vertical "Today" Marker Line */}
                    {todayOffsetPx !== null && (
                      <div
                        className="pointer-events-none absolute bottom-0 top-0 z-20 w-0.5 bg-brand-orange shadow-[0_0_8px_rgba(247,149,82,0.6)]"
                        style={{
                          left: `${leftColWidth + todayOffsetPx}px`,
                        }}
                      >
                        <div className="sticky top-[80px] -ml-2.5 flex h-5 w-5 items-center justify-center rounded-full bg-brand-orange text-[9px] font-bold text-white shadow-md">
                          •
                        </div>
                      </div>
                    )}

                    {/* Vertical Jump Target Marker Line: Refined design with centered, auto-expanding badge */}
                    {jumpMarkerDateIso && jumpMarkerOffsetPx !== null && (
                      <div
                        className="pointer-events-none absolute bottom-0 top-0 z-25 w-0.5 bg-cyan-400 shadow-[0_0_12px_rgba(34,211,238,0.9)]"
                        style={{
                          left: `${leftColWidth + jumpMarkerOffsetPx}px`,
                        }}
                      >
                        <div className="sticky top-[80px] -translate-x-1/2 inline-flex items-center gap-2 rounded-full bg-cyan-500 text-slate-950 font-bold text-xs px-4 py-1.5 shadow-[0_4px_20px_rgba(34,211,238,0.45)] border border-cyan-200/90 whitespace-nowrap z-30 animate-in fade-in zoom-in-95 duration-200">
                          <span className="relative flex h-2.5 w-2.5">
                            <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-slate-950 opacity-75"></span>
                            <span className="relative inline-flex rounded-full h-2.5 w-2.5 bg-slate-950"></span>
                          </span>
                          <span>{jumpMarkerLabel}</span>
                        </div>
                      </div>
                    )}

                    {selectedProject.items.map((item, idx) => {
                      const isDraggingThis = dragState?.itemId === item.id;
                      const effectiveEndDate = isDraggingThis
                        ? dragState.currentEndDate
                        : item.endDate;

                      const itemStart = parseDate(item.startDate);
                      const itemEnd = parseDate(effectiveEndDate);

                      // If extended beyond today, overdue automatically flips to on track!
                      const isOverdue =
                        item.status === 'not_yet' && effectiveEndDate < todayDate;
                      const isDone = item.status === 'done';

                      const startOffsetDays = diffDays(itemStart, CALENDAR_START_DATE);
                      const durationDays = Math.max(1, diffDays(itemEnd, itemStart) + 1);

                      const leftPx = startOffsetDays * pixelsPerDay;
                      const widthPx = durationDays * pixelsPerDay;

                      const isHighlighted = highlightedItemId === item.id;

                      return (
                        <div
                          key={item.id}
                          className="flex items-center hover:bg-surface-muted/30 transition group/row"
                        >
                          {/* Left Sticky Milestone Label: CLICKABLE TO JUMP VIEW! */}
                          <div
                            style={{ width: `${leftColWidth}px` }}
                            onClick={() => handleSprintClick(item, leftPx)}
                            className="sticky left-0 z-30 shrink-0 border-r border-line bg-surface shadow-[4px_0_12px_rgba(0,0,0,0.06)] dark:shadow-[4px_0_12px_rgba(0,0,0,0.4)] px-4 py-3 flex items-center justify-between gap-2 cursor-pointer hover:bg-surface-muted/60 transition-colors group/label"
                            title="Klik untuk langsung melompat ke posisi milestone ini pada timeline"
                          >
                            <div className="min-w-0 pr-2">
                              <div className="flex items-center gap-1.5">
                                <span className="text-[10px] font-bold text-teal-text bg-teal-solid/10 px-1.5 py-0.2 rounded-xs whitespace-nowrap">
                                  Sprint #{idx + 1}
                                </span>
                                <p className="text-xs font-bold text-heading truncate group-hover/label:text-brand-orange transition-colors">
                                  {item.title}
                                </p>
                              </div>
                              <p className="text-[11px] text-gray-500 mt-1 whitespace-nowrap">
                                {item.startDate} s/d {effectiveEndDate} ({durationDays} hari)
                              </p>
                            </div>

                            <div className="flex items-center gap-1.5 shrink-0">
                              {isOverdue && (
                                <span
                                  className="rounded-xs bg-red-100 text-danger dark:bg-red-950/60 dark:text-red-300 px-1.5 py-0.5 text-[10px] font-bold flex items-center gap-0.5 whitespace-nowrap"
                                  title="Deadline terlewat"
                                >
                                  <AlertCircle className="h-3 w-3" /> Overdue
                                </span>
                              )}
                              {isDone && (
                                <span className="rounded-xs bg-emerald-100 text-emerald-800 dark:bg-emerald-950/60 dark:text-emerald-300 px-1.5 py-0.5 text-[10px] font-bold flex items-center gap-0.5 whitespace-nowrap">
                                  <Check className="h-3 w-3" /> Selesai
                                </span>
                              )}
                              {!isOverdue && !isDone && (
                                <span className="rounded-xs bg-teal-solid/10 text-teal-text dark:bg-teal-950/60 dark:text-teal-300 px-1.5 py-0.5 text-[10px] font-semibold flex items-center gap-0.5 whitespace-nowrap">
                                  <Clock className="h-3 w-3" /> Berjalan
                                </span>
                              )}
                            </div>
                          </div>

                          {/* Right Canvas Track with Milestone Bar */}
                          <div
                            style={{ width: `${totalGridWidth}px` }}
                            className="relative h-14 flex items-center"
                          >
                            {/* Background Grid Lines */}
                            <div className="absolute inset-0 flex pointer-events-none">
                              {allDays.map((d, colIdx) => {
                                const isWeekend = d.getDay() === 0 || d.getDay() === 6;
                                return (
                                  <div
                                    key={colIdx}
                                    style={{ width: `${pixelsPerDay}px` }}
                                    className={`shrink-0 border-r border-line/30 h-full ${
                                      isWeekend ? 'bg-surface-muted/30' : ''
                                    }`}
                                  />
                                );
                              })}
                            </div>

                            {/* Milestone Card: Interactive Drag-to-Extend with 6-dot grip (LOCKED IF DONE) */}
                            <div
                              style={{
                                left: `${leftPx}px`,
                                width: `${Math.max(widthPx, 160)}px`,
                              }}
                              className={`timeline-card absolute h-11 rounded-sm pl-3 ${
                                !isDone ? 'pr-8' : 'pr-3'
                              } flex items-center justify-between border shadow-xs select-none ${
                                isDraggingThis
                                  ? 'z-20 ring-2 ring-teal-solid scale-[1.01] transition-none'
                                  : isHighlighted
                                  ? 'z-20 ring-2 ring-brand-orange shadow-lg transition-all scale-[1.02]'
                                  : 'z-10 transition-all duration-75'
                              } ${
                                isOverdue
                                  ? 'bg-amber-50/95 dark:bg-amber-950/40 border-brand-orange text-ink dark:text-amber-100'
                                  : isDone
                                  ? 'bg-emerald-50/95 dark:bg-emerald-950/40 border-emerald-400 dark:border-emerald-700 text-emerald-950 dark:text-emerald-100 opacity-90'
                                  : 'bg-surface border-line text-heading hover:border-teal-solid'
                              }`}
                            >
                              {/* Left Accent Bar & Title / Dates */}
                              <div className="flex items-center gap-2.5 min-w-0 pr-1">
                                <div
                                  className={`h-5 w-1 rounded-full shrink-0 ${
                                    isOverdue
                                      ? 'bg-brand-orange'
                                      : isDone
                                      ? 'bg-emerald-600'
                                      : 'bg-teal-solid'
                                  }`}
                                />
                                <div className="min-w-0 truncate">
                                  <span className="block text-xs font-bold leading-tight truncate">
                                    {item.title}
                                  </span>
                                  <span className="block text-[10px] text-gray-500 font-medium leading-none truncate mt-0.5">
                                    {item.startDate.slice(5)} – {effectiveEndDate.slice(5)} ({durationDays} hari)
                                  </span>
                                </div>
                              </div>

                              {/* Member Request Action Button if Overdue */}
                              {!isAdmin && isOverdue && (
                                <button
                                  type="button"
                                  onClick={() =>
                                    setSelectedItemForExtension({
                                      item,
                                      projectName: selectedProject.name,
                                    })
                                  }
                                  className="rounded-xs bg-brand-orange px-2 py-0.5 text-[10px] font-bold text-ink hover:bg-amber-400 transition shadow-2xs cursor-pointer shrink-0 ml-1"
                                  title="Ajukan perpanjangan deadline ke admin"
                                >
                                  Request
                                </button>
                              )}

                              {/* If Done: Display locked Selesai badge. If Not Done: Display 6-DOT DRAG HANDLE! */}
                              {!isDone ? (
                                <div
                                  onMouseDown={(e) => handleStartDrag(e, item)}
                                  className="absolute right-0 top-0 bottom-0 w-7 flex items-center justify-center cursor-ew-resize rounded-r-xs border-l border-line/60 bg-surface-muted/50 hover:bg-teal-solid/25 active:bg-teal-solid/40 text-gray-400 hover:text-teal-text transition-colors select-none group/grip z-20"
                                  title={`Tarik ke kanan/kiri untuk memperpanjang deadline (Snap: ${
                                    viewMode === 'day'
                                      ? '1 hari/kolom'
                                      : viewMode === 'week'
                                      ? '1 minggu/kolom'
                                      : '1 bulan/kolom'
                                  })`}
                                >
                                  <DragGripIcon className="transition-transform group-hover/grip:scale-110 pointer-events-none" />
                                </div>
                              ) : (
                                <span className="rounded-xs bg-emerald-600/20 text-emerald-700 dark:text-emerald-300 px-1.5 py-0.5 text-[9px] font-bold shrink-0 ml-1">
                                  Terkunci
                                </span>
                              )}

                              {/* Live Dragging Tooltip */}
                              {isDraggingThis && (
                                <div className="absolute -top-9 right-0 z-50 rounded-sm bg-ink px-2.5 py-1 text-[11px] font-bold text-white shadow-xl whitespace-nowrap pointer-events-none border border-teal-solid">
                                  Perpanjang ke: {effectiveEndDate} ({durationDays} hari)
                                </div>
                              )}
                            </div>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </div>
              </div>
            </div>
          )}
        </div>
      )}

      {/* FLOATING ZOOM CONTROLS IN BOTTOM-RIGHT CORNER: 25% to 200% */}
      <div className="fixed bottom-6 right-8 z-40 flex items-center gap-1.5 rounded-md border border-line bg-surface/95 backdrop-blur-md px-2.5 py-1.5 shadow-2xl">
        <button
          type="button"
          onClick={handleZoomOut}
          disabled={zoomScale <= 0.25}
          className="flex h-7 w-7 items-center justify-center rounded-sm text-gray-500 hover:text-brand-orange hover:bg-surface-muted transition disabled:opacity-30 disabled:cursor-not-allowed cursor-pointer"
          title="Perkecil skala timeline (-) (Min: 25%)"
        >
          <ZoomOut className="h-4 w-4" />
        </button>

        <span
          className="text-xs font-bold text-heading min-w-12 text-center select-none"
          title="Skala Zoom Timeline (25% - 200%)"
        >
          {Math.round(zoomScale * 100)}%
        </span>

        <button
          type="button"
          onClick={handleZoomIn}
          disabled={zoomScale >= 2.0}
          className="flex h-7 w-7 items-center justify-center rounded-sm text-gray-500 hover:text-brand-orange hover:bg-surface-muted transition disabled:opacity-30 disabled:cursor-not-allowed cursor-pointer"
          title="Perbesar skala timeline (+) (Max: 200%)"
        >
          <ZoomIn className="h-4 w-4" />
        </button>

        {zoomScale !== 1.0 && (
          <button
            type="button"
            onClick={handleZoomReset}
            className="flex h-7 w-7 items-center justify-center rounded-sm text-gray-400 hover:text-brand-orange transition cursor-pointer ml-0.5 border-l border-line/60 pl-1"
            title="Reset ke 100%"
          >
            <RotateCcw className="h-3.5 w-3.5" />
          </button>
        )}
      </div>

      {/* Extension Request Modal (for Members when task is Overdue) */}
      {selectedItemForExtension && (
        <ExtensionRequestDialog
          item={selectedItemForExtension.item}
          projectName={selectedItemForExtension.projectName}
          onClose={() => setSelectedItemForExtension(null)}
          onSuccess={() => {
            setSelectedItemForExtension(null);
            router.refresh();
          }}
        />
      )}
    </div>
  );
}

/**
 * Modal dialog for requesting a deadline extension (escalation)
 * Strictly utilizes the existing backend sendTimelineRequest action
 */
function ExtensionRequestDialog({
  item,
  projectName,
  onClose,
  onSuccess,
}: {
  item: GanttTimelineItem;
  projectName: string;
  onClose: () => void;
  onSuccess: () => void;
}) {
  const [isPending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState(false);

  const handleSubmit = (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    setError(null);
    const form = e.currentTarget;
    const formData = new FormData(form);
    formData.set('kind', 'dates');

    startTransition(async () => {
      const res = await sendTimelineRequest(item.id, formData);
      if (res.error) {
        setError(res.error);
      } else {
        setSuccess(true);
        setTimeout(() => {
          onSuccess();
        }, 1200);
      }
    });
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4 backdrop-blur-xs font-sans">
      <div className="w-full max-w-lg rounded-md border border-line bg-surface p-6 shadow-2xl">
        <div className="flex items-center justify-between border-b border-line pb-3">
          <div>
            <h3 className="text-lg font-bold text-heading">Ajukan Perpanjangan Deadline</h3>
            <p className="text-xs text-gray-500">Project: {projectName}</p>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="rounded-sm p-1 text-gray-400 hover:bg-surface-muted hover:text-ink cursor-pointer"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        {success ? (
          <div className="my-8 text-center">
            <CheckCircle2 className="mx-auto h-12 w-12 text-teal-text mb-2" />
            <h4 className="text-base font-bold text-heading">Pengajuan Berhasil Dikirim!</h4>
            <p className="text-xs text-gray-500 mt-1">
              Admin akan meninjau alasan perpanjangan deadline ini.
            </p>
          </div>
        ) : (
          <form onSubmit={handleSubmit} className="mt-4 flex flex-col gap-4">
            {error && (
              <div className="rounded-sm bg-red-50 p-3 text-xs text-danger font-medium border border-red-200">
                Gagal mengajukan: {error}
              </div>
            )}

            <div>
              <span className="block text-xs font-bold text-heading">Tahap / Milestone:</span>
              <p className="mt-0.5 text-xs text-gray-700 font-semibold">{item.title}</p>
              <p className="text-[11px] text-gray-500">
                Deadline sekarang: {item.startDate} s/d {item.endDate}
              </p>
            </div>

            {/* Proposed Dates */}
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="block text-xs font-semibold text-gray-700">Tanggal Mulai Baru</label>
                <input
                  type="date"
                  name="proposedStart"
                  required
                  defaultValue={item.startDate}
                  className="mt-1 w-full rounded-sm border border-line bg-surface px-3 py-1.5 text-xs text-ink focus:border-teal-solid focus:outline-none"
                />
              </div>
              <div>
                <label className="block text-xs font-semibold text-gray-700">Deadline Baru (Selesai)</label>
                <input
                  type="date"
                  name="proposedEnd"
                  required
                  defaultValue={item.endDate}
                  className="mt-1 w-full rounded-sm border border-line bg-surface px-3 py-1.5 text-xs text-ink focus:border-teal-solid focus:outline-none"
                />
              </div>
            </div>

            {/* Reason / Description why overdue */}
            <div>
              <label className="block text-xs font-semibold text-gray-700">
                Deskripsi / Alasan Keterlambatan <span className="text-danger">*</span>
              </label>
              <textarea
                name="note"
                required
                rows={3}
                maxLength={1000}
                placeholder="Jelaskan alasan mengapa deadline terlambat (misal: kendala pengadaan komponen, pengujian integrasi server, dll.)..."
                className="mt-1 w-full rounded-sm border border-line bg-surface p-2.5 text-xs text-ink placeholder:text-gray-400 focus:border-teal-solid focus:outline-none"
              />
            </div>

            {/* Evidence URL */}
            <div>
              <label className="block text-xs font-semibold text-gray-700">
                Tautan Bukti / Dokumen Progress (Opsional)
              </label>
              <input
                type="url"
                name="evidenceUrl"
                maxLength={500}
                placeholder="https://github.com/... atau Google Drive"
                className="mt-1 w-full rounded-sm border border-line bg-surface px-3 py-1.5 text-xs text-ink placeholder:text-gray-400 focus:border-teal-solid focus:outline-none"
              />
            </div>

            {/* Actions */}
            <div className="flex items-center justify-end gap-2 border-t border-line pt-3 mt-2">
              <button
                type="button"
                onClick={onClose}
                disabled={isPending}
                className="rounded-sm border border-line px-4 py-2 text-xs font-semibold text-gray-600 hover:bg-surface-muted transition cursor-pointer"
              >
                Batal
              </button>
              <button
                type="submit"
                disabled={isPending}
                className="rounded-sm bg-teal-solid px-4 py-2 text-xs font-semibold text-white hover:bg-teal-solid-hover transition disabled:opacity-50 cursor-pointer"
              >
                {isPending ? 'Mengirim...' : 'Kirim Pengajuan ke Admin'}
              </button>
            </div>
          </form>
        )}
      </div>
    </div>
  );
}
