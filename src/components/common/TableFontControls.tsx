import React from 'react';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { Type, ALargeSmall } from 'lucide-react';

// ── Options partagées ─────────────────────────────────────────────────────────
export const TABLE_FONT_OPTIONS = [
  { label: 'Calibri Light (en-têtes)', value: "'Calibri Light', 'Calibri', sans-serif" },
  { label: 'Calibri (corps)',          value: "'Calibri', sans-serif" },
  { label: 'Arial',                   value: 'Arial, sans-serif' },
  { label: 'Times New Roman',         value: "'Times New Roman', serif" },
  { label: 'Verdana',                 value: 'Verdana, sans-serif' },
  { label: 'Tahoma',                  value: 'Tahoma, sans-serif' },
];

export const TABLE_SIZE_OPTIONS = [8, 9, 10, 11, 12, 13, 14, 15];

// ── État par défaut ───────────────────────────────────────────────────────────
export const TABLE_FONT_DEFAULT  = TABLE_FONT_OPTIONS[1].value; // Calibri (corps)
export const TABLE_SIZE_DEFAULT  = 13;

// ── Props ─────────────────────────────────────────────────────────────────────
interface TableFontControlsProps {
  fontFamily: string;
  setFontFamily: (v: string) => void;
  fontSize: number;
  setFontSize: (v: number) => void;
  /** Variante de couleur des boutons : 'dark' pour fond sombre (dialog brown), 'light' pour fond clair (neu-flat) */
  variant?: 'light' | 'dark';
}

// ── Composant ─────────────────────────────────────────────────────────────────
export default function TableFontControls({
  fontFamily, setFontFamily, fontSize, setFontSize, variant = 'light',
}: TableFontControlsProps) {
  const btnCls = variant === 'dark'
    ? 'flex items-center gap-1.5 px-2.5 py-1.5 rounded-xl text-xs font-medium border border-white/30 text-white hover:bg-white/10 transition-colors'
    : 'flex items-center gap-1.5 neu-flat px-2.5 py-1.5 rounded-xl text-xs font-medium hover:text-primary transition-colors';

  return (
    <>
      {/* ── Bouton Police ── */}
      <Popover>
        <PopoverTrigger asChild>
          <button className={btnCls} title="Modifier la police">
            <Type size={14} className={variant === 'dark' ? 'text-yellow-300' : 'text-primary'} />
            <span className="hidden md:inline">Police</span>
          </button>
        </PopoverTrigger>
        <PopoverContent className="w-[230px] p-1 z-[9999]" align="start" side="bottom" avoidCollisions>
          <p className="text-[10px] font-bold uppercase text-muted-foreground px-2 py-1.5 border-b">
            Polices de thème
          </p>
          {TABLE_FONT_OPTIONS.map(f => (
            <button key={f.value} onClick={() => setFontFamily(f.value)}
              className={`w-full text-left text-xs px-3 py-1.5 rounded hover:bg-accent transition-colors
                ${fontFamily === f.value ? 'bg-primary/10 text-primary font-semibold' : 'text-foreground'}`}
              style={{ fontFamily: f.value }}>
              {f.label}
            </button>
          ))}
        </PopoverContent>
      </Popover>

      {/* ── Bouton Taille ── */}
      <Popover>
        <PopoverTrigger asChild>
          <button className={btnCls} title="Modifier la taille du texte">
            <ALargeSmall size={14} className={variant === 'dark' ? 'text-yellow-300' : 'text-primary'} />
            <span className="hidden md:inline">{fontSize}pt</span>
          </button>
        </PopoverTrigger>
        <PopoverContent className="w-[110px] p-1 z-[9999]" align="start" side="bottom" avoidCollisions>
          <p className="text-[10px] font-bold uppercase text-muted-foreground px-2 py-1.5 border-b">
            Taille
          </p>
          {TABLE_SIZE_OPTIONS.map(s => (
            <button key={s} onClick={() => setFontSize(s)}
              className={`w-full text-left text-xs px-3 py-1.5 rounded hover:bg-accent transition-colors
                ${fontSize === s ? 'bg-primary/10 text-primary font-bold' : 'text-foreground'}`}>
              {s}
            </button>
          ))}
        </PopoverContent>
      </Popover>
    </>
  );
}
