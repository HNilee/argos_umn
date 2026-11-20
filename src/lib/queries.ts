import 'server-only';
import { and, asc, desc, eq, ilike, inArray, or, sql } from 'drizzle-orm';
import { alias } from 'drizzle-orm/pg-core';
import { db } from '@/db';
import {
  activities,
  activityMembers,
  carouselSlides,
  media,
  memberPositions,
  members,
  positions,
  projectMembers,
  projectTimelineItems,
  projects,
  siteContent,
  notifications,
  type ProjectStatus,
} from '@/db/schema';
import { type AboutContent, DEFAULT_ABOUT } from './about-defaults';
import { isPositionActive, todayInJakarta } from './access';

const coverMedia = alias(media, 'cover_media');
const logoMedia = alias(media, 'logo_media');

export async function getAbout(): Promise<AboutContent> {
  const [row] = await db.select().from(siteContent).where(eq(siteContent.key, 'about'));
  return { ...DEFAULT_ABOUT, ...((row?.value as Partial<AboutContent>) ?? {}) };
}

export async function getCarousel({ activeOnly = true } = {}) {
  return db
    .select({ slide: carouselSlides, storageKey: media.storageKey, altText: media.altText })
    .from(carouselSlides)
    .innerJoin(media, eq(media.id, carouselSlides.mediaId))
    .where(activeOnly ? eq(carouselSlides.isActive, true) : undefined)
    .orderBy(asc(carouselSlides.sortOrder));
}

type ProjectFilter = { status?: ProjectStatus; q?: string; limit?: number };

export async function listProjects({ status, q, limit }: ProjectFilter = {}) {
  const query = db
    .select({ project: projects, coverKey: coverMedia.storageKey, logoKey: logoMedia.storageKey })
    .from(projects)
    .leftJoin(coverMedia, and(eq(coverMedia.projectId, projects.id), eq(coverMedia.isCover, true)))
    .leftJoin(logoMedia, eq(logoMedia.id, projects.logoMediaId))
    .where(
      and(
        eq(projects.isPublished, true),
        status ? eq(projects.status, status) : undefined,
        q ? ilike(projects.name, `%${q}%`) : undefined,
      ),
    )
    .orderBy(desc(projects.publishedAt));
  return limit ? query.limit(limit) : query;
}

export async function listActivities({ q, limit }: { q?: string; limit?: number } = {}) {
  const query = db
    .select({ activity: activities, coverKey: coverMedia.storageKey, logoKey: logoMedia.storageKey })
    .from(activities)
    .leftJoin(coverMedia, and(eq(coverMedia.activityId, activities.id), eq(coverMedia.isCover, true)))
    .leftJoin(logoMedia, eq(logoMedia.id, activities.logoMediaId))
    .where(and(eq(activities.isPublished, true), q ? ilike(activities.name, `%${q}%`) : undefined))
    .orderBy(desc(activities.activityDate));
  return limit ? query.limit(limit) : query;
}

export async function ownerMedia(owner: { project?: string; activity?: string }) {
  return db
    .select()
    .from(media)
    .where(
      and(
        eq(media.purpose, 'gallery'),
        owner.project ? eq(media.projectId, owner.project) : eq(media.activityId, owner.activity!),
      ),
    )
    .orderBy(desc(media.isCover), asc(media.sortOrder));
}

export async function mediaKey(id: string | null) {
  if (!id) return null;
  const [row] = await db.select({ storageKey: media.storageKey }).from(media).where(eq(media.id, id));
  return row?.storageKey ?? null;
}

const memberCard = {
  id: members.id,
  slug: members.slug,
  fullName: members.fullName,
  major: members.major,
  cohort: members.cohort,
  status: members.status,
  showPhoto: members.showPhoto,
  showMajor: members.showMajor,
  showCohort: members.showCohort,
  showPositions: members.showPositions,
  photoKey: media.storageKey,
};

export async function participants(table: 'project' | 'activity', id: string) {
  const join = table === 'project' ? projectMembers : activityMembers;
  const rows = await db
    .select(memberCard)
    .from(members)
    .innerJoin(
      join,
      and(eq(join.memberId, members.id), table === 'project' ? eq(projectMembers.projectId, id) : eq(activityMembers.activityId, id)),
    )
    .leftJoin(media, eq(media.id, members.photoMediaId))
    .orderBy(asc(members.fullName));
  return rows;
}

