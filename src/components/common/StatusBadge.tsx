import React from 'react';
import { cn } from '@/lib/utils';
import type { RequestStatus } from '@/types/types';
import { Clock, Loader2, CheckCircle2, XCircle, Minus, MoreHorizontal } from 'lucide-react';

const STATUS_CONFIG: Record<RequestStatus, { label: string; className: string; icon: React.ReactNode }> = {
  pending:    { label: 'En attente',             className: 'bg-orange-500/15 text-orange-700 dark:text-orange-300', icon: <Clock size={12} /> },
  processing: { label: 'En cours de traitement', className: 'bg-yellow-500/15 text-yellow-700 dark:text-yellow-300', icon: <Loader2 size={12} className="animate-spin" /> },
  accepted:   { label: 'Accepté',                className: 'bg-green-500/15 text-green-700 dark:text-green-300',     icon: <CheckCircle2 size={12} /> },
  rejected:   { label: 'Rejeté',                 className: 'bg-red-500/15 text-red-700 dark:text-red-300',          icon: <XCircle size={12} /> },
  unchanged:  { label: 'Inchangé',               className: 'bg-gray-500/15 text-gray-700 dark:text-gray-300',      icon: <Minus size={12} /> },
  other:      { label: 'Autre',                  className: 'bg-amber-500/15 text-amber-700 dark:text-amber-300',   icon: <MoreHorizontal size={12} /> },
};

export function StatusBadge({ status, className }: { status: RequestStatus; className?: string }) {
  const cfg = STATUS_CONFIG[status];
  return (
    <span className={cn('inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-medium', cfg.className, className)}>
      {cfg.icon}{cfg.label}
    </span>
  );
}
