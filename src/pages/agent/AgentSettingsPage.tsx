import React, { useState, useEffect } from 'react';
import MainLayout from '@/components/layouts/MainLayout';
import { useAuth } from '@/contexts/AuthContext';
import { supabase } from '@/lib/supabase';
import { toast } from 'sonner';
import { Switch } from '@/components/ui/switch';
import { Label } from '@/components/ui/label';
import { Settings, Save } from 'lucide-react';

export default function AgentSettingsPage() {
  const { profile } = useAuth();
  const [manualNextRequest, setManualNextRequest] = useState(profile?.manual_next_request ?? false);
  const [saving, setSaving] = useState(false);

  // Charger la valeur réelle depuis la DB au montage
  useEffect(() => {
    async function loadSettings() {
      if (!profile) return;
      const { data, error } = await supabase
        .from('profiles')
        .select('manual_next_request')
        .eq('id', profile.id)
        .single();
      if (!error && data) {
        setManualNextRequest(data.manual_next_request ?? false);
      }
    }
    loadSettings();
  }, [profile]);

  const handleSave = async () => {
    if (!profile) return;
    setSaving(true);
    const { error } = await supabase
      .from('profiles')
      .update({ manual_next_request: manualNextRequest })
      .eq('id', profile.id);

    if (error) {
      toast.error('Erreur lors de la sauvegarde des paramètres');
      console.error(error);
      setSaving(false);
    } else {
      toast.success('Paramètres sauvegardés avec succès');
      // Recharger la page pour forcer la mise à jour du AuthContext
      setTimeout(() => {
        window.location.reload();
      }, 500);
    }
  };

  return (
    <MainLayout>
      <div className="max-w-xl mx-auto space-y-6">
        <div className="flex items-center gap-3 mb-6">
          <div className="w-12 h-12 rounded-xl bg-primary/10 flex items-center justify-center shrink-0">
            <Settings size={24} className="text-primary" />
          </div>
          <div>
            <h2 className="font-bold text-xl text-foreground">Préférences</h2>
            <p className="text-sm text-muted-foreground">Gérez votre expérience de travail</p>
          </div>
        </div>

        <div className="neu-card space-y-6">
          <div className="flex items-start gap-4">
            <div className="flex-1 space-y-2">
              <Label htmlFor="manual-next" className="text-base font-semibold">Passage manuel aux demandes suivantes</Label>
              <p className="text-sm text-muted-foreground text-pretty">
                Si activé, l'application ne vous attribuera pas automatiquement une nouvelle demande après la clôture d'une demande. Le bouton "Passer à une autre demande" s'affichera.
              </p>
            </div>
            <div className="shrink-0 pt-1">
              <Switch 
                id="manual-next" 
                checked={manualNextRequest}
                onCheckedChange={setManualNextRequest}
              />
            </div>
          </div>

          <div className="pt-4 border-t border-border flex justify-end">
            <button
              onClick={handleSave}
              disabled={saving}
              className="px-5 py-2.5 bg-primary text-primary-foreground font-semibold rounded-xl hover:bg-primary/90 transition-colors shadow-sm disabled:opacity-50 flex items-center gap-2"
            >
              <Save size={18} />
              {saving ? 'Enregistrement...' : 'Sauvegarder'}
            </button>
          </div>
        </div>
      </div>
    </MainLayout>
  );
}
