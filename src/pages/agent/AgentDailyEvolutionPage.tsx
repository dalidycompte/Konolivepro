import React, { useEffect, useState } from 'react';
import MainLayout from '@/components/layouts/MainLayout';
import { useAuth } from '@/contexts/AuthContext';
import { getDailyPerformances } from '@/lib/api';
import type { DailyPerformance } from '@/lib/api';
import { DailyPerformanceChart } from '@/components/DailyPerformanceChart';
import { TrendingUp, Loader2 } from 'lucide-react';

export default function AgentDailyEvolutionPage() {
  const { profile } = useAuth();
  const [data, setData] = useState<DailyPerformance[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    async function load() {
      if (!profile) return;
      const perf = await getDailyPerformances(profile.id);
      setData(perf);
      setLoading(false);
    }
    load();
  }, [profile]);

  return (
    <MainLayout>
      <div className="space-y-6 max-w-3xl mx-auto">
        <div>
          <h1 className="text-2xl font-bold text-foreground text-balance flex items-center gap-2">
            <TrendingUp size={24} className="text-primary" />
            Mon évolution quotidienne
          </h1>
          <p className="text-muted-foreground text-sm mt-1">
            Performances par jour — nombre de demandes traitées cette semaine.
          </p>
        </div>

        <div className="neu-card">
          {loading ? (
            <div className="flex items-center justify-center h-64">
              <Loader2 size={32} className="animate-spin text-primary" />
            </div>
          ) : (
            <DailyPerformanceChart data={data} />
          )}
        </div>
      </div>
    </MainLayout>
  );
}
