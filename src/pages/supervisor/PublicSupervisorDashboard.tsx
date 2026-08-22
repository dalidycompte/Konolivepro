import React, { useEffect, useState } from 'react';
import { useParams } from 'react-router-dom';
import { supabase } from '@/lib/supabase';
import { Users, TrendingUp, Timer, AlertCircle, Loader2, UserCheck, UserMinus, MapPin } from 'lucide-react';
import { AreaChart, Area, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Legend, LineChart, Line, BarChart, Bar } from 'recharts';


export interface LocalityStat {
  locality: string;
  received: number;
  accepted: number;
  rejected: number;
  unchanged: number;
  autres: number;
}

export interface CoachStat {
  total: number;
  online: number;
  offline: number;
}


export interface LocalityStat {
  locality: string;
  received: number;
  accepted: number;
  rejected: number;
  unchanged: number;
  autres: number;
}

export interface CoachStat {
  total: number;
  online: number;
  offline: number;
}

interface PublicDashboardData {
  kpi: {
    totalReceived: number;
    todayReceived: number;
    accepted: number;
    rejected: number;
    unchanged: number;
    pending: number;
    processing: number;
  };
  chart: Array<{
    time: string;
    total: number;
    pending: number;
    processing: number;
    accepted: number;
    rejected: number;
    unchanged: number;
    avgTime: number;
  }>;
  hourly?: Array<{
    hour: string;
    received: number;
    accepted: number;
    rejected: number;
    pending: number;
    other: number;
  }>;
  coach: CoachStat;
  locality: LocalityStat[];
}

const C = {
  received:  '#F59E0B',
  accepted:  '#22C55E',
  rejected:  '#EF4444',
  pending:   '#F97316',
  unchanged: '#8B5CF6',
  processing:'#3B82F6',
};

function buildConicGradient(slices: { color: string; value: number }[]): string {
  const total = slices.reduce((s, d) => s + d.value, 0);
  if (total === 0) return `conic-gradient(#e5e7eb 0deg 360deg)`;
  let cursor = 0;
  return `conic-gradient(${slices.map(d => {
    const start = (cursor / total) * 360;
    cursor += d.value;
    const end = (cursor / total) * 360;
    return `${d.color} ${start.toFixed(1)}deg ${end.toFixed(1)}deg`;
  }).join(', ')})`;
}

