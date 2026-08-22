import { createContext, useContext, useEffect, useState, useCallback, type ReactNode } from 'react';

// Theme modes:
//   'light'    – soft warm-blue-gray (default)
//   'dark'     – standard dark blue-gray
//   'midnight' – deep black neumorphic
//   'warm'     – marron clair / beige chaud
//   'gray'     – gris sombre neutre
export type Theme = 'light' | 'dark' | 'midnight' | 'warm' | 'gray';

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
}

const ThemeContext = createContext<ThemeContextValue>({ theme: 'light', setTheme: () => {} });

export function ThemeProvider({ children }: { children: React.ReactNode }) {
  const [theme, setThemeState] = useState<Theme>(() => {
    const stored = localStorage.getItem('konolive-theme') as Theme | null;
    return stored ?? 'light';
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

  return (
    <ThemeContext.Provider value={{ theme, setTheme }}>
      {children}
    </ThemeContext.Provider>
  );
}

export function useTheme() {
  return useContext(ThemeContext);
}
