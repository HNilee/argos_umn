'use client';

import { Bell, Check, CheckCheck, ExternalLink, Filter } from 'lucide-react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useState, useTransition } from 'react';
import { markAllNotificationsRead, markNotificationRead } from '@/actions/notifications';
import type { NotificationItem } from './notification-bell';

export function NotificationsView({
  initialNotifications,
}: {
  initialNotifications: NotificationItem[];
}) {
  const router = useRouter();
  const [items, setItems] = useState<NotificationItem[]>(initialNotifications);
  const [filter, setFilter] = useState<'all' | 'unread'>('all');
  const [isPending, startTransition] = useTransition();

  const unreadCount = items.filter((i) => !i.isRead).length;

  const handleMarkOne = (id: string) => {
    startTransition(async () => {
      await markNotificationRead(id);
      setItems((prev) => prev.map((item) => (item.id === id ? { ...item, isRead: true } : item)));
      router.refresh();
    });
  };

  const handleMarkAll = () => {
    startTransition(async () => {
      await markAllNotificationsRead();
      setItems((prev) => prev.map((item) => ({ ...item, isRead: true })));
      router.refresh();
    });
  };

  const filteredItems = items.filter((item) => (filter === 'unread' ? !item.isRead : true));

  return (
    <div className="flex flex-col gap-6">
      {/* Header & Controls */}
      <div className="flex flex-wrap items-center justify-between gap-4 rounded-2xl border border-line bg-surface p-5 shadow-xs">
        <div>
          <h1 className="text-2xl font-bold tracking-tight text-heading">Pusat Notifikasi</h1>
          <p className="text-xs text-gray-500 mt-0.5">
            Riwayat pembaruan status timeline, keputusan perpanjangan deadline, dan informasi lainnya.
          </p>
        </div>

        <div className="flex items-center gap-3">
          {/* Filter All / Unread */}
          <div className="flex items-center rounded-xl bg-surface-muted p-1 border border-line/60">
            <button
              type="button"
              onClick={() => setFilter('all')}
              className={`rounded-lg px-3 py-1.5 text-xs font-semibold transition ${
                filter === 'all'
                  ? 'bg-surface text-heading shadow-xs border border-line/70'
                  : 'text-gray-500 hover:text-ink'
              }`}
            >
              Semua ({items.length})
            </button>
            <button
              type="button"
              onClick={() => setFilter('unread')}
              className={`rounded-lg px-3 py-1.5 text-xs font-semibold transition ${
                filter === 'unread'
                  ? 'bg-surface text-heading shadow-xs border border-line/70'
                  : 'text-gray-500 hover:text-ink'
              }`}
            >
              Belum Dibaca ({unreadCount})
            </button>
          </div>

          {unreadCount > 0 && (
            <button
              type="button"
              onClick={handleMarkAll}
              disabled={isPending}
              className="inline-flex items-center gap-1.5 rounded-lg border border-line bg-surface px-3 py-1.5 text-xs font-semibold text-teal-text hover:bg-surface-muted transition"
            >
              <CheckCheck className="h-3.5 w-3.5" /> Tandai Semua Dibaca
            </button>
          )}
        </div>
      </div>

      {/* List */}
      {filteredItems.length === 0 ? (
        <div className="rounded-2xl border border-line bg-surface p-12 text-center shadow-xs">
          <Bell className="mx-auto h-12 w-12 text-gray-400 mb-3" />
          <h3 className="text-base font-semibold text-heading">Tidak ada notifikasi</h3>
          <p className="mt-1 text-xs text-gray-500">
            {filter === 'unread'
              ? 'Semua notifikasi sudah Anda baca.'
              : 'Belum ada notifikasi yang masuk ke akun Anda.'}
          </p>
        </div>
      ) : (
        <div className="divide-y divide-line rounded-2xl border border-line bg-surface shadow-xs overflow-hidden">
          {filteredItems.map((item) => {
            const dateStr =
              typeof item.createdAt === 'string'
                ? new Date(item.createdAt).toLocaleString('id-ID', {
                    day: 'numeric',
                    month: 'short',
                    year: 'numeric',
                    hour: '2-digit',
                    minute: '2-digit',
                  })
                : item.createdAt.toLocaleString('id-ID', {
                    day: 'numeric',
                    month: 'short',
                    year: 'numeric',
                    hour: '2-digit',
                    minute: '2-digit',
                  });

            return (
              <div
                key={item.id}
                className={`p-4 transition-colors hover:bg-surface-muted/50 ${
                  !item.isRead ? 'bg-brand-light-blue/5' : ''
                }`}
              >
                <div className="flex items-start justify-between gap-4">
                  <div className="flex items-start gap-3 min-w-0">
                    <span
                      className={`mt-1 h-2.5 w-2.5 shrink-0 rounded-full ${
                        !item.isRead ? 'bg-brand-orange' : 'bg-transparent'
                      }`}
                    />
                    <div>
                      <div className="flex flex-wrap items-center gap-2">
                        <h2 className="text-sm font-bold text-heading">{item.title}</h2>
                        <span className="text-[11px] text-gray-400">• {dateStr}</span>
                      </div>
                      <p className="mt-1 text-xs text-gray-600 leading-relaxed whitespace-pre-line">
                        {item.body}
                      </p>
                      {item.link && (
                        <Link
                          href={item.link}
                          className="mt-2 inline-flex items-center gap-1 text-xs font-semibold text-teal-text hover:underline"
                        >
                          Buka detail tautan <ExternalLink className="h-3 w-3" />
                        </Link>
                      )}
                    </div>
                  </div>

                  {!item.isRead && (
                    <button
                      type="button"
                      onClick={() => handleMarkOne(item.id)}
                      disabled={isPending}
                      className="inline-flex shrink-0 items-center gap-1 rounded-md border border-line px-2.5 py-1 text-xs text-gray-600 hover:border-teal-text hover:text-teal-text transition"
                    >
                      <Check className="h-3 w-3" /> Tandai Dibaca
                    </button>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