export type PublicPosition = { name: string; startDate: string; endDate: string | null };

export async function positionsFor(memberIds: string[]) {
  const map = new Map<string, PublicPosition[]>();
  if (memberIds.length === 0) return map;
  const rows = await db
    .select({
      memberId: memberPositions.memberId,
      name: positions.name,
      startDate: memberPositions.startDate,
      endDate: memberPositions.endDate,
      sortOrder: positions.sortOrder,
    })
    .from(memberPositions)
    .innerJoin(positions, eq(positions.id, memberPositions.positionId))
    .where(inArray(memberPositions.memberId, memberIds))
    .orderBy(desc(memberPositions.startDate), asc(positions.sortOrder));
  for (const row of rows) map.set(row.memberId, [...(map.get(row.memberId) ?? []), row]);
  return map;
}

/** Posisi yang ditampilkan di kartu: yang berlaku saat ini, atau yang terakhir. */
export function latestPosition(list: PublicPosition[] = []) {
  const today = todayInJakarta();
  return list.find((p) => isPositionActive(p, today)) ?? list[0] ?? null;
}

export async function listMembers(status: 'onboarded' | 'offboarded', q?: string, cohort?: number) {
  const rows = await db
    .select(memberCard)
    .from(members)
    .leftJoin(media, eq(media.id, members.photoMediaId))
    .where(
      and(
        eq(members.status, status),
        q ? ilike(members.fullName, `%${q}%`) : undefined,
        cohort ? and(eq(members.cohort, cohort), eq(members.showCohort, true)) : undefined,
      ),
    )
    .orderBy(asc(members.fullName));
  return rows;
}

export async function memberCounts() {
  const rows = await db.select({ status: members.status, n: sql<number>`count(*)::int` }).from(members).groupBy(members.status);
  return {
    onboarded: rows.find((r) => r.status === 'onboarded')?.n ?? 0,
    offboarded: rows.find((r) => r.status === 'offboarded')?.n ?? 0,
  };
}

export async function publicCohorts() {
  const rows = await db
    .selectDistinct({ cohort: members.cohort })
    .from(members)
    .where(and(eq(members.showCohort, true), sql`${members.cohort} is not null`))
    .orderBy(desc(members.cohort));
  return rows.map((r) => r.cohort!);
}

export async function memberInvolvement(memberId: string, { publishedOnly = true } = {}) {
  const [projectRows, activityRows] = await Promise.all([
    db
      .select({ id: projects.id, slug: projects.slug, name: projects.name, status: projects.status, coverKey: coverMedia.storageKey })
      .from(projectMembers)
      .innerJoin(projects, eq(projects.id, projectMembers.projectId))
      .leftJoin(coverMedia, and(eq(coverMedia.projectId, projects.id), eq(coverMedia.isCover, true)))
      .where(and(eq(projectMembers.memberId, memberId), publishedOnly ? eq(projects.isPublished, true) : undefined))
      .orderBy(asc(projects.name)),
    db
      .select({ id: activities.id, slug: activities.slug, name: activities.name, activityDate: activities.activityDate, coverKey: coverMedia.storageKey })
      .from(activityMembers)
      .innerJoin(activities, eq(activities.id, activityMembers.activityId))
      .leftJoin(coverMedia, and(eq(coverMedia.activityId, activities.id), eq(coverMedia.isCover, true)))
      .where(and(eq(activityMembers.memberId, memberId), publishedOnly ? eq(activities.isPublished, true) : undefined))
      .orderBy(desc(activities.activityDate)),
  ]);
  return { projects: projectRows, activities: activityRows };
}

// Tanggal kejadian: tanggal aktivitas, atau tanggal upload untuk media project.
const galleryDate = sql<string>`coalesce(${activities.activityDate}, (${media.createdAt} at time zone 'Asia/Jakarta')::date)`;
const galleryPublished = or(eq(projects.isPublished, true), eq(activities.isPublished, true));

