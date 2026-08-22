import React, { useEffect, useState } from 'react';
import MainLayout from '@/components/layouts/MainLayout';
import { Card, CardHeader, CardTitle, CardContent } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { Loader2, Plus, Trash2, Settings } from 'lucide-react';
import { getProcessingOptions, addProcessingOption, removeProcessingOption } from '@/lib/api';
import type { ProcessingOption } from '@/types/index';
import { toast } from 'sonner';

const COLUMNS = [
  { id: 'constat_webcare', label: 'CONSTAT WEBCARE' },
  { id: 'type_de_piece', label: 'TYPE DE PIECE' },
  { id: 'verbatim', label: 'VERBATIM' },
  { id: 'action_prise_gsm', label: 'ACTION PRISE GSM' },
  { id: 'statut_final_gsm', label: 'STATUT FINAL GSM' },
  { id: 'traitement', label: 'TRAITEMENT' },
  { id: 'type_d_identification', label: "TYPE D'IDENTIFICATION" },
  { id: 'raison_du_retard', label: 'RAISON DU RETARD' }
];

export default function SupervisorProcessingOptionsPage() {
  const [options, setOptions] = useState<ProcessingOption[]>([]);
  const [loading, setLoading] = useState(true);
  const [newValues, setNewValues] = useState<Record<string, string>>({});
  const [adding, setAdding] = useState<Record<string, boolean>>({});

  useEffect(() => {
    loadOptions();
  }, []);

  async function loadOptions() {
    try {
      const data = await getProcessingOptions();
      setOptions(data);
    } catch (err) {
      console.error(err);
      toast.error('Erreur lors du chargement des options');
    } finally {
      setLoading(false);
    }
  }

  const handleAddOption = async (column_name: string) => {
    const val = newValues[column_name]?.trim();
    if (!val) return;
    
    setAdding(prev => ({ ...prev, [column_name]: true }));
    try {
      const newOpt = await addProcessingOption(column_name, val);
      setOptions(prev => [...prev, newOpt]);
      setNewValues(prev => ({ ...prev, [column_name]: '' }));
      toast.success('Option ajoutée');
    } catch (err: any) {
      console.error(err);
      if (err.code === '23505') {
        toast.error('Cette option existe déjà');
      } else {
        toast.error('Erreur lors de l\'ajout de l\'option');
      }
    } finally {
      setAdding(prev => ({ ...prev, [column_name]: false }));
    }
  };

  const handleRemoveOption = async (id: string) => {
    try {
      await removeProcessingOption(id);
      setOptions(prev => prev.filter(o => o.id !== id));
      toast.success('Option supprimée');
    } catch (err) {
      console.error(err);
      toast.error('Erreur lors de la suppression');
    }
  };

  if (loading) {
    return (
      <MainLayout>
        <div className="flex items-center justify-center h-full">
          <Loader2 className="animate-spin text-primary" size={32} />
        </div>
      </MainLayout>
    );
  }

  return (
    <MainLayout>
      <div className="max-w-6xl mx-auto space-y-6">
        <div>
          <h1 className="text-2xl font-bold text-foreground flex items-center gap-2">
            <Settings size={24} className="text-primary" />
            Configuration des Options de Traitement
          </h1>
          <p className="text-muted-foreground mt-1">
            Gérez les options disponibles dans les listes déroulantes du tableau de traitement pour les agents.
          </p>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
          {COLUMNS.map(col => {
            const colOptions = options.filter(o => o.column_name === col.id);
            return (
              <Card key={col.id} className="flex flex-col h-full shadow-sm hover:shadow-md transition-shadow">
                <CardHeader className="bg-muted/30 pb-3 border-b border-border/50">
                  <CardTitle className="text-base font-semibold">{col.label}</CardTitle>
                </CardHeader>
                <CardContent className="flex-1 p-4 flex flex-col gap-4">
                  <div className="flex gap-2">
                    <Input
                      placeholder="Nouvelle option..."
                      value={newValues[col.id] || ''}
                      onChange={e => setNewValues(prev => ({ ...prev, [col.id]: e.target.value }))}
                      onKeyDown={e => {
                        if (e.key === 'Enter') {
                          handleAddOption(col.id);
                        }
                      }}
                      className="text-sm h-9"
                    />
                    <Button 
                      size="sm" 
                      onClick={() => handleAddOption(col.id)} 
                      disabled={adding[col.id] || !newValues[col.id]?.trim()}
                      className="shrink-0 h-9"
                    >
                      {adding[col.id] ? <Loader2 size={16} className="animate-spin" /> : <Plus size={16} />}
                    </Button>
                  </div>
                  
                  <div className="flex-1 overflow-y-auto max-h-60 border border-border/50 rounded-md bg-background divide-y divide-border/50 scrollbar-thin">
                    {colOptions.length === 0 ? (
                      <div className="p-4 text-center text-sm text-muted-foreground italic">
                        Aucune option configurée
                      </div>
                    ) : (
                      colOptions.map(opt => (
                        <div key={opt.id} className="flex items-center justify-between p-2.5 hover:bg-muted/20 text-sm group transition-colors">
                          <span className="truncate pr-2">{opt.option_value}</span>
                          <Button
                            variant="ghost"
                            size="icon"
                            className="h-7 w-7 text-muted-foreground opacity-0 group-hover:opacity-100 hover:text-destructive hover:bg-destructive/10 transition-all shrink-0"
                            onClick={() => handleRemoveOption(opt.id)}
                          >
                            <Trash2 size={14} />
                          </Button>
                        </div>
                      ))
                    )}
                  </div>
                </CardContent>
              </Card>
            );
          })}
        </div>
      </div>
    </MainLayout>
  );
}
