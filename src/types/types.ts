export type UserRole = 'applicant' | 'agent' | 'supervisor' | 'admin';
export type RequestStatus = 'pending' | 'processing' | 'accepted' | 'rejected' | 'unchanged' | 'other';
export type NotificationType = 'new_request' | 'request_assigned' | 'status_changed' | 'new_message' | 'call_started' | 'call_ended' | 'recall_request';

export interface Profile {
  id: string;
  username: string;
  email: string | null;
  phone: string | null;
  locality: string | null;
  role: UserRole;
  is_online?: boolean;
  last_auto_assigned_at?: string | null;
  is_paused?: boolean;
  is_logged_in: boolean;
  login_token: string | null;
  manual_next_request?: boolean;
  avatar_url: string | null;
  created_at: string;
  updated_at: string;
}

export interface VerificationRequest {
  id: string;
  applicant_id: string;
  agent_id: string | null;
  phone_to_certify: string;
  status: RequestStatus;
  notes: string | null;
  created_at: string;
  updated_at: string;
  processed_at: string | null;
  processing_duration_seconds: number | null;
  processing_started_at: string | null;
  assignment_source?: 'automatic' | 'manual';
  assigned_at?: string | null;
  applicant?: Profile;
  agent?: Profile;
  /** PostgREST returns array for one-to-many FK; normalise with resolveDocuments() */
  documents?: RequestDocument | RequestDocument[];
}

export interface RequestDocument {
  id: string;
  request_id: string;
  doc_front_url: string | null;
  doc_back_url: string | null;
  live_photo_url: string | null;
  created_at: string;
}

export interface VideoCall {
  id: string;
  request_id: string;
  agent_id: string;
  applicant_id: string;
  status: 'initiated' | 'ringing' | 'active' | 'ended' | 'rejected' | 'missed';
  started_at: string | null;
  ended_at: string | null;
  duration_seconds: number | null;
  created_at: string;
}

export interface Message {
  id: string;
  request_id: string;
  sender_id: string;
  receiver_id: string;
  content: string;
  is_read: boolean;
  created_at: string;
  sender?: Profile;
}

export interface Notification {
  id: string;
  user_id: string;
  type: NotificationType;
  title: string;
  body: string;
  is_read: boolean;
  request_id: string | null;
  created_at: string;
}

export interface ActivityLog {
  id: string;
  user_id: string | null;
  action: string;
  details: Record<string, unknown> | null;
  ip_address: string | null;
  created_at: string;
  user?: Profile;
}

export interface AgentStats {
  agent: Profile;
  total_processed: number;
  accepted: number;
  rejected: number;
  unchanged: number;
  avg_processing_seconds: number | null;
  today_processed: number;
}

export interface InternalMessage {
  id: string;
  sender_id: string;
  receiver_id: string;
  content: string | null;
  image_url: string | null;
  audio_url: string | null;
  is_read: boolean;
  created_at: string;
  sender?: Profile;
  receiver?: Profile;
}

export interface InternalCall {
  id: string;
  initiator_id: string;
  participants: string[];
  status: 'initiated' | 'active' | 'ended';
  started_at: string | null;
  ended_at: string | null;
  created_at: string;
}

export interface GlobalStats {
  total_today: number;
  total_all: number;
  accepted: number;
  rejected: number;
  unchanged: number;
  pending: number;
  processing: number;
}