export async function galleryItems(filter: 'all' | 'project' | 'activity', limit: number, period: { year?: number; month?: number } = {}) {
  const rows = await db
    .select({
      media,
      date: sql<string>`to_char(${galleryDate}, 'YYYY-MM-DD')`,
      projectName: projects.name,
      projectSlug: projects.slug,
      activityName: activities.name,
      activitySlug: activities.slug,
    })
    .from(media)
    .leftJoin(projects, eq(projects.id, media.projectId))
    .leftJoin(activities, eq(activities.id, media.activityId))
    .where(
      and(
        eq(media.purpose, 'gallery'),
        filter === 'project'
          ? eq(projects.isPublished, true)
          : filter === 'activity'
            ? eq(activities.isPublished, true)
            : galleryPublished,
        period.year ? sql`extract(year from ${galleryDate}) = ${period.year}` : undefined,
        period.month ? sql`extract(month from ${galleryDate}) = ${period.month}` : undefined,
      ),
    )
    .orderBy(desc(galleryDate), asc(media.sortOrder))
    .limit(limit + 1);
  return { items: rows.slice(0, limit), hasMore: rows.length > limit };
}

/** Pasangan tahun dan bulan yang punya media, untuk mengisi filter. */
export async function galleryPeriods() {
  const rows = await db
    .selectDistinct({
      year: sql<number>`extract(year from ${galleryDate})::int`,
      month: sql<number>`extract(month from ${galleryDate})::int`,
    })
    .from(media)
    .leftJoin(projects, eq(projects.id, media.projectId))
    .leftJoin(activities, eq(activities.id, media.activityId))
    .where(and(eq(media.purpose, 'gallery'), galleryPublished));
  return rows;
}

export async function homeStats() {
  const [row] = await db.execute<{ projects: number; activities: number; members: number; media: number }>(sql`
    select
      (select count(*)::int from projects where is_published) as projects,
      (select count(*)::int from activities where is_published) as activities,
      (select count(*)::int from members where status = 'onboarded') as members,
      (select count(*)::int from media where purpose = 'gallery') as media
  `);
  return row;
}

/** Publik tidak pernah menerima deskripsi tahap, jadi kolomnya tidak dipilih sama sekali. */
export async function projectTimeline(projectId: string, { withDescription = false } = {}) {
  const rows = await db
    .select({
      id: projectTimelineItems.id,
      title: projectTimelineItems.title,
      startDate: projectTimelineItems.startDate,
      endDate: projectTimelineItems.endDate,
      status: projectTimelineItems.status,
      completedAt: projectTimelineItems.completedAt,
      ...(withDescription ? { description: projectTimelineItems.description } : {}),
    })
    .from(projectTimelineItems)
    .where(eq(projectTimelineItems.projectId, projectId))
    .orderBy(asc(projectTimelineItems.sortOrder), asc(projectTimelineItems.startDate));
  return rows as (TimelineEntry & { description?: string })[];
}

export type TimelineEntry = { id: string; title: string; startDate: string; endDate: string; status: 'not_yet' | 'done'; completedAt: string | null };

export type GanttTimelineItem = {
  id: string;
  projectId: string;
  title: string;
  description: string;
  startDate: string;
  endDate: string;
  status: 'not_yet' | 'done';
  completedAt: string | null;
  sortOrder: number;
};

export type GanttProjectMember = {
  id: string;
  fullName: string;
  slug: string;
  photoKey: string | null;
};

export type GanttProject = {
  id: string;
  name: string;
  slug: string;
  status: ProjectStatus;
  isPublished: boolean;
  coverKey: string | null;
  members: GanttProjectMember[];
  items: GanttTimelineItem[];
};

