'use client';

// src/components/admin/admin-notification-center.tsx
// Improved Admin Notification Center — drop-in replacement for the inlined
// notification bell + drawer inside admin-erp-client.tsx.
//
// Improvements over the previous inlined version:
//   1. Read-state persists in localStorage (survives browser restarts);
//      the legacy sessionStorage key is migrated automatically.
//   2. Stale read-ids are pruned against the live notification set
//      (no unbounded storage growth; resolved alerts naturally re-badge if they recur).
//   3. List is sorted unread-first, then by severity (danger → warning → info).
//   4. Opening a notification marks it as read automatically.
//   5. Optional visibility-gated auto-refresh polling so new alerts appear
//      without a manual refresh (default: every 60s while the tab is visible).
//   6. Filter chips with live counts, accessible bilingual labels.
// Design tokens only — no arbitrary hex in UI.

import * as React from 'react';
import { ArrowUpRight, Bell, CheckCheck } from 'lucide-react';
import { ResponsiveSheet } from '../ui/responsive-sheet';

export interface AdminNotificationItem {
  id: string;
  type: 'vendor_approval' | 'stock_alert' | 'order_alert' | 'address_alert';
  titleBn: string;
  titleEn: string;
  descBn: string;
  descEn: string;
  timestampBn: string;
  timestampEn: string;
  targetTab: string;
  targetQueue?: string;
  severity: 'info' | 'warning' | 'danger';
}

export type AdminNotificationLocale = 'bn' | 'en';

type NotificationFilterKey = 'all' | 'vendor_approval' | 'stock_alert' | 'order_alert';

export interface AdminNotificationCenterProps {
  locale: AdminNotificationLocale;
  /** Live notification list — the parent's existing allNotifications memo. */
  notifications: AdminNotificationItem[];
  /** Deep-link handler: the parent's existing queue/tab navigation switch. */
  onOpenNotification: (n: AdminNotificationItem) => void;
  /** Optional workspace refetch used by auto-refresh polling. */
  onRefresh?: () => void | Promise<void>;
  /** Auto-refresh interval in ms. 0 disables polling. Defaults to 60000. */
  pollIntervalMs?: number;
}

const STORAGE_KEY = 'bg_admin_read_notifications_v2';
const LEGACY_STORAGE_KEY = 'bg_admin_read_notifications';

function isNotificationItem(value: unknown): value is AdminNotificationItem {
  return Boolean(
    value &&
    typeof value === 'object' &&
    typeof (value as AdminNotificationItem).id === 'string' &&
    typeof (value as AdminNotificationItem).severity === 'string'
  );
}

function loadInitialReadIds(): string[] {
  if (typeof window === 'undefined') return [];
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (raw) {
      const parsed = JSON.parse(raw);
      if (Array.isArray(parsed)) return parsed.filter((v): v is string => typeof v === 'string');
    }
    // Migrate the legacy sessionStorage-backed read state once.
    const legacy = window.sessionStorage.getItem(LEGACY_STORAGE_KEY);
    if (legacy) {
      const parsed = JSON.parse(legacy);
      if (Array.isArray(parsed)) {
        return parsed.filter((v): v is string => typeof v === 'string');
      }
    }
  } catch {
    // Corrupt or quota-blocked storage — start fresh rather than crashing the panel.
  }
  return [];
}

const severityRank: Record<AdminNotificationItem['severity'], number> = {
  danger: 0,
  warning: 1,
  info: 2,
};

