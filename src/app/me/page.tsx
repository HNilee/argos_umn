import { and, count, eq } from 'drizzle-orm';
import {
  AlertCircle,
  Calendar,
  CheckCircle2,
  Clock,
  ExternalLink,
  FolderGit2,
  Lightbulb,
  User,
} from 'lucide-react';
import Link from 'next/link';
import { db } from '@/db';
import {
  members,
  notifications,
  projectMembers,
  projectProposals,
  projectTimelineItems,
  projects,
  timelineRequests,
} from '@/db/schema';
import { todayInJakarta } from '@/lib/access';
import { requireMember } from '@/lib/auth';
import { getTimelineForMember } from '@/lib/queries';

export const metadata = { title: 'Dashboard Member' };

export default async function MemberDashboardPage() {
  const user = await requireMember();
  const today = todayInJakarta();

  // Fetch Member Details
  const [member] = await db.select().from(members).where(eq(members.id, user.memberId));

  // Fetch Member's Projects & Timelines
  const memberProjects = await getTimelineForMember(user.memberId);

  // Collect all timeline items from member's projects
  const allItems = memberProjects.flatMap((p) =>
    p.items.map((i) => ({ ...i, projectName: p.name, projectSlug: p.slug })),
  );

  const doneItems = allItems.filter((i) => i.status === 'done');
  const pendingItems = allItems.filter((i) => i.status !== 'done');
  const overdueItems = pendingItems.filter((i) => i.endDate < today);

  // Fetch stats for proposals & unread notifications
  const [[proposalsCount], [unreadCount], [pendingRequestsCount]] = await Promise.all([
    db
      .select({ n: count() })
      .from(projectProposals)
      .where(eq(projectProposals.memberId, user.memberId)),
    db
      .select({ n: count() })
      .from(notifications)
      .where(and(eq(notifications.recipientAccountId, user.accountId), eq(notifications.isRead, false))),
    db
      .select({ n: count() })
      .from(timelineRequests)
      .where(and(eq(timelineRequests.memberId, user.memberId), eq(timelineRequests.status, 'pending'))),
  ]);

  return (
    <div className="mx-auto flex max-w-6xl flex-col gap-6 font-sans">
      {/* Welcome Banner styled like Image 1 */}
      <div className="flex flex-wrap items-center justify-between gap-4 rounded-md border border-line bg-surface p-6 shadow-xs">
        <div>
          <div className="flex items-center gap-2">
            <span className="rounded-xs bg-teal-solid/15 px-2.5 py-0.5 text-xs font-bold text-teal-text">
              Member Workspace
            </span>
            <span className="text-xs text-gray-400">•</span>
            <span className="text-xs text-gray-500">{today}</span>
          </div>
          <h1 className="mt-1 text-2xl font-bold tracking-tight text-heading">
            Halo, {member?.fullName ?? user.username}!
          </h1>
          <p className="mt-0.5 text-xs text-gray-500">
            Pantau roadmap deadline project, ajukan eskalasi perpanjangan, dan kelola kontribusi Anda.
          </p>
        </div>

        <div className="flex items-center gap-2">
          <Link
            href="/me/timeline"
            className="inline-flex items-center gap-1.5 rounded-sm bg-teal-solid px-4 py-2 text-xs font-semibold text-white shadow-xs hover:bg-teal-solid-hover transition"
          >
            <Calendar className="h-3.5 w-3.5" /> Buka Timeline
          </Link>
          <Link
            href="/me/proposals"
            className="inline-flex items-center gap-1.5 rounded-sm border border-line bg-surface px-4 py-2 text-xs font-semibold text-ink hover:bg-surface-muted transition"
          >
            <Lightbulb className="h-3.5 w-3.5" /> Usulan Baru
          </Link>
        </div>
      </div>

      {/* KPI / Overview Metric Cards */}
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        {/* Active Projects */}
        <div className="rounded-md border border-line bg-surface p-5 shadow-xs">
          <div className="flex items-center justify-between">
            <span className="text-xs font-bold text-gray-500 uppercase tracking-wider">
              Project Saya
            </span>
            <span className="rounded-sm bg-teal-solid/15 p-2 text-teal-text">
              <FolderGit2 className="h-4 w-4" />
            </span>
          </div>
          <div className="mt-3 flex items-baseline gap-2">
            <span className="text-3xl font-bold text-heading">{memberProjects.length}</span>
            <span className="text-xs text-gray-500">project terdaftar</span>
          </div>
          <div className="mt-3 border-t border-line/60 pt-2 text-xs text-gray-500">
            <Link href="/me/projects" className="text-teal-text hover:underline font-semibold">
              Lihat semua project →
            </Link>
          </div>
        </div>

        {/* Timeline Milestones */}
        <div className="rounded-md border border-line bg-surface p-5 shadow-xs">
          <div className="flex items-center justify-between">
            <span className="text-xs font-bold text-gray-500 uppercase tracking-wider">
              Milestone Selesai
            </span>
            <span className="rounded-sm bg-emerald-100 p-2 text-emerald-700">
              <CheckCircle2 className="h-4 w-4" />
            </span>
          </div>
          <div className="mt-3 flex items-baseline gap-2">
            <span className="text-3xl font-bold text-heading">{doneItems.length}</span>
            <span className="text-xs text-gray-500">dari {allItems.length} tahapan</span>
          </div>
          <div className="mt-3 border-t border-line/60 pt-2 text-xs text-gray-500">
            <Link href="/me/timeline" className="text-teal-text hover:underline font-semibold">
              Buka grafik timeline →
            </Link>
          </div>
        </div>

        {/* Overdue / Need Extension */}
        <div className="rounded-md border border-line bg-surface p-5 shadow-xs">
          <div className="flex items-center justify-between">
            <span className="text-xs font-bold text-gray-500 uppercase tracking-wider">
              Deadline Terlewat
            </span>
            <span
              className={`rounded-sm p-2 ${
                overdueItems.length > 0
                  ? 'bg-red-100 text-danger animate-pulse'
                  : 'bg-surface-muted text-gray-400'
              }`}
            >
              <AlertCircle className="h-4 w-4" />
            </span>
          </div>
          <div className="mt-3 flex items-baseline gap-2">
            <span
              className={`text-3xl font-bold ${
                overdueItems.length > 0 ? 'text-danger' : 'text-heading'
              }`}
            >
              {overdueItems.length}
            </span>
            <span className="text-xs text-gray-500">tahap butuh eskalasi</span>
          </div>
          <div className="mt-3 border-t border-line/60 pt-2 text-xs text-gray-500">
            {overdueItems.length > 0 ? (
              <span className="font-bold text-danger">Segera ajukan perpanjangan</span>
            ) : (
              <span className="text-emerald-700 font-semibold">Semua deadline on-track</span>
            )}
          </div>
        </div>

        {/* Notifications & Requests */}
        <div className="rounded-md border border-line bg-surface p-5 shadow-xs">
          <div className="flex items-center justify-between">
            <span className="text-xs font-bold text-gray-500 uppercase tracking-wider">
              Notifikasi
            </span>
            <span className="rounded-sm bg-brand-orange/15 p-2 text-orange-text">
              <Clock className="h-4 w-4" />
            </span>
          </div>
          <div className="mt-3 flex items-baseline gap-2">
            <span className="text-3xl font-bold text-heading">{unreadCount.n}</span>
            <span className="text-xs text-gray-500">belum dibaca</span>
          </div>
          <div className="mt-3 border-t border-line/60 pt-2 text-xs text-gray-500">
            <Link href="/me/notifications" className="text-teal-text hover:underline font-semibold">
              Lihat kotak masuk →
            </Link>
          </div>
        </div>
      </div>

      {/* Main Grid: Upcoming Deadlines & Project List */}
      <div className="grid gap-6 lg:grid-cols-3">
        {/* Left Column (2 cols): Upcoming & Overdue Deadlines */}
        <div className="lg:col-span-2 flex flex-col gap-4">
          <div className="rounded-md border border-line bg-surface p-5 shadow-xs">
            <div className="flex items-center justify-between border-b border-line pb-3">
              <div>
                <h2 className="text-base font-bold text-heading">Agenda & Deadline Terdekat</h2>
                <p className="text-xs text-gray-500">Tahapan milestone dalam project yang Anda ikuti</p>
              </div>
              <Link
                href="/me/timeline"
                className="text-xs font-bold text-teal-text hover:underline"
              >
                Lihat di Timeline →
              </Link>
            </div>

            <div className="mt-4 divide-y divide-line/60">
              {pendingItems.length === 0 ? (
                <div className="py-8 text-center text-xs text-gray-500">
                  Semua tahapan timeline saat ini telah diselesaikan.
                </div>
              ) : (
                pendingItems.slice(0, 5).map((item) => {
                  const isOverdue = item.endDate < today;
                  return (
                    <div
                      key={item.id}
                      className="flex items-center justify-between py-3 transition hover:bg-surface-muted/40 px-2 rounded-sm"
                    >
                      <div className="min-w-0 pr-3">
                        <div className="flex items-center gap-2">
                          <span className="text-xs font-bold text-heading truncate">{item.title}</span>
                          {isOverdue && (
                            <span className="rounded-xs bg-red-100 text-danger px-1.5 py-0.5 text-[10px] font-bold">
                              Terlambat
                            </span>
                          )}
                        </div>
                        <p className="text-[11px] text-gray-500 mt-0.5 truncate">
                          Project: <span className="font-semibold text-gray-700">{item.projectName}</span> •{' '}
                          Deadline: {item.endDate}
                        </p>
                      </div>

                      <div className="shrink-0">
                        {isOverdue ? (
                          <Link
                            href="/me/timeline"
                            className="rounded-sm bg-brand-orange px-2.5 py-1 text-xs font-bold text-ink shadow-xs hover:bg-amber-400 transition"
                          >
                            Minta Perpanjangan
                          </Link>
                        ) : (
                          <span className="text-xs text-gray-400 font-semibold">On Track</span>
                        )}
                      </div>
                    </div>
                  );
                })
              )}
            </div>
          </div>
        </div>

        {/* Right Column: Member's Projects List */}
        <div className="flex flex-col gap-4">
          <div className="rounded-md border border-line bg-surface p-5 shadow-xs">
            <div className="flex items-center justify-between border-b border-line pb-3">
              <h2 className="text-base font-bold text-heading">Project Saya</h2>
              <Link href="/me/projects" className="text-xs font-bold text-teal-text hover:underline">
                Kelola →
              </Link>
            </div>

            <div className="mt-4 flex flex-col gap-3">
              {memberProjects.length === 0 ? (
                <p className="py-4 text-center text-xs text-gray-500">
                  Anda belum tergabung dalam project manapun.
                </p>
              ) : (
                memberProjects.map((p) => {
                  const completedCount = p.items.filter((i) => i.status === 'done').length;
                  return (
                    <div
                      key={p.id}
                      className="rounded-sm border border-line/70 p-3 hover:border-teal-solid transition bg-surface-muted/20"
                    >
                      <div className="flex items-center justify-between">
                        <Link
                          href={`/me/projects/${p.slug}`}
                          className="font-bold text-heading text-xs hover:text-teal-text transition truncate max-w-[180px]"
                        >
                          {p.name}
                        </Link>
                        <span className="rounded-xs bg-teal-solid/10 px-1.5 py-0.5 text-[10px] font-bold text-teal-text uppercase">
                          {p.status}
                        </span>
                      </div>
                      <div className="mt-2 flex items-center justify-between text-[11px] text-gray-500">
                        <span>
                          {completedCount}/{p.items.length} milestone
                        </span>
                        <Link
                          href="/me/timeline"
                          className="font-semibold text-teal-text hover:underline"
                        >
                          Roadmap →
                        </Link>
                      </div>
                    </div>
                  );
                })
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
