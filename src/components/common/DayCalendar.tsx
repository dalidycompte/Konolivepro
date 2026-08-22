/**
 * DayCalendar — calendrier mensuel affichant le nombre de demandes traitées par jour.
 * Cliquer sur un jour appelle onDayClick(date) pour filtrer un tableau externe.
 */
import React, { useMemo, useState } from 'react';
import {
  format, startOfMonth, endOfMonth, eachDayOfInterval,
  getDay, isSameDay, isSameMonth, addMonths, subMonths,
  isToday, parseISO,
} from 'date-fns';
import { fr } from 'date-fns/locale';
import { ChevronLeft, ChevronRight, CalendarDays } from 'lucide-react';
import type { VerificationRequest } from '@/types/types';

interface DayCalendarProps {
  requests: VerificationRequest[];
  selectedDay: Date | null;
  onDayClick: (day: Date | null) => void;
  title?: string;
}

function getDateKey(d: Date) { return format(d, 'yyyy-MM-dd'); }

function requestDate(r: VerificationRequest): Date | null {
  const raw = r.processed_at ?? r.updated_at;
  if (!raw) return null;
  try { return parseISO(raw); } catch { return null; }
}

function dotColor(count: number) {
  if (count === 0) return '';
  if (count <= 2)  return 'bg-primary/30';
  if (count <= 5)  return 'bg-primary/60';
  return 'bg-primary';
}

const DAY_LABELS = ['Lun', 'Mar', 'Mer', 'Jeu', 'Ven', 'Sam', 'Dim'];

export default function DayCalendar({ requests, selectedDay, onDayClick, title = 'Traitements par jour' }: DayCalendarProps) {
  const [viewMonth, setViewMonth] = useState(() => new Date());

  // Map date-key → count
  const byDay = useMemo(() => {
    const map = new Map<string, number>();
    for (const r of requests) {
      if (!['accepted','rejected','unchanged'].includes(r.status)) continue;
      const d = requestDate(r);
      if (!d) continue;
      const k = getDateKey(d);
      map.set(k, (map.get(k) ?? 0) + 1);
    }
    return map;
  }, [requests]);

  // Calendar grid
  const { days, startPad } = useMemo(() => {
    const first = startOfMonth(viewMonth);
    const last  = endOfMonth(viewMonth);
    const days  = eachDayOfInterval({ start: first, end: last });
    const startPad = (getDay(first) + 6) % 7; // Mon=0 … Sun=6
    return { days, startPad };
  }, [viewMonth]);

  return (
    <div className="neu-card">
      {/* Header */}
      <div className="flex items-center justify-between mb-5">
        <h2 className="font-semibold text-foreground flex items-center gap-2">
          <CalendarDays size={18} className="text-primary" />
          {title}
        </h2>
        <div className="flex items-center gap-1">
          <button
            onClick={() => { setViewMonth(m => subMonths(m, 1)); onDayClick(null); }}
            className="neu-flat w-8 h-8 rounded-lg flex items-center justify-center hover:text-primary transition-colors"
            aria-label="Mois précédent">
            <ChevronLeft size={16} />
          </button>
          <span className="text-sm font-semibold text-foreground min-w-[130px] text-center capitalize">
            {format(viewMonth, 'MMMM yyyy', { locale: fr })}
          </span>
          <button
            onClick={() => { setViewMonth(m => addMonths(m, 1)); onDayClick(null); }}
            className="neu-flat w-8 h-8 rounded-lg flex items-center justify-center hover:text-primary transition-colors"
            aria-label="Mois suivant">
            <ChevronRight size={16} />
          </button>
        </div>
      </div>

      {/* Day headers */}
      <div className="grid grid-cols-7 mb-2">
        {DAY_LABELS.map(d => (
          <div key={d} className="text-center text-xs font-semibold text-muted-foreground py-1">{d}</div>
        ))}
      </div>

      {/* Days grid */}
      <div className="grid grid-cols-7 gap-1">
        {Array.from({ length: startPad }).map((_, i) => <div key={`pad-${i}`} />)}
        {days.map(day => {
          const key        = getDateKey(day);
          const count      = byDay.get(key) ?? 0;
          const isSelected = selectedDay ? isSameDay(day, selectedDay) : false;
          const isCurrent  = isToday(day);
          const inMonth    = isSameMonth(day, viewMonth);
          const hasData    = count > 0;

          return (
            <button
              key={key}
              onClick={() => onDayClick(isSelected ? null : day)}
              className={[
                'relative flex flex-col items-center justify-center rounded-xl p-1.5 min-h-[52px] transition-all',
                !inMonth ? 'opacity-30' : '',
                isSelected ? 'neu-pressed ring-2 ring-primary text-primary' :
                  hasData  ? 'neu-flat hover:neu-pressed cursor-pointer' :
                             'cursor-default opacity-60',
              ].join(' ')}
              aria-label={`${format(day, 'd MMMM', { locale: fr })} — ${count} demande${count !== 1 ? 's' : ''}`}
              aria-pressed={isSelected}
            >
              <span className={['text-xs font-semibold leading-none',
                isCurrent && !isSelected ? 'text-primary' : 'text-foreground',
              ].join(' ')}>
                {format(day, 'd')}
              </span>

              {hasData && (
                <span className={[
                  'mt-1 text-[10px] font-bold px-1.5 py-0.5 rounded-full leading-none',
                  isSelected ? 'bg-primary text-white' : `${dotColor(count)} text-primary`,
                ].join(' ')}>
                  {count}
                </span>
              )}

              {isCurrent && (
                <span className="absolute bottom-1 left-1/2 -translate-x-1/2 w-1 h-1 rounded-full bg-primary" />
              )}
            </button>
          );
        })}
      </div>

      {/* Legend */}
      <div className="flex items-center gap-4 mt-4 pt-4 border-t border-border/50">
        {[
          { label: '1–2', cls: 'bg-primary/30' },
          { label: '3–5', cls: 'bg-primary/60' },
          { label: '6+',  cls: 'bg-primary' },
        ].map(l => (
          <div key={l.label} className="flex items-center gap-1.5">
            <span className={`w-3 h-3 rounded-full ${l.cls}`} />
            <span className="text-xs text-muted-foreground">{l.label} traitement{l.label === '1–2' ? '' : 's'}</span>
          </div>
        ))}
        {selectedDay && (
          <button
            onClick={() => onDayClick(null)}
            className="ml-auto text-xs text-primary hover:underline">
            Tout afficher
          </button>
        )}
      </div>
    </div>
  );
}
