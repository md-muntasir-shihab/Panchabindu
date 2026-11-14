'use client';

import * as React from 'react';
import { adminFetch } from '@/lib/admin/admin-fetch';
import type { CustomerInquiryRecord } from '@/lib/db/repository';
import type { SanitizedAdminUserDTO } from '@/lib/admin/phase4a-service';
import { formatLocaleNumber, formatLocaleDateTime } from '@/lib/i18n/dictionaries';
import { Badge, Button, Card, Input } from '../ui/primitives';

type Status = CustomerInquiryRecord['status'];
type Priority = NonNullable<CustomerInquiryRecord['priority']>;
type Locale = 'bn' | 'en';
const statusLabels: Record<Status, [string, string]> = {
  unread: ['অপঠিত', 'Unread'], in_progress: ['চলমান', 'In progress'],
  replied: ['উত্তর দেওয়া হয়েছে', 'Replied'], resolved: ['সমাধান হয়েছে', 'Resolved'],
};
const priorityLabels: Record<Priority, [string, string]> = {
  low: ['কম', 'Low'], normal: ['স্বাভাবিক', 'Normal'], high: ['জরুরি', 'High'],
};
const label = (pair: [string, string], locale: Locale) => pair[locale === 'bn' ? 0 : 1];

function InquiryEditor({ inquiry, users, locale, onRefresh }: {
  inquiry: CustomerInquiryRecord; users: SanitizedAdminUserDTO[]; locale: Locale; onRefresh: () => Promise<void>;
}) {
  const [status, setStatus] = React.useState<Status>(inquiry.status);
  const [priority, setPriority] = React.useState<Priority>(inquiry.priority ?? 'normal');
  const [assignedTo, setAssignedTo] = React.useState(inquiry.assignedTo ?? '');
  const [notes, setNotes] = React.useState(inquiry.adminNotes ?? '');
  const [saving, setSaving] = React.useState(false);
  const [feedback, setFeedback] = React.useState('');
  const bn = locale === 'bn';
  const phone = inquiry.phone.replace(/[০-৯]/g, d => String('০১২৩৪৫৬৭৮৯'.indexOf(d))).replace(/\D/g, '');
  const bdPhone = phone.startsWith('880') && phone.length === 13 ? `0${phone.slice(3)}` : phone;
  const validPhone = /^01[3-9]\d{8}$/.test(bdPhone);
  const save = async (e: React.FormEvent) => {
    e.preventDefault(); setSaving(true); setFeedback('');
    try {
      const response = await adminFetch('/api/admin/workspace', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ operation: 'update_inquiry_status', inquiryId: inquiry.id, status, priority,
          assignedTo: assignedTo || null, adminNotes: notes, expectedRevision: inquiry.revision ?? 0 }),
      });
      const data = await response.json();
      if (!response.ok || !data.success) {
        throw new Error(data.errorBn || (bn ? 'সংরক্ষণ ব্যর্থ হয়েছে।' : 'Could not save changes.'));
      }
      await onRefresh();
      setFeedback(bn ? 'পরিবর্তন সংরক্ষিত হয়েছে।' : 'Changes saved.');
    } catch (error) { setFeedback(error instanceof Error ? error.message : (bn ? 'সংযোগ ব্যর্থ।' : 'Connection failed.')); }
    finally { setSaving(false); }
  };
  const fieldClass = 'w-full min-h-[44px] px-3 py-2 border border-border rounded bg-bg text-ink';
  return <Card surface="bg" padding="md" className="space-y-4 min-w-0">
    <div className="border-b border-border pb-3 space-y-1">
      <div className="flex flex-wrap justify-between gap-2"><h2 className="font-bold text-lg break-words">{inquiry.subject}</h2><Badge status={inquiry.status === 'resolved' ? 'success' : 'info'}>{label(statusLabels[inquiry.status], locale)}</Badge></div>
      <p className="text-sm">{inquiry.name} · {inquiry.phone}</p>
      <p className="text-xs text-muted">{formatLocaleDateTime(inquiry.createdAt, locale)} · {inquiry.id}</p>
    </div>
    <div className="whitespace-pre-wrap break-words text-sm rounded border border-border bg-surface p-3">{inquiry.message}</div>
    <div className="flex flex-wrap gap-2">
      {validPhone && <><a className="border border-border rounded px-3 py-2 text-sm" href={`tel:${bdPhone}`}>{bn ? 'কল করুন' : 'Call'}</a><a className="border border-border rounded px-3 py-2 text-sm" href={`https://wa.me/88${bdPhone}`} target="_blank" rel="noopener noreferrer">WhatsApp ↗</a></>}
      <span className="text-xs text-muted self-center">{bn ? 'কল বা WhatsApp বাইরে খুলবে; এখানে কোনো বার্তা স্বয়ংক্রিয়ভাবে পাঠানো হয় না।' : 'Call and WhatsApp open externally; no message is sent automatically.'}</span>
    </div>
    <form onSubmit={save} className="space-y-4">
      <div className="grid sm:grid-cols-3 gap-3">
        <label className="text-sm space-y-1"><span>{bn ? 'অবস্থা' : 'Status'}</span><select className={fieldClass} value={status} onChange={e => setStatus(e.target.value as Status)}>{(Object.keys(statusLabels) as Status[]).map(key => <option key={key} value={key}>{label(statusLabels[key], locale)}</option>)}</select></label>
        <label className="text-sm space-y-1"><span>{bn ? 'অগ্রাধিকার' : 'Priority'}</span><select className={fieldClass} value={priority} onChange={e => setPriority(e.target.value as Priority)}>{(Object.keys(priorityLabels) as Priority[]).map(key => <option key={key} value={key}>{label(priorityLabels[key], locale)}</option>)}</select></label>
        <label className="text-sm space-y-1"><span>{bn ? 'দায়িত্বপ্রাপ্ত' : 'Assigned to'}</span><select className={fieldClass} value={assignedTo} onChange={e => setAssignedTo(e.target.value)}><option value="">{bn ? 'নির্ধারিত নয়' : 'Unassigned'}</option>{users.filter(u => u.isActive && u.roleSlug === 'super_admin').map(u => <option key={u.username} value={u.username}>{locale === 'bn' ? u.displayNameBn : u.displayNameEn} ({u.username})</option>)}{assignedTo && !users.some(u => u.username === assignedTo && u.isActive && u.roleSlug === 'super_admin') && <option value={assignedTo}>{assignedTo} ({bn ? 'নিষ্ক্রিয়' : 'inactive'})</option>}</select></label>
      </div>
      <label className="block text-sm space-y-1"><span>{bn ? 'অভ্যন্তরীণ নোট (গ্রাহক দেখবেন না)' : 'Internal notes (not visible to customer)'}</span><textarea className={`${fieldClass} min-h-[110px]`} maxLength={4000} value={notes} onChange={e => setNotes(e.target.value)} /></label>
      <p className="text-xs text-muted">{bn ? 'উত্তর দেওয়া হয়েছে নির্বাচন শুধু রেকর্ড রাখে; এটি কোনো বার্তা পাঠায় না।' : 'Marking replied only records the status; it does not send a message.'}</p>
      <div className="flex items-center gap-3 flex-wrap"><Button type="submit" disabled={saving}>{saving ? (bn ? 'সংরক্ষণ হচ্ছে…' : 'Saving…') : (bn ? 'সংরক্ষণ করুন' : 'Save changes')}</Button>{feedback && <span role="status" className="text-sm">{feedback}</span>}{feedback && <Button type="button" variant="outline" onClick={() => void onRefresh()}>{bn ? 'তথ্য হালনাগাদ করুন' : 'Refresh data'}</Button>}</div>
    </form>
    <details className="text-sm border-t border-border pt-3"><summary className="font-semibold cursor-pointer">{bn ? 'সাম্প্রতিক পরিবর্তন' : 'Recent activity'} ({formatLocaleNumber(inquiry.activity?.length ?? 0, locale)})</summary>
      <ul className="mt-2 space-y-2 text-muted">{[...(inquiry.activity ?? [])].reverse().map((entry, i) => <li key={`${entry.at}-${i}`} className="break-words">{formatLocaleDateTime(entry.at, locale)} · {entry.actor} · {label(statusLabels[entry.status], locale)} · {label(priorityLabels[entry.priority], locale)}{entry.assignedTo ? ` · ${entry.assignedTo}` : ''}{entry.noteChanged ? (bn ? ' · নোট পরিবর্তিত' : ' · note changed') : ''}</li>)}</ul>
    </details>
  </Card>;
}

