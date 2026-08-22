export interface Option {
  label: string;
  value: string;
  icon?: React.ComponentType<{ className?: string }>;
  withCount?: boolean;
}

// Re-export types used by api.ts and pages
export type { ProcessingOption, ProcessingDetails } from '@/types/api-types';
