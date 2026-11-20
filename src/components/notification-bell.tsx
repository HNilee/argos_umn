'use client';

import { Bell, Check, ChevronDown, ChevronUp, ExternalLink, X } from 'lucide-react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useEffect, useRef, useState, useTransition } from 'react';
import { markAllNotificationsRead, markNotificationRead } from '@/actions/notifications';

export type NotificationItem = {
  id: string;
  type: 'timeline_request' | 'timeline_decision' | 'general';
  title: string;
  body: string;
  link: string | null;
  isRead: boolean;
  createdAt: Date | string;
};

export function NotificationBell({
  initialNotifications = [],
  initialUnreadCount = 0,
  notificationsUrl,
}: {
  initialNotifications?: NotificationItem[];
  initialUnreadCount?: number;
  notificationsUrl: string;
}) {
  const [isOpen, setIsOpen] = useState(false);
  const [unreadCount, setUnreadCount] = useState(initialUnreadCount);
  const [items, setItems] = useState<NotificationItem[]>(initialNotifications);
  const [isPending, startTransition] = useTransition();
  const dropdownRef = useRef<HTMLDivElement>(null);
  const router = useRouter();

  // Close when clicking outside
  useEffect(() => {
    function handleClickOutside(e: MouseEvent) {
      if (dropdownRef.current && !dropdownRef.current.contains(e.target as Node)) {
        setIsOpen(false);
      }
    }
    if (isOpen) {
      document.addEventListener('mousedown', handleClickOutside);
    }
    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
    };
  }, [isOpen]);

  const handleMarkOne = (id: string, e: React.MouseEvent) => {
    e.stopPropagation();
    startTransition(async () => {
      await markNotificationRead(id);
      setItems((prev) => prev.map((item) => (item.id === id ? { ...item, isRead: true } : item)));
      setUnreadCount((c) => Math.max(0, c - 1));
      router.refresh();
    });
  };

  const handleMarkAll = () => {
    startTransition(async () => {
      await markAllNotificationsRead();
      setItems((prev) => prev.map((item) => ({ ...item, isRead: true })));
      setUnreadCount(0);
      router.refresh();
    });
  };

  return (
    <div className="relative inline-block text-left" ref={dropdownRef}>
      {/* Bell Trigger */}
      <button
        type="button"
        onClick={() => setIsOpen(!isOpen)}
        className="relative flex h-9 w-9 items-center justify-center rounded-lg border border-line bg-surface text-ink transition hover:bg-surface-muted hover:border-teal-text focus:outline-none focus:ring-2 focus:ring-brand-light-blue"
        aria-label="Notifikasi"
        aria-expanded={isOpen}
      >
        <Bell className="h-4.5 w-4.5 text-heading" />
        {unreadCount > 0 && (
          <span className="absolute -top-1.5 -right-1.5 flex min-h-4.5 min-w-4.5 items-center justify-center rounded-full bg-brand-orange px-1 text-[11px] font-bold text-ink shadow-sm animate-pulse">
            {unreadCount > 99 ? '99+' : unreadCount}
          </span>
        )}
      </button>

      {/* Expandable Notification Card */}
      {isOpen && (
        <div className="absolute right-0 z-50 mt-2 w-80 sm:w-96 rounded-xl border border-line bg-surface p-0 shadow-xl transition-all duration-200">
          {/* Card Header */}
          <div className="flex items-center justify-between border-b border-line px-4 py-3 bg-surface-muted/50 rounded-t-xl">
            <div className="flex items-center gap-2">
              <span className="font-semibold text-heading text-sm">Notifikasi</span>
              {unreadCount > 0 && (
                <span className="rounded-full bg-brand-orange/20 px-2 py-0.5 text-xs font-semibold text-orange-text">
                  {unreadCount} baru
                </span>
              )}
            </div>
            <div className="flex items-center gap-2">
              {unreadCount > 0 && (
                <button
                  type="button"
                  onClick={handleMarkAll}
                  disabled={isPending}
                  className="text-xs text-teal-text hover:underline font-medium"
                >
                  Tandai semua dibaca
                </button>
              )}
              <button
                type="button"
                onClick={() => setIsOpen(false)}
                className="text-gray-400 hover:text-ink p-1 rounded-md"
                aria-label="Tutup"
              >
                <X className="h-4 w-4" />
              </button>
            </div>
          </div>

          {/* Card Content / Notification List */}
          <div className="max-h-80 overflow-y-auto divide-y divide-line/60">
            {items.length === 0 ? (
              <div className="py-8 text-center text-sm text-gray-500">
                <p>Tidak ada notifikasi baru.</p>
              </div>
            ) : (
              items.map((item) => (
                <div
                  key={item.id}
                  className={`p-3.5 transition-colors hover:bg-surface-muted/60 ${
                    !item.isRead ? 'bg-brand-light-blue/5' : ''
                  }`}
                >
                  <div className="flex items-start justify-between gap-2">
                    <div className="flex items-start gap-2 min-w-0">
                      {!item.isRead && (
                        <span className="mt-1.5 h-2 w-2 shrink-0 rounded-full bg-brand-orange" />
                      )}
                      <div className="min-w-0 flex-1">
                        <p className="text-xs font-semibold text-heading truncate">{item.title}</p>
                        <p className="mt-0.5 text-xs text-gray-600 line-clamp-2 leading-relaxed">
                          {item.body}
                        </p>
                        {item.link && (
                          <Link
                            href={item.link}
                            onClick={() => setIsOpen(false)}
                            className="mt-1.5 inline-flex items-center gap-1 text-[11px] font-medium text-teal-text hover:underline"
                          >
                            Lihat timeline <ExternalLink className="h-3 w-3" />
                          </Link>
                        )}
                      </div>
                    </div>
                    {!item.isRead && (
                      <button
                        type="button"
                        onClick={(e) => handleMarkOne(item.id, e)}
                        title="Tandai dibaca"
                        className="shrink-0 p-1 text-gray-400 hover:text-teal-text"
                      >
                        <Check className="h-3.5 w-3.5" />
                      </button>
                    )}
                  </div>
                </div>
              ))
            )}
          </div>

          {/* Card Footer with Collapse and Expand Options */}
          <div className="flex items-center justify-between border-t border-line px-4 py-2.5 bg-surface-muted/30 rounded-b-xl text-xs">
            <button
              type="button"
              onClick={() => setIsOpen(false)}
              className="flex items-center gap-1 font-medium text-gray-500 hover:text-ink transition"
            >
              <ChevronUp className="h-3.5 w-3.5" /> Collapse
            </button>
            <Link
              href={notificationsUrl}
              onClick={() => setIsOpen(false)}
              className="flex items-center gap-1 font-semibold text-teal-text hover:underline"
            >
              Expand ke semua notifikasi <ChevronDown className="h-3.5 w-3.5 -rotate-90" />
            </Link>
          </div>
        </div>
      )}
    </div>
  );
}
