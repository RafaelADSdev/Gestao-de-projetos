import { DEADLINE_REMINDER_DAYS, RENEWAL_REMINDER_DAYS } from "./constants";
import { differenceInCalendarDays, type ClockValue } from "./dates";
import type { Deadline, Project, Subscription } from "./types";

export type DeadlineTiming =
  | "completed"
  | "canceled"
  | "overdue"
  | "due-today"
  | "due-soon"
  | "scheduled";

export interface DeadlineHealth {
  timing: DeadlineTiming;
  daysUntilDue: number;
  actionable: boolean;
  overdue: boolean;
  dueWithinWindow: boolean;
}

export function getDeadlineHealth(
  deadline: Deadline,
  now: ClockValue = new Date(),
  dueSoonWindowDays = 7,
): DeadlineHealth {
  const daysUntilDue = differenceInCalendarDays(deadline.dueDate, now);

  if (deadline.state === "completed") {
    return {
      timing: "completed",
      daysUntilDue,
      actionable: false,
      overdue: false,
      dueWithinWindow: false,
    };
  }

  if (deadline.state === "canceled") {
    return {
      timing: "canceled",
      daysUntilDue,
      actionable: false,
      overdue: false,
      dueWithinWindow: false,
    };
  }

  const timing: DeadlineTiming =
    daysUntilDue < 0
      ? "overdue"
      : daysUntilDue === 0
        ? "due-today"
        : daysUntilDue <= dueSoonWindowDays
          ? "due-soon"
          : "scheduled";

  return {
    timing,
    daysUntilDue,
    actionable: true,
    overdue: daysUntilDue < 0,
    dueWithinWindow: daysUntilDue >= 0 && daysUntilDue <= dueSoonWindowDays,
  };
}

export function getActionableDeadlines(
  deadlines: readonly Deadline[],
  projectId?: string,
): Deadline[] {
  return deadlines
    .filter(
      (deadline) =>
        deadline.state === "open" && (projectId === undefined || deadline.projectId === projectId),
    )
    .sort((left, right) => {
      const dateOrder = left.dueDate.localeCompare(right.dueDate);
      if (dateOrder !== 0) return dateOrder;
      return (left.dueTime ?? "00:00").localeCompare(right.dueTime ?? "00:00");
    });
}

/** Includes overdue work because it is the next deadline requiring attention. */
export function getNextDeadline(
  projectId: string,
  deadlines: readonly Deadline[],
): Deadline | null {
  return getActionableDeadlines(deadlines, projectId)[0] ?? null;
}

export type ProjectHealthStatus =
  | "overdue"
  | "blocked"
  | "due-soon"
  | "on-track"
  | "completed"
  | "unscheduled"
  | "archived";

export interface ProjectHealth {
  status: ProjectHealthStatus;
  isBlocked: boolean;
  hasOverdueDeadline: boolean;
  hasDeadlineDueSoon: boolean;
  nextDeadline: Deadline | null;
  daysUntilNextDeadline: number | null;
}

export function getProjectHealth(
  project: Project,
  deadlines: readonly Deadline[],
  now: ClockValue = new Date(),
  dueSoonWindowDays = 7,
): ProjectHealth {
  const actionable = getActionableDeadlines(deadlines, project.id);
  const deadlineHealth = actionable.map((deadline) => getDeadlineHealth(deadline, now, dueSoonWindowDays));
  const nextDeadline = actionable[0] ?? null;
  const daysUntilNextDeadline = nextDeadline
    ? differenceInCalendarDays(nextDeadline.dueDate, now)
    : null;
  const hasOverdueDeadline = deadlineHealth.some((health) => health.overdue);
  const hasDeadlineDueSoon = deadlineHealth.some((health) => health.dueWithinWindow);

  let status: ProjectHealthStatus;
  if (project.archivedAt !== null) status = "archived";
  else if (hasOverdueDeadline) status = "overdue";
  else if (project.blocked) status = "blocked";
  else if (hasDeadlineDueSoon) status = "due-soon";
  else if (project.stageId === "publicado") status = "completed";
  else if (actionable.length === 0 && project.stageId !== "manutencao") status = "unscheduled";
  else status = "on-track";

  return {
    status,
    isBlocked: project.blocked,
    hasOverdueDeadline,
    hasDeadlineDueSoon,
    nextDeadline,
    daysUntilNextDeadline,
  };
}

export type RenewalTiming =
  | "inactive"
  | "overdue"
  | "due-today"
  | "due-soon"
  | "scheduled";

export interface RenewalHealth {
  timing: RenewalTiming;
  daysUntilRenewal: number;
  dueWithinWindow: boolean;
}

export function getRenewalHealth(
  subscription: Subscription,
  now: ClockValue = new Date(),
  dueSoonWindowDays = 30,
): RenewalHealth {
  const daysUntilRenewal = differenceInCalendarDays(subscription.renewalDate, now);
  if (subscription.status !== "active") {
    return { timing: "inactive", daysUntilRenewal, dueWithinWindow: false };
  }

  const timing: RenewalTiming =
    daysUntilRenewal < 0
      ? "overdue"
      : daysUntilRenewal === 0
        ? "due-today"
        : daysUntilRenewal <= dueSoonWindowDays
          ? "due-soon"
          : "scheduled";

  return {
    timing,
    daysUntilRenewal,
    dueWithinWindow: daysUntilRenewal >= 0 && daysUntilRenewal <= dueSoonWindowDays,
  };
}

export function getUpcomingRenewals(
  subscriptions: readonly Subscription[],
  now: ClockValue = new Date(),
  windowDays = 30,
): Subscription[] {
  return subscriptions
    .filter((subscription) => getRenewalHealth(subscription, now, windowDays).dueWithinWindow)
    .sort((left, right) => left.renewalDate.localeCompare(right.renewalDate));
}

export function shouldSendDeadlineReminder(deadline: Deadline, now: ClockValue): boolean {
  return (
    deadline.state === "open" &&
    DEADLINE_REMINDER_DAYS.includes(
      differenceInCalendarDays(deadline.dueDate, now) as (typeof DEADLINE_REMINDER_DAYS)[number],
    )
  );
}

export function shouldSendRenewalReminder(subscription: Subscription, now: ClockValue): boolean {
  return (
    subscription.status === "active" &&
    RENEWAL_REMINDER_DAYS.includes(
      differenceInCalendarDays(subscription.renewalDate, now) as (typeof RENEWAL_REMINDER_DAYS)[number],
    )
  );
}

