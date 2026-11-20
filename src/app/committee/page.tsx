import { count, eq } from 'drizzle-orm';
import {
  AlertCircle,
  Calendar,
  CheckCircle2,
  Clock,
  ExternalLink,
  FolderGit2,
  Layers,
  Sparkles,
} from 'lucide-react';
import Link from 'next/link';
import { getTranslations } from 'next-intl/server';
import { AuditTable } from '@/components/audit-table';
import { db } from '@/db';
import {
  activities,
  involvementRequests,
  projectProposals,
  projectTimelineItems,
  projects,
  timelineRequests,
} from '@/db/schema';
import { requireCommittee } from '@/lib/auth';
import { getTimelineForAdmin } from '@/lib/queries';
import { todayInJakarta } from '@/lib/access';

export const metadata = { title: 'Committee Dashboard' };

export default async function CommitteeDashboard() {
  await requireCommittee();
  const t = await getTranslations('committee');
  const today = todayInJakarta();

  const [
    [requests],
    [timelineRequestCount],
    [proposalCount],
    [draftProjects],
    [draftActivities],
    [activeProjectsCount],
    allProjectsTimeline,
  ] = await Promise.all([
    db.select({ n: count() }).from(involvementRequests).where(eq(involvementRequests.status, 'pending')),
    db.select({ n: count() }).from(timelineRequests).where(eq(timelineRequests.status, 'pending')),
    db.select({ n: count() }).from(projectProposals).where(eq(projectProposals.status, 'pending')),
    db.select({ n: count() }).from(projects).where(eq(projects.isPublished, false)),
    db.select({ n: count() }).from(activities).where(eq(activities.isPublished, false)),
    db.select({ n: count() }).from(projects).where(eq(projects.status, 'on_progress')),
    getTimelineForAdmin(),
  ]);

  const totalPendingRequests = requests.n + timelineRequestCount.n + proposalCount.n;

  // Flatten pending timeline items for timeline preview
  const upcomingDeadlines = allProjectsTimeline
    .flatMap((p) => p.items.map((i) => ({ ...i, projectName: p.name, projectId: p.id })))
    .filter((i) => i.status !== 'done')
    .sort((a, b) => a.endDate.localeCompare(b.endDate))
    .slice(0, 5);

  const tiles = [
    {
      href: '/committee/requests',
      label: t('pendingRequests'),
      value: totalPendingRequests,
      icon: Clock,
      highlight: totalPendingRequests > 0,
    },
    {
      href: '/committee/projects',
      label: t('draftProjects'),
      value: draftProjects.n,
      icon: FolderGit2,
    },
    {
      href: '/committee/activities',
      label: t('draftActivities'),
      value: draftActivities.n,
      icon: Layers,
    },
    {
      href: '/committee/timeline',
      label: 'Project On-Progress',
      value: activeProjectsCount.n,
      icon: Calendar,
    },
  ];

  return (
    <div className="mx-auto flex max-w-6xl flex-col gap-6 font-sans">
      {/* Top Banner inspired by Image 1 */}
      <div className="flex flex-wrap items-center justify-between gap-4 rounded-md border border-line bg-surface p-6 shadow-xs">
        <div>
          <div className="flex items-center gap-2">
            <span className="rounded-xs bg-teal-solid/15 px-2.5 py-0.5 text-xs font-bold text-teal-text">
              Committee Administration
            </span>
            <span className="text-xs text-gray-400">•</span>
            <span className="text-xs text-gray-500">{today}</span>
          </div>
          <h1 className="mt-1 text-2xl font-bold tracking-tight text-heading">
            {t('dashboard')}
          </h1>
          <p className="mt-0.5 text-xs text-gray-500">
            Monitoring timeline seluruh project klub, tinjau usulan & eskalasi deadline, dan kelola aktivitas.
          </p>
        </div>

        <div className="flex items-center gap-2">
          <Link
            href="/committee/timeline"
            className="inline-flex items-center gap-1.5 rounded-sm bg-teal-solid px-4 py-2 text-xs font-semibold text-white shadow-xs hover:bg-teal-solid-hover transition"
          >
            <Calendar className="h-3.5 w-3.5" /> Buka Multi-View Timeline
          </Link>
          <Link
            href="/committee/requests"
            className="inline-flex items-center gap-1.5 rounded-sm border border-line bg-surface px-4 py-2 text-xs font-semibold text-ink hover:bg-surface-muted transition"
          >
            <Clock className="h-3.5 w-3.5" /> Pengajuan ({totalPendingRequests})
          </Link>
        </div>
      </div>

      {/* KPI Tiles */}
      <ul className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        {tiles.map((tile) => {
          const Icon = tile.icon;
          return (
            <li key={tile.href}>
              <Link
                href={tile.href}
                className="group block rounded-md border border-line bg-surface p-5 shadow-xs transition hover:border-teal-solid hover:shadow-sm"
              >
                <div className="flex items-center justify-between">
                  <span className="text-xs font-bold text-gray-500 uppercase tracking-wider">
                    {tile.label}
                  </span>
                  <span
                    className={`rounded-sm p-2 ${
                      tile.highlight
                        ? 'bg-brand-orange/20 text-orange-text'
                        : 'bg-surface-muted text-gray-500 group-hover:text-teal-text'
                    }`}
                  >
                    <Icon className="h-4 w-4" />
                  </span>
                </div>
                <div className="mt-3 flex items-baseline gap-2">
                  <span className="text-3xl font-bold text-heading">{tile.value}</span>
                </div>
                <div className="mt-3 border-t border-line/60 pt-2 text-xs text-teal-text font-semibold group-hover:underline">
                  Buka kelola →
                </div>
              </Link>
            </li>
          );
        })}
      </ul>

      {/* Timeline Quick Preview & Deadlines */}
      <div className="rounded-md border border-line bg-surface p-5 shadow-xs">
        <div className="flex items-center justify-between border-b border-line pb-3">
          <div>
            <h2 className="text-base font-bold text-heading">Monitoring Deadline & Escalations Terdekat</h2>
            <p className="text-xs text-gray-500">
              Tahapan project yang sedang berjalan di club, pantau risiko keterlambatan
            </p>
          </div>
          <Link
            href="/committee/timeline"
            className="text-xs font-bold text-teal-text hover:underline"
          >
            Lihat Grid Timeline Lengkap →
          </Link>
        </div>

        <div className="mt-4 divide-y divide-line/60">
          {upcomingDeadlines.length === 0 ? (
            <div className="py-6 text-center text-xs text-gray-500">
              Tidak ada tahapan timeline yang tertunda saat ini.
            </div>
          ) : (
            upcomingDeadlines.map((item) => {
              const isOverdue = item.endDate < today;
              return (
                <div
                  key={item.id}
                  className="flex items-center justify-between py-3 transition hover:bg-surface-muted/30 px-2 rounded-sm"
                >
                  <div className="min-w-0 pr-4">
                    <div className="flex items-center gap-2">
                      <span className="text-xs font-bold text-heading truncate">{item.title}</span>
                      {isOverdue && (
                        <span className="rounded-xs bg-red-100 text-danger px-1.5 py-0.5 text-[10px] font-bold flex items-center gap-0.5">
                          <AlertCircle className="h-2.5 w-2.5" /> Terlambat
                        </span>
                      )}
                    </div>
                    <p className="text-[11px] text-gray-500 mt-0.5 truncate">
                      Project:{' '}
                      <Link
                        href={`/committee/timeline/${item.projectId}`}
                        className="font-semibold text-teal-text hover:underline"
                      >
                        {item.projectName}
                      </Link>{' '}
                      • Deadline: {item.endDate}
                    </p>
                  </div>

                  <div className="flex items-center gap-2 shrink-0">
                    <Link
                      href={`/committee/timeline/${item.projectId}`}
                      className="rounded-sm border border-line px-2.5 py-1 text-xs font-semibold text-ink hover:bg-surface-muted hover:border-teal-solid transition"
                    >
                      Detail Flow
                    </Link>
                  </div>
                </div>
              );
            })
          )}
        </div>
      </div>

      {/* Audit Activity Table */}
      <div className="flex flex-col gap-3">
        <div className="flex items-center justify-between">
          <h2 className="text-lg font-bold text-heading">{t('recent')}</h2>
          <Link href="/committee/audit" className="text-xs font-bold text-teal-text hover:underline">
            Lihat Semua Audit Log →
          </Link>
        </div>
        <AuditTable limit={8} />
      </div>
    </div>
  );
}
