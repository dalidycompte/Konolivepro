import React, { useState, useEffect, useMemo } from 'react';
import MainLayout from '@/components/layouts/MainLayout';
import { useAuth } from '@/contexts/AuthContext';
import { supabase } from '@/lib/supabase';
import { format, startOfMonth, endOfMonth, eachDayOfInterval, isSameDay } from 'date-fns';
import { fr } from 'date-fns/locale';
import { CalendarDays, BarChart2, Hash, ArrowLeft, ArrowRight } from 'lucide-react';
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer } from 'recharts';

interface DailyStats {
  date: Date;
  dateStr: string;
  total: number;
}

export default function AgentMonthlyTrackingPage() {
  const { profile } = useAuth();
  const [currentMonth, setCurrentMonth] = useState(new Date());
  const [loading, setLoading] = useState(true);
  const [stats, setStats] = useState<DailyStats[]>([]);

  useEffect(() => {
    if (!profile) return;
    
    async function loadStats() {
      if (!profile) return;
      setLoading(true);
      const start = startOfMonth(currentMonth);
      const end = endOfMonth(currentMonth);
      
      const { data, error } = await supabase
        .from('verification_requests')
        .select('processed_at, status')
        .eq('agent_id', profile.id)
        .in('status', ['accepted', 'rejected'])
        .eq('exclude_from_agent_metrics', false)
        .gte('processed_at', start.toISOString())
        .lte('processed_at', end.toISOString());
        
      if (error) {
        console.error('Error fetching monthly stats:', error);
        setLoading(false);
        return;
      }
      
      const daysInMonth = eachDayOfInterval({ start, end });
      const dailyData: DailyStats[] = daysInMonth.map(day => {
        const countForDay = data?.filter(req => req.processed_at && isSameDay(new Date(req.processed_at), day)).length || 0;
        return {
          date: day,
          dateStr: format(day, 'dd/MM'),
          total: countForDay
        };
      });
      
      setStats(dailyData);
      setLoading(false);
    }
    
    loadStats();
  }, [profile, currentMonth]);

  const nextMonth = () => setCurrentMonth(prev => new Date(prev.getFullYear(), prev.getMonth() + 1, 1));
  const prevMonth = () => setCurrentMonth(prev => new Date(prev.getFullYear(), prev.getMonth() - 1, 1));

  const totalProcessed = useMemo(() => stats.reduce((acc, curr) => acc + curr.total, 0), [stats]);

  return (
    <MainLayout>
      <div className="space-y-6">
        <div>
          <h1 className="text-2xl font-bold text-foreground">Suivi mensuel</h1>
          <p className="text-muted-foreground text-sm mt-1">Nombre de numéros traités par jour</p>
        </div>

        <div className="flex flex-col md:flex-row gap-4 items-center justify-between neu-card">
          <div className="flex items-center gap-4">
            <button onClick={prevMonth} className="p-2 rounded-full neu-flat hover:text-primary transition-colors">
              <ArrowLeft size={18} />
            </button>
            <h2 className="text-lg font-bold min-w-32 text-center capitalize">
              {format(currentMonth, 'MMMM yyyy', { locale: fr })}
            </h2>
            <button 
              onClick={nextMonth} 
              disabled={startOfMonth(currentMonth) >= startOfMonth(new Date())}
              className="p-2 rounded-full neu-flat hover:text-primary transition-colors disabled:opacity-30 disabled:cursor-not-allowed">
              <ArrowRight size={18} />
            </button>
          </div>
          
          <div className="neu-pressed px-6 py-3 rounded-2xl flex items-center gap-4">
            <div className="flex items-center gap-2">
              <div className="w-8 h-8 rounded-full bg-primary/10 text-primary flex items-center justify-center">
                <Hash size={16} />
              </div>
              <div className="flex flex-col">
                <span className="text-[10px] text-muted-foreground uppercase tracking-wider font-bold">Total du mois</span>
                <span className="text-xl font-black leading-none">{totalProcessed}</span>
              </div>
            </div>
          </div>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          <div className="lg:col-span-2 neu-card min-h-[400px] flex flex-col">
            <h3 className="font-semibold mb-6 flex items-center gap-2">
              <BarChart2 size={18} className="text-primary" />
              Évolution journalière
            </h3>
            
            {loading ? (
              <div className="flex-1 flex items-center justify-center">
                <div className="w-8 h-8 border-4 border-primary border-t-transparent rounded-full animate-spin"></div>
              </div>
            ) : (
              <div className="flex-1 w-full min-w-0">
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart data={stats} margin={{ top: 10, right: 10, left: -20, bottom: 0 }}>
                    <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="hsl(var(--border))" opacity={0.4} />
                    <XAxis 
                      dataKey="dateStr" 
                      tick={{ fill: 'hsl(var(--muted-foreground))', fontSize: 11 }}
                      tickLine={false}
                      axisLine={false}
                    />
                    <YAxis 
                      tick={{ fill: 'hsl(var(--muted-foreground))', fontSize: 11 }}
                      tickLine={false}
                      axisLine={false}
                      allowDecimals={false}
                    />
                    <Tooltip 
                      cursor={{ fill: 'hsl(var(--muted)/0.3)' }}
                      contentStyle={{ 
                        backgroundColor: 'hsl(var(--card))', 
                        borderColor: 'hsl(var(--border))',
                        borderRadius: '0.75rem',
                        boxShadow: '0 10px 15px -3px rgb(0 0 0 / 0.1)'
                      }}
                      itemStyle={{ color: 'hsl(var(--foreground))', fontWeight: 'bold' }}
                      labelStyle={{ color: 'hsl(var(--muted-foreground))', marginBottom: '0.25rem' }}
                      formatter={(value: number) => [value, 'Numéros traités']}
                      labelFormatter={(label) => `Date: ${label}`}
                    />
                    <Bar 
                      dataKey="total" 
                      fill="hsl(var(--primary))" 
                      radius={[4, 4, 0, 0]} 
                      maxBarSize={40}
                    />
                  </BarChart>
                </ResponsiveContainer>
              </div>
            )}
          </div>

          <div className="neu-card flex flex-col h-[500px]">
            <h3 className="font-semibold mb-4 flex items-center gap-2">
              <CalendarDays size={18} className="text-primary" />
              Détail par jour
            </h3>
            
            {loading ? (
              <div className="flex-1 flex items-center justify-center">
                <div className="w-8 h-8 border-4 border-primary border-t-transparent rounded-full animate-spin"></div>
              </div>
            ) : (
              <div className="flex-1 overflow-y-auto pr-2 space-y-2">
                {stats.slice().reverse().map((day, idx) => (
                  <div key={idx} className="neu-flat p-3 rounded-xl flex items-center justify-between">
                    <span className="text-sm font-medium capitalize">
                      {format(day.date, 'EEEE d MMM', { locale: fr })}
                    </span>
                    <span className={`px-2.5 py-1 rounded-full text-xs font-bold ${
                      day.total > 0 ? 'bg-primary/10 text-primary' : 'bg-muted text-muted-foreground'
                    }`}>
                      {day.total} traité{day.total > 1 ? 's' : ''}
                    </span>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      </div>
    </MainLayout>
  );
}
// HMR trigger
