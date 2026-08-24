import { createContext, useContext, useEffect, useState, useCallback } from 'react';
import { supabase } from '@/lib/supabase';

// Theme modes:
//   'light'    – soft warm-blue-gray (default)
//   'dark'     – standard dark blue-gray
//   'midnight' – deep black neumorphic
//   'warm'     – marron clair / beige chaud
//   'gray'     – gris sombre neutre
export type Theme = 'light' | 'dark' | 'midnight' | 'warm' | 'gray';

const DEFAULT_PRIMARY_COLOR = '#e53935';
const HEX_COLOR = /^#[0-9a-fA-F]{6}$/;

const ALL_CLASSES = ['dark', 'midnight', 'warm', 'gray-dark'] as const;

// Maps Theme value → CSS classes to apply
const THEME_CLASSES: Record<Theme, string[]> = {
  light:    [],
  dark:     ['dark'],
  midnight: ['dark', 'midnight'],
  warm:     ['warm'],
  gray:     ['dark', 'gray-dark'],
};

interface ThemeContextValue {
  theme: Theme;
  setTheme: (t: Theme) => void;
  primaryColor: string;
  setPrimaryColor: (color: string) => void;
}

const ThemeContext = createContext<ThemeContextValue>({
  theme: 'light',
  setTheme: () => {},
  primaryColor: DEFAULT_PRIMARY_COLOR,
  setPrimaryColor: () => {},
});

function normalizeColor(color: string | null | undefined): string {
  const normalized = color?.trim().toUpperCase() ?? '';
  return HEX_COLOR.test(normalized) ? normalized : DEFAULT_PRIMARY_COLOR;
}

function hexToHsl(hex: string): string {
  const normalized = normalizeColor(hex).slice(1);
  const red = parseInt(normalized.slice(0, 2), 16) / 255;
  const green = parseInt(normalized.slice(2, 4), 16) / 255;
  const blue = parseInt(normalized.slice(4, 6), 16) / 255;
  const max = Math.max(red, green, blue);
  const min = Math.min(red, green, blue);
  const lightness = (max + min) / 2;
  const delta = max - min;
  const saturation = delta === 0 ? 0 : delta / (1 - Math.abs(2 * lightness - 1));
  let hue = 0;

  if (delta !== 0) {
    if (max === red) hue = 60 * (((green - blue) / delta) % 6);
    else if (max === green) hue = 60 * ((blue - red) / delta + 2);
    else hue = 60 * ((red - green) / delta + 4);
  }

  if (hue < 0) hue += 360;
  return `${Math.round(hue)} ${Math.round(saturation * 100)}% ${Math.round(lightness * 100)}%`;
}

function shade(hex: string, factor: number): string {
  const normalized = normalizeColor(hex).slice(1);
  const channels = [0, 2, 4].map((offset) => {
    const value = parseInt(normalized.slice(offset, offset + 2), 16);
    return Math.max(0, Math.min(255, Math.round(value * factor))).toString(16).padStart(2, '0');
  });
  return `#${channels.join('')}`.toUpperCase();
}

function rgba(hex: string, alpha: number): string {
  const normalized = normalizeColor(hex).slice(1);
  const red = parseInt(normalized.slice(0, 2), 16);
  const green = parseInt(normalized.slice(2, 4), 16);
  const blue = parseInt(normalized.slice(4, 6), 16);
  return `rgba(${red}, ${green}, ${blue}, ${alpha})`;
}

function foregroundFor(hex: string): string {
  const normalized = normalizeColor(hex).slice(1);
  const red = parseInt(normalized.slice(0, 2), 16);
  const green = parseInt(normalized.slice(2, 4), 16);
  const blue = parseInt(normalized.slice(4, 6), 16);
  const luminance = (0.2126 * red + 0.7152 * green + 0.0722 * blue) / 255;
  return luminance > 0.58 ? '0 0% 15%' : '0 0% 100%';
}

function applyPrimaryColor(color: string) {
  const normalized = normalizeColor(color);
  const darker = shade(normalized, 0.82);
  const hsl = hexToHsl(normalized);
  const gradient = `linear-gradient(135deg, ${normalized}, ${darker})`;
  const shadow = `0 4px 16px ${rgba(normalized, 0.38)}`;
  const root = document.documentElement;

  root.style.setProperty('--konolive-primary-hsl', hsl);
  root.style.setProperty('--konolive-primary-foreground', foregroundFor(normalized));
  root.style.setProperty('--konolive-primary-hex', normalized);
  root.style.setProperty('--konolive-primary-gradient', gradient);
  root.style.setProperty('--konolive-primary-shadow', shadow);
  root.style.setProperty('--primary', hsl, 'important');
  root.style.setProperty('--ring', hsl, 'important');
  root.style.setProperty('--sidebar-primary', hsl, 'important');
  root.style.setProperty('--primary-foreground', foregroundFor(normalized), 'important');
  root.style.setProperty('--gradient-primary', gradient, 'important');
  root.style.setProperty('--shadow-primary', shadow, 'important');
  root.style.setProperty('--neu-accent', normalized, 'important');
  root.style.setProperty('--neu-accent-gradient', gradient, 'important');
  root.style.setProperty('--neu-shadow-primary', shadow, 'important');
}

export function ThemeProvider({ children }: { children: React.ReactNode }) {
  const [theme, setThemeState] = useState<Theme>(() => {
    const stored = localStorage.getItem('konolive-theme') as Theme | null;
    return stored ?? 'light';
  });
  const [primaryColor, setPrimaryColorState] = useState(() => {
    const stored = localStorage.getItem('konolive-primary-color');
    return normalizeColor(stored);
  });

  useEffect(() => {
    const root = document.documentElement;
    // Remove all theme classes first
    ALL_CLASSES.forEach(c => root.classList.remove(c));
    // Apply the classes for the selected theme
    THEME_CLASSES[theme].forEach(c => root.classList.add(c));
    localStorage.setItem('konolive-theme', theme);
  }, [theme]);

  const setTheme = useCallback((t: Theme) => { setThemeState(t); }, []);
  const setPrimaryColor = useCallback((color: string) => {
    setPrimaryColorState(normalizeColor(color));
  }, []);

  useEffect(() => {
    applyPrimaryColor(primaryColor);
    localStorage.setItem('konolive-primary-color', primaryColor);
  }, [primaryColor]);

  useEffect(() => {
    let mounted = true;

    async function loadPrimaryColor() {
      const { data } = await supabase
        .from('app_settings')
        .select('value')
        .eq('key', 'site_primary_color')
        .maybeSingle();
      const storedValue = typeof data?.value === 'string'
        ? data.value
        : data?.value && typeof data.value === 'object' && 'hex' in data.value
          ? String(data.value.hex ?? '')
          : '';
      if (mounted && HEX_COLOR.test(storedValue.trim())) setPrimaryColorState(normalizeColor(storedValue));
    }

    loadPrimaryColor();
    const { data: authListener } = supabase.auth.onAuthStateChange((_event, session) => {
      if (session) void loadPrimaryColor();
    });

    return () => {
      mounted = false;
      authListener.subscription.unsubscribe();
    };
  }, []);

  return (
    <ThemeContext.Provider value={{ theme, setTheme, primaryColor, setPrimaryColor }}>
      {children}
    </ThemeContext.Provider>
  );
}

export function useTheme() {
  return useContext(ThemeContext);
}
