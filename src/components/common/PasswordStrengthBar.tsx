/**
 * Indicateur visuel de la force d'un mot de passe
 */
import { getPasswordStrength } from '@/lib/security';

interface Props {
  password: string;
  show?: boolean;  // n'affiche que si password non vide
}

export default function PasswordStrengthBar({ password, show = true }: Props) {
  if (!show || !password) return null;

  const { score, label, color, suggestions } = getPasswordStrength(password);

  const segments = [0, 1, 2, 3];
  const segColors: Record<number, string> = {
    0: '#ef4444',
    1: '#f97316',
    2: '#eab308',
    3: '#22c55e',
  };

  return (
    <div className="space-y-1.5 mt-1">
      {/* Barres de progression */}
      <div className="flex gap-1">
        {segments.map(i => (
          <div
            key={i}
            className="h-1.5 flex-1 rounded-full transition-all duration-300"
            style={{
              background: i < score ? segColors[Math.min(score - 1, 3)] : 'hsl(var(--border))',
            }}
          />
        ))}
      </div>

      {/* Label + suggestions */}
      <div className="flex items-center justify-between">
        <span className={`text-xs font-semibold ${color}`}>
          Force : {label}
        </span>
        {suggestions.length > 0 && (
          <span className="text-xs text-muted-foreground truncate max-w-[60%] text-right">
            {suggestions[0]}
          </span>
        )}
      </div>
    </div>
  );
}
