import React, { useState, useRef, useEffect } from 'react';
import { Sun, Moon, MoonStar, Coffee, Layers } from 'lucide-react';
import { useTheme, type Theme } from '@/contexts/ThemeContext';
import { cn } from '@/lib/utils';

const OPTIONS: { value: Theme; label: string; icon: React.ReactNode }[] = [
  { value: 'light',    label: 'Clair',         icon: <Sun     size={15} /> },
  { value: 'warm',     label: 'Marron clair',  icon: <Coffee  size={15} /> },
  { value: 'dark',     label: 'Sombre',        icon: <Moon    size={15} /> },
  { value: 'gray',     label: 'Gris sombre',   icon: <Layers  size={15} /> },
  { value: 'midnight', label: 'Minuit',        icon: <MoonStar size={15} /> },
];

export default function ThemeToggle() {
  const { theme, setTheme } = useTheme();
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  // Close on outside click
  useEffect(() => {
    function handle(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    }
    document.addEventListener('mousedown', handle);
    return () => document.removeEventListener('mousedown', handle);
  }, []);

  const current = OPTIONS.find(o => o.value === theme) ?? OPTIONS[0];

  return (
    <div ref={ref} className="relative">
      <button
        onClick={() => setOpen(p => !p)}
        title="Changer le thème"
        className={cn(
          'w-9 h-9 rounded-xl flex items-center justify-center transition-all duration-200',
          'text-sidebar-foreground hover:bg-sidebar-accent hover:text-sidebar-accent-foreground',
          open && 'bg-sidebar-accent text-sidebar-accent-foreground'
        )}
      >
        {current.icon}
      </button>

      {open && (
        <div className="absolute bottom-full left-1/2 -translate-x-1/2 mb-2 w-36 rounded-xl overflow-hidden z-50 shadow-xl"
          style={{ background: 'hsl(var(--sidebar-background))', border: '1px solid hsl(var(--sidebar-border))' }}>
          {OPTIONS.map(opt => (
            <button
              key={opt.value}
              onClick={() => { setTheme(opt.value); setOpen(false); }}
              className={cn(
                'w-full flex items-center gap-2.5 px-3 py-2.5 text-sm transition-colors',
                theme === opt.value
                  ? 'text-sidebar-primary-foreground bg-sidebar-primary font-semibold'
                  : 'text-sidebar-foreground hover:bg-sidebar-accent hover:text-sidebar-accent-foreground'
              )}
            >
              {opt.icon}
              <span>{opt.label}</span>
              {theme === opt.value && (
                <span className="ml-auto w-2 h-2 rounded-full bg-current" />
              )}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