export function ContactManagementPanel({ inquiries, users, locale, onRefreshWorkspace }: {
  inquiries: CustomerInquiryRecord[]; users: SanitizedAdminUserDTO[]; locale: Locale; onRefreshWorkspace: () => Promise<void>;
}) {
  const [search, setSearch] = React.useState('');
  const [status, setStatus] = React.useState<Status | 'all'>('all');
  const [priority, setPriority] = React.useState<Priority | 'all'>('all');
  const [selected, setSelected] = React.useState<string | null>(null);
  const bn = locale === 'bn';
  const filtered = React.useMemo(() => inquiries.filter(item => {
    const q = search.trim().toLocaleLowerCase();
    return (status === 'all' || item.status === status) && (priority === 'all' || (item.priority ?? 'normal') === priority) &&
      (!q || [item.name, item.phone, item.subject, item.message, item.id].some(value => value.toLocaleLowerCase().includes(q)));
  }).sort((a, b) => b.createdAt.localeCompare(a.createdAt)), [inquiries, search, status, priority]);
  const active = inquiries.find(item => item.id === selected);
  return <section className="space-y-4">
    <div><h1 className="text-xl font-bold">{bn ? 'যোগাযোগ ব্যবস্থাপনা' : 'Contact management'}</h1><p className="text-sm text-muted">{bn ? 'কন্টাক্ট ফর্মের বার্তা, দায়িত্ব ও অগ্রগতি এক জায়গায় পরিচালনা করুন।' : 'Manage contact form inquiries, assignments and progress in one place.'}</p></div>
    <div className="grid grid-cols-2 md:grid-cols-4 gap-2">{([['মোট', 'Total', inquiries.length], ['অপঠিত', 'Unread', inquiries.filter(i => i.status === 'unread').length], ['চলমান', 'In progress', inquiries.filter(i => i.status === 'in_progress').length], ['সমাধান', 'Resolved', inquiries.filter(i => i.status === 'resolved').length]] as const).map(([b, e, n]) => <Card key={e} surface="bg" padding="sm"><p className="text-xs text-muted">{bn ? b : e}</p><strong className="text-xl">{formatLocaleNumber(n, locale)}</strong></Card>)}</div>
    <div className="grid lg:grid-cols-[minmax(0,0.9fr)_minmax(0,1.5fr)] gap-4 items-start">
      <Card surface="bg" padding="md" className="space-y-3 min-w-0">
        <Input label={bn ? 'খুঁজুন' : 'Search'} placeholder={bn ? 'নাম, ফোন, বিষয় বা বার্তা' : 'Name, phone, subject or message'} value={search} onChange={e => setSearch(e.target.value)} />
        <div className="grid grid-cols-2 gap-2"><label className="text-xs">{bn ? 'অবস্থা' : 'Status'}<select className="w-full min-h-[44px] border border-border rounded bg-bg p-2" value={status} onChange={e => setStatus(e.target.value as Status | 'all')}><option value="all">{bn ? 'সব' : 'All'}</option>{(Object.keys(statusLabels) as Status[]).map(key => <option key={key} value={key}>{label(statusLabels[key], locale)}</option>)}</select></label><label className="text-xs">{bn ? 'অগ্রাধিকার' : 'Priority'}<select className="w-full min-h-[44px] border border-border rounded bg-bg p-2" value={priority} onChange={e => setPriority(e.target.value as Priority | 'all')}><option value="all">{bn ? 'সব' : 'All'}</option>{(Object.keys(priorityLabels) as Priority[]).map(key => <option key={key} value={key}>{label(priorityLabels[key], locale)}</option>)}</select></label></div>
        <p className="text-xs text-muted">{formatLocaleNumber(filtered.length, locale)} {bn ? 'টি বার্তা' : 'messages'}</p>
        <div className="space-y-2 max-h-[65vh] overflow-y-auto">{filtered.map(item => <button type="button" key={item.id} onClick={() => setSelected(item.id)} aria-pressed={selected === item.id} className={`w-full text-left p-3 border rounded space-y-1 ${selected === item.id ? 'border-ink bg-surface' : 'border-border hover:bg-surface'}`}><div className="flex justify-between gap-2"><span className="font-semibold truncate">{item.name}</span><span className="text-xs shrink-0">{label(statusLabels[item.status], locale)}</span></div><p className="text-sm truncate">{item.subject}</p><p className="text-xs text-muted">{item.phone} · {formatLocaleDateTime(item.createdAt, locale)} · {label(priorityLabels[item.priority ?? 'normal'], locale)}</p></button>)}{!filtered.length && <p className="text-sm text-muted py-4">{bn ? 'কোনো বার্তা পাওয়া যায়নি।' : 'No messages found.'}</p>}</div>
      </Card>
      {active ? <InquiryEditor key={`${active.id}:${active.revision ?? 0}`} inquiry={active} users={users} locale={locale} onRefresh={onRefreshWorkspace} /> : <Card surface="bg" padding="md" className="text-sm text-muted">{bn ? 'বিস্তারিত দেখতে একটি বার্তা নির্বাচন করুন।' : 'Select a message to view details.'}</Card>}
    </div>
  </section>;
}
