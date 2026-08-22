import React from 'react';
import { cn } from '@/lib/utils';
import type { RequestStatus } from '@/types/types';
import { Clock, Loader2, CheckCircle2, XCircle, Minus, MoreHorizontal } from 'lucide-react';

const STATUS_CONFIG: Record<RequestStatus, { label: string; className: string; icon: React.ReactNode }> = {
  pending:    { label: 'En attente',  className: 'status-pending',    icon: <Clock size={12} /> },
  processing: { label: 'En cours',   className: 'status-processing',  icon: <Loader2 size={12} className="animate-spin" /> },
  accepted:   { label: 'Accepté',    className: 'status-accepted',    icon: <CheckCircle2 size={12} /> },
  rejected:   { label: 'Rejeté',     className: 'status-rejected',    icon: <XCircle size={12} /> },
  unchanged:  { label: 'Inchangé',   className: 'status-unchanged',   icon: <Minus size={12} /> },
  other:      { label: 'Autre',      className: 'status-other',       icon: <MoreHorizontal size={12} /> },
};

export function StatusBadge({ status, className }: { status: RequestStatus; className?: string }) {
  const cfg = STATUS_CONFIG[status];
  return (
    <span className={cn('inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-medium', cfg.className, className)}>
      {cfg.icon}{cfg.label}
    </span>
  );
}