export default function PublicSupervisorDashboard() {
  const { token } = useParams<{ token: string }>();
  const [data, setData] = useState<PublicDashboardData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [currentTime, setCurrentTime] = useState(new Date());

  useEffect(() => {
    // Clock tick
    const clockInterval = setInterval(() => setCurrentTime(new Date()), 1000);
    return () => clearInterval(clockInterval);
  }, []);

  useEffect(() => {
    async function fetchData() {
      if (!token) return;
      try {
        const { data: res, error: fnError } = await supabase.rpc('get_public_dashboard_data', { link_id: token });
        if (fnError) throw fnError;
        
        setData(res as PublicDashboardData);
      } catch (err) {
        console.error(err);
        setError('Le lien de tableau de bord est invalide ou expiré.');
      } finally {
        setLoading(false);
      }
    }
    
    // Initial fetch
    fetchData();

    // Auto-refresh every second
    const dataInterval = setInterval(fetchData, 1000);
    return () => clearInterval(dataInterval);
  }, [token]);

  if (loading) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center">
        <Loader2 className="animate-spin text-primary w-8 h-8" />
      </div>
    );
  }

  if (error || !data) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center p-4">
        <div className="bg-card p-6 rounded-2xl shadow-sm text-center max-w-md">
          <AlertCircle className="w-12 h-12 text-destructive mx-auto mb-4" />
          <h2 className="text-lg font-bold text-foreground mb-2">Erreur d'accès</h2>
          <p className="text-muted-foreground text-sm">{error}</p>
        </div>
      </div>
    );
  }

  const { kpi, chart } = data;

  const totalProcessed = kpi.accepted + kpi.rejected; // Exclude unchanged
  const processedPercent = Math.min(Math.round((totalProcessed / 10000) * 100), 100);

  const donutSlices = [
    { color: C.accepted,  value: kpi.accepted },
    { color: C.rejected,  value: kpi.rejected },
    { color: C.unchanged, value: kpi.unchanged },
    { color: C.processing,value: kpi.processing },
    { color: C.pending,   value: kpi.pending },
  ];

  return (
    <div className="min-h-screen bg-background text-foreground flex flex-col items-center">
      {/* Header Public */}
      <header className="w-full bg-card border-b border-border py-4 px-6 flex items-center justify-between sticky top-0 z-50">
        <h1 className="text-xl font-bold bg-gradient-to-r from-primary to-blue-600 bg-clip-text text-transparent">
          Konolive • Tableau de bord Superviseur
        </h1>
        <div className="text-sm font-bold text-muted-foreground flex items-center gap-3">
          <div className="flex items-center gap-1.5 px-3 py-1 bg-muted rounded-full font-mono tabular-nums">
            {currentTime.toLocaleTimeString('fr-FR')}
          </div>
          <span className="w-2 h-2 rounded-full bg-green-500 animate-pulse"></span>
          En direct
        </div>
      </header>

      <main className="w-full max-w-5xl px-4 py-8 space-y-8">
        
        {/* KPI Overview */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4 sm:gap-6">
          <div className="p-4 sm:p-6 rounded-3xl bg-card border border-border/50 shadow-sm flex items-center gap-4 sm:gap-6 relative overflow-hidden group">
            <div className="absolute -right-4 -top-4 w-24 h-24 bg-primary/5 rounded-full blur-xl group-hover:bg-primary/10 transition-colors" />
            <div className="w-12 h-12 sm:w-14 sm:h-14 rounded-2xl bg-primary/10 text-primary flex items-center justify-center shrink-0">
              <TrendingUp size={24} className="sm:w-[28px] sm:h-[28px]" />
            </div>
            <div>
              <p className="text-xs sm:text-sm font-medium text-muted-foreground mb-1">Reçues aujourd'hui</p>
              <h2 className="text-2xl sm:text-3xl font-black text-foreground">{kpi.todayReceived}</h2>
              <p className="text-[10px] sm:text-xs text-muted-foreground mt-1">Total global: {kpi.totalReceived}</p>
            </div>
          </div>

          <div className="p-4 sm:p-6 rounded-3xl bg-card border border-border/50 shadow-sm flex items-center gap-4 sm:gap-6 relative overflow-hidden group">
            <div className="absolute -right-4 -top-4 w-24 h-24 bg-green-500/5 rounded-full blur-xl group-hover:bg-green-500/10 transition-colors" />
            <div className="w-12 h-12 sm:w-14 sm:h-14 rounded-2xl bg-green-500/10 text-green-500 flex items-center justify-center shrink-0">
              <Users size={24} className="sm:w-[28px] sm:h-[28px]" />
            </div>
            <div>
              <p className="text-xs sm:text-sm font-medium text-muted-foreground mb-1">Total traitées</p>
              <h2 className="text-2xl sm:text-3xl font-black text-foreground">{totalProcessed}</h2>
              <div className="flex items-center gap-2 mt-1">
                <div className="w-full bg-muted rounded-full h-1.5 w-20 sm:w-24 overflow-hidden">
                  <div className="bg-green-500 h-1.5 rounded-full transition-all duration-1000 ease-out" style={{ width: `${processedPercent}%` }} />
                </div>
                <span className="text-[10px] sm:text-xs font-bold text-green-600">{processedPercent}% <span className="text-muted-foreground text-[8px] sm:text-[10px] font-normal">/ 10k</span></span>
              </div>
            </div>
          </div>

          <div className="p-4 sm:p-6 rounded-3xl bg-card border border-border/50 shadow-sm flex items-center gap-4 sm:gap-6 relative overflow-hidden group">
            <div className="absolute -right-4 -top-4 w-24 h-24 bg-orange-500/5 rounded-full blur-xl group-hover:bg-orange-500/10 transition-colors" />
            <div className="w-12 h-12 sm:w-14 sm:h-14 rounded-2xl bg-orange-500/10 text-orange-500 flex items-center justify-center shrink-0">
              <Timer size={24} className="sm:w-[28px] sm:h-[28px]" />
            </div>
            <div>
              <p className="text-xs sm:text-sm font-medium text-muted-foreground mb-1">En attente / cours</p>
              <h2 className="text-2xl sm:text-3xl font-black text-foreground">{kpi.pending + kpi.processing}</h2>
              <p className="text-[10px] sm:text-xs text-muted-foreground mt-1">
                <span className="text-orange-500 font-medium">{kpi.pending} en attente</span> • <span className="text-blue-500 font-medium">{kpi.processing} en cours</span>
              </p>
            </div>
          </div>
        </div>

        {/* Status Distribution */}
        <div className="p-6 rounded-3xl bg-card border border-border/50 shadow-sm">
          <h2 className="text-lg font-bold mb-6">Répartition des demandes</h2>
          <div className="flex flex-col md:flex-row items-center gap-12">
            <div 
              className="w-48 h-48 rounded-full shrink-0 relative flex items-center justify-center"
              style={{ background: buildConicGradient(donutSlices) }}
            >
              <div className="w-36 h-36 bg-card rounded-full flex flex-col items-center justify-center shadow-inner">
                <span className="text-sm text-muted-foreground">Total</span>
                <span className="text-2xl font-black">{kpi.totalReceived}</span>
              </div>
            </div>
            
            <div className="flex-1 grid grid-cols-2 sm:grid-cols-3 gap-4">
              <div className="flex flex-col gap-1">
                <div className="flex items-center gap-2 text-sm text-muted-foreground">
                  <div className="w-3 h-3 rounded-full" style={{ backgroundColor: C.accepted }} /> Acceptées
                </div>
                <span className="text-xl font-bold">{kpi.accepted}</span>
              </div>
              <div className="flex flex-col gap-1">
                <div className="flex items-center gap-2 text-sm text-muted-foreground">
                  <div className="w-3 h-3 rounded-full" style={{ backgroundColor: C.rejected }} /> Rejetées
                </div>
                <span className="text-xl font-bold">{kpi.rejected}</span>
              </div>
              <div className="flex flex-col gap-1">
                <div className="flex items-center gap-2 text-sm text-muted-foreground">
                  <div className="w-3 h-3 rounded-full" style={{ backgroundColor: C.unchanged }} /> Inchangées
                </div>
                <span className="text-xl font-bold">{kpi.unchanged}</span>
              </div>
              <div className="flex flex-col gap-1">
                <div className="flex items-center gap-2 text-sm text-muted-foreground">
                  <div className="w-3 h-3 rounded-full" style={{ backgroundColor: C.processing }} /> En cours
                </div>
                <span className="text-xl font-bold">{kpi.processing}</span>
              </div>
              <div className="flex flex-col gap-1">
                <div className="flex items-center gap-2 text-sm text-muted-foreground">
                  <div className="w-3 h-3 rounded-full" style={{ backgroundColor: C.pending }} /> En attente
                </div>
                <span className="text-xl font-bold">{kpi.pending}</span>
              </div>
            </div>
          </div>
        </div>

        {/* 3D Professional Chart */}
        <div className="p-6 rounded-3xl bg-card border border-border/50 shadow-sm overflow-hidden">
          <h2 className="text-lg font-bold mb-6">Volume par heure</h2>
          <div className="h-[450px] w-full">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={data?.hourly || []} margin={{ top: 20, right: 30, left: 0, bottom: 0 }}>
                <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#e5e7eb" opacity={0.5} />
                <XAxis dataKey="hour" axisLine={false} tickLine={false} tick={{ fontSize: 12, fill: '#6b7280' }} dy={10} />
                <YAxis axisLine={false} tickLine={false} tick={{ fontSize: 12, fill: '#6b7280' }} dx={-10} />
                <Tooltip 
                  contentStyle={{ borderRadius: '16px', border: 'none', boxShadow: '0 20px 25px -5px rgba(0, 0, 0, 0.1), 0 8px 10px -6px rgba(0, 0, 0, 0.1)', padding: '16px' }}
                  labelStyle={{ fontWeight: 'bold', marginBottom: '12px', fontSize: '14px', color: '#111827' }}
                  itemStyle={{ fontSize: '13px', padding: '4px 0' }}
                  cursor={{ fill: 'rgba(0,0,0,0.04)' }}
                />
                <Legend iconType="square" wrapperStyle={{ paddingTop: '20px' }} />
                
                <Bar dataKey="received" name="Reçus" fill="#facc15" radius={[2, 2, 0, 0]} barSize={8} />
                <Bar dataKey="accepted" name="Acceptés" fill="#22c55e" radius={[2, 2, 0, 0]} barSize={8} />
                <Bar dataKey="rejected" name="Rejetés" fill="#ef4444" radius={[2, 2, 0, 0]} barSize={8} />
                <Bar dataKey="pending" name="En attente" fill="#f97316" radius={[2, 2, 0, 0]} barSize={8} />
                <Bar dataKey="other" name="Autre" fill="#8b5cf6" radius={[2, 2, 0, 0]} barSize={8} />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </div>

      
          {/* ── Coach mobile stats ── */}
          <div className="grid grid-cols-1 md:grid-cols-3 gap-6 mt-6">
            <div className="neu-card flex items-center p-6 bg-gradient-to-br from-white to-slate-50 relative overflow-hidden">
              <div className="absolute -right-4 -top-4 w-24 h-24 bg-primary/5 rounded-full blur-xl" />
              <div className="p-4 bg-primary/10 rounded-2xl mr-4 shadow-inner">
                <Users size={28} className="text-primary" />
              </div>
              <div className="z-10">
                <p className="text-sm font-semibold text-muted-foreground uppercase tracking-wider">Coach Inscrits</p>
                <p className="text-3xl font-black text-slate-800 drop-shadow-sm mt-1">{data?.coach.total || 0}</p>
              </div>
            </div>
            
            <div className="neu-card flex items-center p-6 bg-gradient-to-br from-white to-slate-50 relative overflow-hidden">
              <div className="absolute -right-4 -top-4 w-24 h-24 bg-green-500/5 rounded-full blur-xl" />
              <div className="p-4 bg-green-500/10 rounded-2xl mr-4 shadow-inner">
                <UserCheck size={28} className="text-green-600" />
              </div>
              <div className="z-10">
                <p className="text-sm font-semibold text-muted-foreground uppercase tracking-wider">Coach Connectés</p>
                <p className="text-3xl font-black text-slate-800 drop-shadow-sm mt-1">{data?.coach.online || 0}</p>
              </div>
            </div>

            <div className="neu-card flex items-center p-6 bg-gradient-to-br from-white to-slate-50 relative overflow-hidden">
              <div className="absolute -right-4 -top-4 w-24 h-24 bg-slate-500/5 rounded-full blur-xl" />
              <div className="p-4 bg-slate-500/10 rounded-2xl mr-4 shadow-inner">
                <UserMinus size={28} className="text-slate-500" />
              </div>
              <div className="z-10">
                <p className="text-sm font-semibold text-muted-foreground uppercase tracking-wider">Coach Hors-Ligne</p>
                <p className="text-3xl font-black text-slate-800 drop-shadow-sm mt-1">{data?.coach.offline || 0}</p>
              </div>
            </div>
          </div>


          {/* ── Table Localité ── */}
          <div className="neu-card mt-6">
            <h2 className="font-semibold text-foreground mb-4 flex items-center gap-2">
              <MapPin size={17} className="text-primary" />
              Statistiques par localité (Aujourd'hui)
            </h2>
            <div className="w-full max-w-full overflow-x-auto bg-card rounded-lg border border-slate-100">
              <table className="w-full text-sm text-left">
                <thead className="bg-primary text-primary-foreground">
                  <tr>
                    <th className="px-4 py-3 font-semibold whitespace-nowrap">Localité</th>
                    <th className="px-4 py-3 font-semibold whitespace-nowrap text-center">Reçues</th>
                    <th className="px-4 py-3 font-semibold whitespace-nowrap text-center">Acceptées</th>
                    <th className="px-4 py-3 font-semibold whitespace-nowrap text-center">Rejetées</th>
                    <th className="px-4 py-3 font-semibold whitespace-nowrap text-center">Inchangées</th>
                    <th className="px-4 py-3 font-semibold whitespace-nowrap text-center">Autres</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {(!data?.locality || data.locality.length === 0) ? (
                    <tr>
                      <td colSpan={6} className="px-4 py-8 text-center text-muted-foreground">Aucune donnée de localité.</td>
                    </tr>
                  ) : (
                    data.locality.map((loc, idx) => (
                      <tr key={idx} className="hover:bg-slate-50/50 transition-colors">
                        <td className="px-4 py-3 font-medium text-slate-700 whitespace-nowrap border-l-4 border-orange-500">{loc.locality}</td>
                        <td className="px-4 py-3 text-center tabular-nums whitespace-nowrap">{loc.received}</td>
                        <td className="px-4 py-3 text-center tabular-nums whitespace-nowrap text-green-600 font-medium">{loc.accepted}</td>
                        <td className="px-4 py-3 text-center tabular-nums whitespace-nowrap text-red-600 font-medium">{loc.rejected}</td>
                        <td className="px-4 py-3 text-center tabular-nums whitespace-nowrap text-slate-500">{loc.unchanged}</td>
                        <td className="px-4 py-3 text-center tabular-nums whitespace-nowrap text-slate-400">{loc.autres}</td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>
          </div>

      </main>
    </div>
  );
}
