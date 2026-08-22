// Types pour les options de traitement et les détails de traitement

export interface ProcessingOption {
  id: string;
  column_name: string;
  option_value: string;
  created_at: string;
}

export interface ProcessingDetails {
  id?: string;
  request_id: string;
  agent_id?: string;
  row_color?: string;
  screenshot_urls?: string[];
  created_at?: string;
  updated_at?: string;
  // Champs dynamiques configurables par colonne
  [key: string]: unknown;
}