export async function fetchGanttProjects(projectIds?: string[]): Promise<GanttProject[]> {
  if (projectIds && projectIds.length === 0) return [];

  const projectRows = await db
    .select({
      id: projects.id,
      name: projects.name,
      slug: projects.slug,
      status: projects.status,
      isPublished: projects.isPublished,
      coverKey: coverMedia.storageKey,
    })
    .from(projects)
    .leftJoin(coverMedia, and(eq(coverMedia.projectId, projects.id), eq(coverMedia.isCover, true)))
    .where(projectIds ? inArray(projects.id, projectIds) : undefined)
    .orderBy(desc(projects.createdAt));

  if (projectRows.length === 0) return [];

  const foundIds = projectRows.map((p) => p.id);

  const [itemRows, memberRows] = await Promise.all([
    db
      .select({
        id: projectTimelineItems.id,
        projectId: projectTimelineItems.projectId,
        title: projectTimelineItems.title,
        description: projectTimelineItems.description,
        startDate: projectTimelineItems.startDate,
        endDate: projectTimelineItems.endDate,
        status: projectTimelineItems.status,
        completedAt: projectTimelineItems.completedAt,
        sortOrder: projectTimelineItems.sortOrder,
      })
      .from(projectTimelineItems)
      .where(inArray(projectTimelineItems.projectId, foundIds))
      .orderBy(asc(projectTimelineItems.sortOrder), asc(projectTimelineItems.startDate)),
    db
      .select({
        projectId: projectMembers.projectId,
        id: members.id,
        fullName: members.fullName,
        slug: members.slug,
        photoKey: media.storageKey,
      })
      .from(projectMembers)
      .innerJoin(members, eq(members.id, projectMembers.memberId))
      .leftJoin(media, eq(media.id, members.photoMediaId))
      .where(inArray(projectMembers.projectId, foundIds))
      .orderBy(asc(members.fullName)),
  ]);

  const itemsByProject = new Map<string, GanttTimelineItem[]>();
  for (const item of itemRows) {
    const list = itemsByProject.get(item.projectId) ?? [];
    list.push(item);
    itemsByProject.set(item.projectId, list);
  }

  const membersByProject = new Map<string, GanttProjectMember[]>();
  for (const m of memberRows) {
    const list = membersByProject.get(m.projectId) ?? [];
    list.push({ id: m.id, fullName: m.fullName, slug: m.slug, photoKey: m.photoKey });
    membersByProject.set(m.projectId, list);
  }

  const today = todayInJakarta();
  const addDaysIso = (dStr: string, n: number) => {
    const [y, m, d] = dStr.split('-').map(Number);
    const date = new Date(Date.UTC(y, m - 1, d + n));
    return date.toISOString().split('T')[0];
  };

  return projectRows.map((p) => {
    const existingItems = itemsByProject.get(p.id) ?? [];
    const items =
      existingItems.length > 0
        ? existingItems
        : [
            {
              id: `auto-${p.id}-1`,
              projectId: p.id,
              title: 'Perencanaan & Riset Awal',
              description: 'Penyusunan target luaran dan perancangan awal.',
              startDate: today,
              endDate: addDaysIso(today, 14),
              status: 'not_yet' as const,
              completedAt: null,
              sortOrder: 1,
            },
            {
              id: `auto-${p.id}-2`,
              projectId: p.id,
              title: 'Pengembangan & Implementasi',
              description: 'Pengerjaan sistem teknis dan integrasi modul.',
              startDate: addDaysIso(today, 15),
              endDate: addDaysIso(today, 38),
              status: 'not_yet' as const,
              completedAt: null,
              sortOrder: 2,
            },
            {
              id: `auto-${p.id}-3`,
              projectId: p.id,
              title: 'Uji Coba & Finalisasi',
              description: 'Uji coba performa dan rilis.',
              startDate: addDaysIso(today, 39),
              endDate: addDaysIso(today, 60),
              status: 'not_yet' as const,
              completedAt: null,
              sortOrder: 3,
            },
          ];

    return {
      ...p,
      items,
      members: membersByProject.get(p.id) ?? [],
    };
  });
}

export async function getTimelineForAdmin({ projectId }: { projectId?: string } = {}): Promise<GanttProject[]> {
  return fetchGanttProjects(projectId ? [projectId] : undefined);
}

export async function getTimelineForMember(memberId: string, { projectId }: { projectId?: string } = {}): Promise<GanttProject[]> {
  const memberProj = await db
    .select({ projectId: projectMembers.projectId })
    .from(projectMembers)
    .where(and(eq(projectMembers.memberId, memberId), projectId ? eq(projectMembers.projectId, projectId) : undefined));

  const pids = memberProj.map((m) => m.projectId);
  return fetchGanttProjects(pids);
}

export async function getNotifications(accountId: string, limit = 20) {
  return db
    .select()
    .from(notifications)
    .where(eq(notifications.recipientAccountId, accountId))
    .orderBy(desc(notifications.createdAt))
    .limit(limit);
}

export async function countUnreadNotifications(accountId: string): Promise<number> {
  const [row] = await db
    .select({ count: sql<number>`count(*)::int` })
    .from(notifications)
    .where(and(eq(notifications.recipientAccountId, accountId), eq(notifications.isRead, false)));
  return row?.count ?? 0;
}