export function AdminNotificationCenter({
  locale,
  notifications,
  onOpenNotification,
  onRefresh,
  pollIntervalMs = 60_000,
}: AdminNotificationCenterProps) {
  const t = (bn: string, en: string) => (locale === 'bn' ? bn : en);

  const [isOpen, setIsOpen] = React.useState(false);
  const [filter, setFilter] = React.useState<NotificationFilterKey>('all');
  const [readIds, setReadIds] = React.useState<string[]>(loadInitialReadIds);

  // 1. Persist read-state in localStorage (durable across browser restarts).
  // 2. Prune ids that no longer correspond to a live notification so storage
  //    stays bounded and recurring queues (e.g. CALL_TO_CONFIRM) re-badge on reappearance.
  React.useEffect(() => {
    if (typeof window === 'undefined') return;
    const liveIds = new Set(notifications.map((n) => n.id));
    const pruned = readIds.filter((id) => liveIds.has(id));
    try {
      window.localStorage.setItem(STORAGE_KEY, JSON.stringify(pruned));
    } catch {
      // Ignore storage quota errors — read-state is best-effort.
    }
    if (pruned.length !== readIds.length) {
      setReadIds(pruned);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [notifications]);

  // Visibility-gated auto-refresh polling: new alerts appear without manual refresh.
  React.useEffect(() => {
    if (!onRefresh || pollIntervalMs === 0) return;
    const tick = () => {
      if (typeof document === 'undefined' || document.visibilityState === 'visible') {
        void onRefresh();
      }
    };
    const intervalId = window.setInterval(tick, pollIntervalMs);
    const onVisibilityChange = () => {
      if (document.visibilityState === 'visible') tick();
    };
    document.addEventListener('visibilitychange', onVisibilityChange);
    return () => {
      window.clearInterval(intervalId);
      document.removeEventListener('visibilitychange', onVisibilityChange);
    };
  }, [onRefresh, pollIntervalMs]);

  const readSet = React.useMemo(() => new Set(readIds), [readIds]);

  const unreadCount = React.useMemo(
    () => notifications.filter((n) => !readSet.has(n.id)).length,
    [notifications, readSet]
  );

  const hasUnreadDanger = React.useMemo(
    () => notifications.some((n) => n.severity === 'danger' && !readSet.has(n.id)),
    [notifications, readSet]
  );

  // Unread first, then severity (danger → warning → info), stable otherwise.
  const sortedNotifications = React.useMemo(() => {
    return [...notifications].sort((a, b) => {
      const aRead = readSet.has(a.id);
      const bRead = readSet.has(b.id);
      if (aRead !== bRead) return aRead ? 1 : -1;
      return severityRank[a.severity] - severityRank[b.severity];
    });
  }, [notifications, readSet]);

  const filteredNotifications = React.useMemo(() => {
    if (filter === 'all') return sortedNotifications;
    if (filter === 'order_alert') {
      return sortedNotifications.filter(
        (n) => n.type === 'order_alert' || n.type === 'address_alert'
      );
    }
    return sortedNotifications.filter((n) => n.type === filter);
  }, [sortedNotifications, filter]);

  const filterCounts = React.useMemo(() => {
    const unreadBy = (predicate: (n: AdminNotificationItem) => boolean) =>
      notifications.filter((n) => predicate(n) && !readSet.has(n.id)).length;
    return {
      all: notifications.filter((n) => !readSet.has(n.id)).length,
      vendor_approval: unreadBy((n) => n.type === 'vendor_approval'),
      stock_alert: unreadBy((n) => n.type === 'stock_alert'),
      order_alert: unreadBy(
        (n) => n.type === 'order_alert' || n.type === 'address_alert'
      ),
    } as Record<NotificationFilterKey, number>;
  }, [notifications, readSet]);

  const markRead = (id: string) =>
    setReadIds((prev) => (prev.includes(id) ? prev : [...prev, id]));

  const toggleRead = (id: string) =>
    setReadIds((prev) =>
      prev.includes(id) ? prev.filter((i) => i !== id) : [...prev, id]
    );

  const markAllRead = () => setReadIds(notifications.map((n) => n.id));

  const handleOpen = (n: AdminNotificationItem) => {
    markRead(n.id); // Opening counts as reading — the badge settles immediately.
    onOpenNotification(n);
    setIsOpen(false);
  };

  const filterChips: Array<{ key: NotificationFilterKey; bn: string; en: string }> = [
    { key: 'all', bn: 'সব', en: 'All' },
    { key: 'vendor_approval', bn: 'ভেন্ডর', en: 'Vendor' },
    { key: 'stock_alert', bn: 'স্টক', en: 'Stock' },
    { key: 'order_alert', bn: 'অর্ডার', en: 'Orders' },
  ];

  return (
    <>
      {/* Bell trigger (header placement) */}
      <button
        type="button"
        onClick={() => setIsOpen(true)}
        className={`relative min-w-11 min-h-11 flex items-center justify-center rounded-[var(--radius-sm)] border bg-surface text-ink hover:bg-bg transition-colors cursor-pointer ${
          hasUnreadDanger ? 'border-danger/40' : 'border-border'
        }`}
        title={t('নোটিফিকেশন সেন্টার', 'Notification Center')}
      >
        <span className="sr-only">{t('নোটিফিকেশন সেন্টার', 'Notification Center')} </span>
        <Bell className="w-4 h-4" aria-hidden="true" />
        {unreadCount > 0 && (
          <span
            role="status"
            className={`absolute -top-1 -right-1 min-w-[18px] h-4 px-1 rounded-full bg-danger text-white text-[10px] font-bold flex items-center justify-center leading-none ${
              hasUnreadDanger ? 'motion-safe:animate-pulse' : ''
            }`}
          >
            {unreadCount > 99 ? '99+' : unreadCount}
          </span>
        )}
      </button>

      {/* Notification drawer */}
      <ResponsiveSheet
        open={isOpen}
        onOpenChange={setIsOpen}
        title={t('অ্যাডমিন নোটিফিকেশন সেন্টার', 'Admin Notification Center')}
      >
        <div className="space-y-4">
          {/* Filter chips with live unread counts + mark-all-read */}
          <div className="flex flex-wrap items-center justify-between gap-2 p-3 bg-bg border border-border rounded-[var(--radius-md)] text-xs">
            <div className="flex flex-wrap items-center gap-1.5" role="group" aria-label={t('নোটিফিকেশন ফিল্টার', 'Notification filter')}>
              {filterChips.map((chip) => (
                <button
                  key={chip.key}
                  type="button"
                  onClick={() => setFilter(chip.key)}
                  aria-pressed={filter === chip.key}
                  className={`min-h-11 px-2.5 py-1.5 rounded-[var(--radius-sm)] border text-[11px] font-semibold transition-colors cursor-pointer flex items-center gap-1.5 ${
                    filter === chip.key
                      ? 'bg-ink text-surface border-ink'
                      : 'bg-surface text-ink border-border hover:bg-bg'
                  }`}
                >
                  <span>{t(chip.bn, chip.en)}</span>
                  {filterCounts[chip.key] > 0 && (
                    <span
                      className={`px-1 rounded-full text-[10px] tabular-nums font-mono ${
                        filter === chip.key ? 'bg-surface text-ink' : 'bg-danger/10 text-danger'
                      }`}
                    >
                      {filterCounts[chip.key] > 99 ? '99+' : filterCounts[chip.key]}
                    </span>
                  )}
                </button>
              ))}
            </div>

            {unreadCount > 0 && (
              <button
                type="button"
                onClick={markAllRead}
                className="inline-flex items-center gap-1.5 min-h-11 px-3 py-1.5 rounded-[var(--radius-sm)] bg-surface hover:bg-bg border border-border text-ink text-xs font-semibold cursor-pointer transition-colors"
              >
                <CheckCheck className="w-3.5 h-3.5 text-emerald-600" />
                <span>{t('সব পড়া চিহ্নিত করুন', 'Mark All Read')}</span>
              </button>
            )}
          </div>

          {/* List */}
          {filteredNotifications.length === 0 ? (
            <div className="py-12 text-center text-muted text-xs border border-dashed border-border rounded-[var(--radius-md)]">
              <Bell className="w-8 h-8 mx-auto mb-2 text-muted/50" />
              <p>{t('কোনো নোটিফিকেশন পাওয়া যায়নি', 'No notifications found')}</p>
            </div>
          ) : (
            <div className="space-y-2.5 max-h-[60vh] overflow-y-auto pr-1">
              {filteredNotifications.map((n) => {
                const isRead = readSet.has(n.id);
                return (
                  <div
                    key={n.id}
                    className={`p-3 rounded-[var(--radius-md)] border transition-all ${
                      isRead
                        ? 'border-border bg-surface/50 opacity-75'
                        : n.severity === 'danger'
                        ? 'border-danger/30 bg-surface shadow-2xs'
                        : 'border-border bg-surface shadow-2xs'
                    }`}
                  >
                    <div className="flex items-start justify-between gap-3">
                      <div className="space-y-1 min-w-0">
                        <div className="flex items-center gap-2 flex-wrap">
                          {/* Severity dot: instantly scannable priority */}
                          <span
                            aria-hidden="true"
                            className={`w-1.5 h-1.5 rounded-full shrink-0 ${
                              n.severity === 'danger'
                                ? 'bg-danger'
                                : n.severity === 'warning'
                                ? 'bg-warning'
                                : 'bg-info'
                            }`}
                          />
                          <span
                            className={`px-1.5 py-0.5 rounded-full text-[10px] font-bold border ${
                              n.severity === 'danger'
                                ? 'bg-danger/10 text-danger border-danger/20'
                                : n.severity === 'warning'
                                ? 'bg-warning/10 text-warning border-warning/20'
                                : 'bg-info/10 text-info border-info/20'
                            }`}
                          >
                            {t(n.timestampBn, n.timestampEn)}
                          </span>
                          <h4 className={`text-xs font-bold ${isRead ? 'text-muted' : 'text-ink'}`}>
                            {t(n.titleBn, n.titleEn)}
                          </h4>
                        </div>
                        <p className="text-[11px] text-muted leading-relaxed">
                          {t(n.descBn, n.descEn)}
                        </p>
                      </div>

                      <div className="flex items-center gap-1.5 shrink-0">
                        <button
                          type="button"
                          onClick={() => toggleRead(n.id)}
                          aria-label={
                            isRead
                              ? t('অপঠিত হিসেবে চিহ্নিত করুন', 'Mark as Unread')
                              : t('পঠিত হিসেবে চিহ্নিত করুন', 'Mark as Read')
                          }
                          title={
                            isRead
                              ? t('অপঠিত হিসেবে চিহ্নিত করুন', 'Mark as Unread')
                              : t('পঠিত হিসেবে চিহ্নিত করুন', 'Mark as Read')
                          }
                          className="min-w-11 min-h-11 flex items-center justify-center rounded-[var(--radius-sm)] text-muted hover:text-ink cursor-pointer"
                        >
                          <CheckCheck
                            className={`w-4 h-4 ${isRead ? 'text-emerald-600' : 'text-muted/40'}`}
                          />
                        </button>

                        <button
                          type="button"
                          onClick={() => handleOpen(n)}
                          className="inline-flex items-center gap-1 min-h-11 px-3 py-1.5 rounded-[var(--radius-sm)] bg-ink text-surface text-[11px] font-semibold hover:opacity-90 cursor-pointer transition-opacity"
                        >
                          <span>{t('দেখুন', 'Open')}</span>
                          <ArrowUpRight className="w-3 h-3" />
                        </button>
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          )}

          <p className="text-[10px] text-muted text-center">
            {t(
              'নোটিফিকেশন প্রতি ৬০ সেকেন্ডে স্বয়ংক্রিয়ভাবে হালনাগাদ হয় (ট্যাব দৃশ্যমান থাকলে)।',
              'Notifications auto-refresh every 60 seconds while this tab is visible.'
            )}
          </p>
        </div>
      </ResponsiveSheet>
    </>
  );
}

// Re-export the guard so the parent can validate snapshot-derived lists if desired.
export { isNotificationItem };
