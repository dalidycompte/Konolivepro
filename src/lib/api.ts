import type { ProcessingOption, ProcessingDetails } from "@/types/index";
import { supabase } from './supabase';
import type {
  Profile, VerificationRequest, RequestDocument,
  Message, Notification, ActivityLog, AgentStats, GlobalStats, RequestStatus
} from '@/types/types';

// ─── PROFILES ───────────────────────────────────────────
export async function getProfile(userId: string): Promise<Profile | null> {
  const { data } = await supabase
    .from('profiles')
    .select('id,username,email,phone,locality,role,is_active,is_paused,is_logged_in,avatar_url,is_online,created_at,updated_at')
    .eq('id', userId)
    .maybeSingle();
  return data as Profile | null;
}

export async function getAllProfiles(limit = 100): Promise<Profile[]> {
  const { data } = await supabase
    .from('profiles')
    .select('id,username,email,phone,locality,role,is_active,is_paused,is_logged_in,avatar_url,is_online,created_at,updated_at')
    .order('created_at', { ascending: false })
    .limit(limit);
  return Array.isArray(data) ? (data as unknown as Profile[]) : [];
}

export async function updateProfile(userId: string, updates: Partial<Profile>) {
  return supabase.from('profiles').update(updates).eq('id', userId);
}

// ─── VERIFICATION REQUESTS ───────────────────────────────
export async function getMyRequests(applicantId: string, limit = 50): Promise<VerificationRequest[]> {
  const { data } = await supabase
    .from('verification_requests')
    .select('*, documents:request_documents(*)')
    .eq('applicant_id', applicantId)
    .order('created_at', { ascending: false })
    .limit(limit);
  return Array.isArray(data) ? data : [];
}

export async function getAllRequests(limit = 100): Promise<VerificationRequest[]> {
  const { data } = await supabase
    .from('verification_requests')
    .select('*, applicant:profiles!verification_requests_applicant_id_fkey(id,username,phone,locality), agent:profiles!verification_requests_agent_id_fkey(id,username), documents:request_documents(*)')
    .order('created_at', { ascending: false })
    .limit(limit);
  return Array.isArray(data) ? data : [];
}

export interface ProcessingRequest {
  id: string;
  applicant_id: string;
  applicant_phone?: string;
  applicant_username?: string;
  agent_id: string | null;
  agent_username: string | null;
  processing_started_at: string | null;
  created_at: string;
}

export interface PendingRequest {
  id: string;
  applicant_id: string;
  applicant_phone: string | null;
  applicant_username: string | null;
  created_at: string;
}

export type AgentPresenceStatus = 'available' | 'processing' | 'paused' | 'disconnected' | 'offline';

export interface AgentPresence {
  id: string;
  username: string;
  locality: string | null;
  is_active: boolean;
  is_online: boolean;
  is_logged_in: boolean;
  is_paused: boolean;
  active_requests: number;
}

/** Snapshot complet de présence des agents, fusionné avec les demandes en cours. */
export async function getAgentPresence(): Promise<AgentPresence[]> {
  const [{ data: profiles, error: profilesError }, { data: processing, error: processingError }] = await Promise.all([
    supabase
      .from('profiles')
      .select('id, username, locality, is_active, is_online, is_logged_in, is_paused')
      .eq('role', 'agent')
      .order('username', { ascending: true }),
    supabase
      .from('verification_requests')
      .select('agent_id')
      .eq('status', 'processing')
      .not('agent_id', 'is', null),
  ]);

  if (profilesError || processingError || !Array.isArray(profiles)) return [];
  const activeByAgent = new Map<string, number>();
  (processing ?? []).forEach((row: { agent_id: string | null }) => {
    if (row.agent_id) activeByAgent.set(row.agent_id, (activeByAgent.get(row.agent_id) ?? 0) + 1);
  });

  return profiles.map((p: any) => ({
    id: p.id,
    username: p.username ?? p.id,
    locality: p.locality ?? null,
    is_active: p.is_active !== false,
    is_online: p.is_online === true,
    is_logged_in: p.is_logged_in === true,
    is_paused: p.is_paused === true,
    active_requests: activeByAgent.get(p.id) ?? 0,
  }));
}

/** Demandes en attente */
export async function getPendingRequests(): Promise<PendingRequest[]> {
  const { data } = await supabase
    .from('verification_requests')
    .select('id, applicant_id, created_at, applicant:profiles!verification_requests_applicant_id_fkey(username,phone)')
    .eq('status', 'pending')
    .order('created_at', { ascending: true });
  if (!Array.isArray(data)) return [];
  return data.map((r: any) => ({
    id: r.id,
    applicant_id: r.applicant_id,
    applicant_phone: r.applicant?.phone ?? null,
    applicant_username: r.applicant?.username ?? null,
    created_at: r.created_at,
  }));
}

/** Demandes actuellement en cours de traitement avec nom agent + heure de début */
export async function getProcessingRequests(): Promise<ProcessingRequest[]> {
  const { data } = await supabase
    .from('verification_requests')
    .select('id, applicant_id, agent_id, processing_started_at, created_at, applicant:profiles!verification_requests_applicant_id_fkey(username,phone), agent:profiles!verification_requests_agent_id_fkey(username)')
    .eq('status', 'processing')
    .order('processing_started_at', { ascending: true });
  if (!Array.isArray(data)) return [];
  return data.map((r: any) => ({
    id: r.id,
    applicant_id: r.applicant_id,
    applicant_phone: r.applicant?.phone ?? null,
    applicant_username: r.applicant?.username ?? null,
    agent_id: r.agent_id,
    agent_username: r.agent?.username ?? null,
    processing_started_at: r.processing_started_at,
    created_at: r.created_at,
  }));
}

/** Demandes en cours depuis plus de 7 minutes (alerte superviseur) */
export interface OvertimeRequest {
  id: string;
  applicant_id: string;
  agent_id: string | null;
  processing_started_at: string;
  elapsed_minutes: number;
  applicant_username: string | null;
  applicant_phone: string | null;
  agent_username: string | null;
}

export async function getOvertimeRequests(): Promise<OvertimeRequest[]> {
  const { data, error } = await supabase.rpc('get_overtime_requests');
  if (error || !Array.isArray(data)) return [];
  return data as OvertimeRequest[];
}

/** Transfert atomique d'une demande vers un autre agent */
export async function transferRequest(requestId: string, newAgentId: string): Promise<boolean> {
  const { error } = await supabase.rpc('transfer_request', {
    p_request_id: requestId,
    p_new_agent_id: newAgentId,
  });
  return !error;
}

/** Agents actuellement en ligne (ont une demande en cours de traitement) */
export async function getOnlineAgentProfiles(): Promise<{ id: string; username: string }[]> {
  const { data } = await supabase
    .from('profiles')
    .select('id, username')
    .eq('role', 'agent')
    .eq('is_active', true)
    .eq('is_logged_in', true)
    .eq('is_online', true)
    .eq('is_paused', false);
  if (!Array.isArray(data)) return [];
  return data.map((r: any) => ({ id: r.id, username: r.username ?? r.id }));
}

/** Agents actuellement en pause */
export async function getPausedAgentProfiles(): Promise<{ id: string; username: string }[]> {
  const { data } = await supabase
    .from('profiles')
    .select('id, username')
    .eq('role', 'agent')
    .eq('is_active', true)
    .eq('is_logged_in', true)
    .eq('is_online', true)
    .eq('is_paused', true);
  if (!Array.isArray(data)) return [];
  return data.map((r: any) => ({ id: r.id, username: r.username ?? r.id }));
}

export async function getAgentRequests(agentId: string, limit = 200): Promise<VerificationRequest[]> {
  const { data } = await supabase
    .from('verification_requests')
    .select('*, applicant:profiles!verification_requests_applicant_id_fkey(id,username,phone,locality), documents:request_documents(*)')
    .or(`status.eq.pending,agent_id.eq.${agentId}`)
    .order('created_at', { ascending: false })
    .limit(limit);
  return Array.isArray(data) ? data : [];
}

export async function getRequestById(id: string): Promise<VerificationRequest | null> {
  const { data } = await supabase
    .from('verification_requests')
    .select('*, applicant:profiles!verification_requests_applicant_id_fkey(*), agent:profiles!verification_requests_agent_id_fkey(id,username), documents:request_documents(*)')
    .eq('id', id)
    .maybeSingle();
  return data;
}

export async function checkPhoneInProgress(phone: string): Promise<boolean> {
  const { data, error } = await supabase.rpc('check_phone_in_progress', { p_phone: phone });
  if (error) {
    console.error('Error checking phone:', error);
    return false;
  }
  return !!data;
}

export async function createRequest(payload: { phone_to_certify: string }) {
  return supabase
    .rpc('create_mobile_verification_request', { p_phone: payload.phone_to_certify })
    .single();
}

export async function updateRequestStatus(
  requestId: string,
  status: RequestStatus,
  agentId?: string,
  notes?: string
) {
  const updates: Partial<VerificationRequest> & { processing_duration_seconds?: number } = { status, notes: notes ?? null };
  if (agentId) updates.agent_id = agentId;

  // Enregistre l'heure de début de traitement dès que la demande passe en "processing"
  if (status === 'processing') {
    (updates as any).processing_started_at = new Date().toISOString();
  }

  if (['accepted', 'rejected', 'unchanged', 'other'].includes(status)) {
    const now = new Date();
    updates.processed_at = now.toISOString();

    // Compute processing duration from processing_started_at
    const { data: current } = await supabase
      .from('verification_requests')
      .select('processing_started_at')
      .eq('id', requestId)
      .maybeSingle();

    if (current?.processing_started_at) {
      const startedAt = new Date(current.processing_started_at);
      const durationSec = Math.round((now.getTime() - startedAt.getTime()) / 1000);
      if (durationSec > 0) updates.processing_duration_seconds = durationSec;
    }
  }

  return supabase.from('verification_requests').update(updates).eq('id', requestId);
}

/**
 * Manual claim: explicitly assigns a pending request to the connected agent.
 * The server permits a second active request only through this manual path;
 * automatic assignment is limited to one active request per agent.
 * Returns { data, error } — error.message starts with 'AGENT_BUSY' or 'REQUEST_UNAVAILABLE'.
 */
export async function claimRequest(requestId: string, agentId: string) {
  const { data, error } = await supabase
    .rpc('claim_request', { p_request_id: requestId, p_agent_id: agentId })
    .single();
  return { data, error };
}

// ─── DOCUMENTS ───────────────────────────────────────────
export async function upsertDocuments(doc: Partial<RequestDocument> & { request_id: string }) {
  const { error } = await supabase.from('request_documents').upsert(doc, { onConflict: 'request_id' });
  return { error };
}

// ─── MESSAGES ────────────────────────────────────────────
export async function getMessages(requestId: string, limit = 100): Promise<Message[]> {
  const { data } = await supabase
    .from('messages')
    .select('*, sender:profiles!messages_sender_id_fkey(id,username,role)')
    .eq('request_id', requestId)
    .order('created_at', { ascending: true })
    .limit(limit);
  return Array.isArray(data) ? data : [];
}

export async function sendMessage(payload: {
  request_id: string;
  sender_id: string;
  receiver_id: string;
  content: string;
}) {
  return supabase.from('messages').insert(payload);
}

export async function markMessagesRead(requestId: string, userId: string) {
  return supabase
    .from('messages')
    .update({ is_read: true })
    .eq('request_id', requestId)
    .eq('receiver_id', userId);
}

// ─── NOTIFICATIONS ───────────────────────────────────────
export async function getNotifications(userId: string, limit = 30): Promise<Notification[]> {
  const { data } = await supabase
    .from('notifications')
    .select('id,user_id,type,title,body,is_read,request_id,created_at')
    .eq('user_id', userId)
    .order('created_at', { ascending: false })
    .limit(limit);
  return Array.isArray(data) ? (data as unknown as Notification[]) : [];
}

export async function markNotificationRead(notificationId: string) {
  return supabase.from('notifications').update({ is_read: true }).eq('id', notificationId);
}

export async function markAllNotificationsRead(userId: string) {
  return supabase.from('notifications').update({ is_read: true }).eq('user_id', userId).eq('is_read', false);
}

export async function createNotification(payload: {
  user_id: string;
  type: string;
  title: string;
  body: string;
  request_id?: string;
}) {
  return supabase.from('notifications').insert(payload);
}

// ─── VIDEO CALLS ─────────────────────────────────────────
export async function createVideoCall(payload: {
  request_id: string;
  agent_id: string;
  applicant_id: string;
}) {
  const { data } = await supabase
    .from('video_calls')
    .insert({ ...payload, status: 'initiated' })
    .select()
    .maybeSingle();
  return data;
}

export async function updateVideoCall(callId: string, updates: {
  status?: string;
  started_at?: string;
  ended_at?: string;
  duration_seconds?: number;
}) {
  return supabase.from('video_calls').update(updates).eq('id', callId);
}

// ─── INTERNAL MESSAGES (agent ↔ agent/supervisor) ────────

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

/** Fetch conversation between two users */
export async function getInternalMessages(userId: string, contactId: string, limit = 100): Promise<InternalMessage[]> {
  const { data } = await supabase
    .from('internal_messages')
    .select('*, sender:profiles!internal_messages_sender_id_fkey(id,username,role,avatar_url)')
    .or(`and(sender_id.eq.${userId},receiver_id.eq.${contactId}),and(sender_id.eq.${contactId},receiver_id.eq.${userId})`)
    .order('created_at', { ascending: true })
    .limit(limit);
  return Array.isArray(data) ? (data as InternalMessage[]) : [];
}

/** List latest message per contact (for conversation list) */
export async function getInternalConversations(userId: string): Promise<InternalMessage[]> {
  const { data } = await supabase
    .from('internal_messages')
    .select('*, sender:profiles!internal_messages_sender_id_fkey(id,username,role,avatar_url), receiver:profiles!internal_messages_receiver_id_fkey(id,username,role,avatar_url)')
    .or(`sender_id.eq.${userId},receiver_id.eq.${userId}`)
    .order('created_at', { ascending: false })
    .limit(200);
  if (!Array.isArray(data)) return [];
  // Deduplicate: keep only the most recent message per contact pair
  const seen = new Set<string>();
  const result: InternalMessage[] = [];
  for (const msg of data as InternalMessage[]) {
    const key = [msg.sender_id, msg.receiver_id].sort().join('-');
    if (!seen.has(key)) { seen.add(key); result.push(msg); }
  }
  return result;
}

export async function sendInternalMessage(payload: {
  sender_id: string;
  receiver_id: string;
  content?: string;
  image_url?: string;
  audio_url?: string;
}) {
  return supabase.from('internal_messages').insert(payload);
}

export async function markInternalMessagesRead(senderId: string, receiverId: string) {
  return supabase
    .from('internal_messages')
    .update({ is_read: true })
    .eq('sender_id', senderId)
    .eq('receiver_id', receiverId)
    .eq('is_read', false);
}

export async function countUnreadInternalMessages(userId: string): Promise<number> {
  const { count } = await supabase
    .from('internal_messages')
    .select('*', { count: 'exact', head: true })
    .eq('receiver_id', userId)
    .eq('is_read', false);
  return count ?? 0;
}

/** Fetch agents and supervisors as potential contacts */
export async function getInternalContacts(): Promise<Profile[]> {
  const { data } = await supabase
    .from('profiles')
    .select('id,username,email,role,avatar_url,is_online,is_active,locality')
    .in('role', ['agent', 'supervisor'])
    .eq('is_active', true)
    .order('username');
  return Array.isArray(data) ? (data as unknown as Profile[]) : [];
}

// ─── INTERNAL CALLS ──────────────────────────────────────

export async function createInternalCall(initiatorId: string, participantIds: string[]): Promise<InternalCall | null> {
  const { data } = await supabase
    .from('internal_calls')
    .insert({ initiator_id: initiatorId, participants: participantIds, status: 'initiated' })
    .select()
    .maybeSingle();
  return data as InternalCall | null;
}

export async function updateInternalCall(callId: string, updates: { status?: string; started_at?: string; ended_at?: string }) {
  return supabase.from('internal_calls').update(updates).eq('id', callId);
}

// ─── ACTIVITY LOGS ───────────────────────────────────────
export async function getActivityLogs(limit = 100): Promise<ActivityLog[]> {
  const { data } = await supabase
    .from('activity_logs')
    .select('*, user:profiles!activity_logs_user_id_fkey(id,username,role)')
    .order('created_at', { ascending: false })
    .limit(limit);
  return Array.isArray(data) ? data : [];
}

export async function logActivity(userId: string, action: string, details?: Record<string, unknown>) {
  return supabase.from('activity_logs').insert({ user_id: userId, action, details: details ?? null });
}

// ─── STATISTICS ──────────────────────────────────────────
export interface DashboardKpi {
  total: number;
  accepted: number;
  rejected: number;
  unchanged: number;
  other: number;
  pending: number;
  processing: number;
  avg_processing_min: number;
  avg_waiting_min: number;
  hourly_rate: number;
  agents_online: number;
  agents_paused: number;
}

export interface HourlyVolumeRow {
  hour: string;       // "06h"
  received: number;
  accepted: number;
  rejected: number;
  pending: number;
  processing: number;
  unchanged: number;
  other: number;
  avgTime: number; // In seconds
}

/** Full dashboard KPIs + hourly volume for today */
export async function getDashboardKpi(): Promise<{ kpi: DashboardKpi; hourlyVolume: HourlyVolumeRow[] }> {
  // Toujours utiliser le fuseau horaire du Congo pour l'alignement strict avec la base de données
  const formatter = new Intl.DateTimeFormat('fr-CA', { timeZone: 'Africa/Brazzaville', year: 'numeric', month: '2-digit', day: '2-digit' });
  const todayStr = formatter.format(new Date());

  const [{ data: allReqs }, { data: onlineProfiles }, { data: pausedProfiles }] = await Promise.all([
    supabase.from('verification_requests')
      .select('id, status, created_at, processed_at, processing_duration_seconds, agent_id')
      .order('created_at', { ascending: false })
      .limit(5000),
    supabase.from('profiles')
      .select('id')
      .eq('role', 'agent')
      .eq('is_online', true)
      .eq('is_paused', false),
    supabase.from('profiles')
      .select('id')
      .eq('role', 'agent')
      .eq('is_online', true)
      .eq('is_paused', true),
  ]);

  const allRows = Array.isArray(allReqs) ? allReqs : [];
  
  // Strictement les demandes REÇUES aujourd'hui (Cohorte du jour, fuseau Congo)
  const rows = allRows.filter(r => {
    return formatter.format(new Date(r.created_at)) === todayStr;
  });

  const onlineCount = Array.isArray(onlineProfiles) ? onlineProfiles.length : 0;
  const pausedCount = Array.isArray(pausedProfiles) ? pausedProfiles.length : 0;

  const accepted   = rows.filter(r => r.status === 'accepted').length;
  const rejected   = rows.filter(r => r.status === 'rejected').length;
  const unchanged  = rows.filter(r => r.status === 'unchanged').length;
  const other      = rows.filter(r => r.status === 'other').length;
  
  const pending    = rows.filter(r => r.status === 'pending').length;
  const processing = rows.filter(r => r.status === 'processing').length;
  const total      = rows.length;

  const durations = rows
    .map(r => r.processing_duration_seconds)
    .filter((v): v is number => typeof v === 'number' && v > 0);
  const avg_processing_min = durations.length
    ? Math.round(durations.reduce((a, b) => a + b, 0) / durations.length / 60)
    : 0;

  // Hourly rate: completed dossiers / hours elapsed today (min 1h)
  const hourFormatter = new Intl.DateTimeFormat('fr-CA', { timeZone: 'Africa/Brazzaville', hour: 'numeric', hour12: false });
  const nowHourStr = hourFormatter.format(new Date());
  const nowHour = Math.max(parseInt(nowHourStr, 10) || 1, 1);
  const hourly_rate = Math.round((accepted + rejected + unchanged + other) / nowHour);

  // Build hourly volume map (06h–22h or 0-23h)
  const hourMap: Record<number, HourlyVolumeRow & { totalSeconds: number; countForAvg: number }> = {};
  for (let h = 0; h <= 23; h++) {
    hourMap[h] = { 
      hour: `${String(h).padStart(2,'0')}h`, 
      received: 0, accepted: 0, rejected: 0, pending: 0, processing: 0, unchanged: 0, other: 0, avgTime: 0, 
      totalSeconds: 0, countForAvg: 0 
    };
  }
  
  for (const r of rows) {
    const hStr = hourFormatter.format(new Date(r.created_at));
    const h = parseInt(hStr, 10);
    if (isNaN(h) || !hourMap[h]) continue;
    hourMap[h].received++;
    if (r.status === 'pending') hourMap[h].pending++;
    else if (r.status === 'processing') hourMap[h].processing++;
    else if (r.status === 'accepted')  hourMap[h].accepted++;
    else if (r.status === 'rejected') hourMap[h].rejected++;
    else if (r.status === 'other') hourMap[h].other++;
    else hourMap[h].unchanged++;

    if (['accepted', 'rejected', 'unchanged', 'other'].includes(r.status) && r.processing_duration_seconds) {
      hourMap[h].totalSeconds += r.processing_duration_seconds;
      hourMap[h].countForAvg++;
    }
  }

  for (const h of Object.values(hourMap)) {
    h.avgTime = h.countForAvg > 0 ? h.totalSeconds / h.countForAvg : 0;
  }

  return {
    kpi: {
      total, accepted, rejected, unchanged, other, pending, processing,
      avg_processing_min, avg_waiting_min: 0,
      hourly_rate, agents_online: onlineCount, agents_paused: pausedCount,
    },
    hourlyVolume: Object.values(hourMap),
  };
}

export async function getGlobalStats(): Promise<GlobalStats> {
  const today = new Date().toISOString().split('T')[0];
  const { data: all } = await supabase.from('verification_requests').select('status, created_at');
  const rows = Array.isArray(all) ? all : [];
  return {
    total_today: rows.filter(r => r.created_at.startsWith(today)).length,
    // Règle §14 : seuls accepted + rejected comptent comme "traités"
    total_all: rows.filter(r => ['accepted', 'rejected'].includes(r.status)).length,
    accepted: rows.filter(r => r.status === 'accepted').length,
    rejected: rows.filter(r => r.status === 'rejected').length,
    unchanged: rows.filter(r => r.status === 'unchanged').length,
    pending: rows.filter(r => r.status === 'pending').length,
    processing: rows.filter(r => r.status === 'processing').length,
  };
}

export async function getAgentStats(): Promise<AgentStats[]> {
  const today = new Date().toISOString().split('T')[0];
  const { data: agents } = await supabase.from('profiles').select('id,username,locality,is_active').eq('role', 'agent');
  // Règle §14 : charger accepted + rejected + unchanged (unchanged conservé pour info)
  const { data: requests } = await supabase
    .from('verification_requests')
    .select('agent_id, status, created_at, processing_duration_seconds')
    .in('status', ['accepted', 'rejected', 'unchanged']);

  const agentList = Array.isArray(agents) ? (agents as Pick<Profile, 'id' | 'username' | 'locality' | 'is_active'>[]) : [];
  const reqList = Array.isArray(requests) ? requests : [];

  return agentList.map(agent => {
    const agentReqs = reqList.filter(r => r.agent_id === agent.id);
    const todayReqs = agentReqs.filter(r => r.created_at?.startsWith(today));
    const durations = agentReqs.map(r => r.processing_duration_seconds).filter(Boolean) as number[];
    // §14 : total_processed = accepté + rejeté uniquement
    const accepted  = agentReqs.filter(r => r.status === 'accepted').length;
    const rejected  = agentReqs.filter(r => r.status === 'rejected').length;
    return {
      agent: agent as unknown as Profile,
      total_processed: accepted + rejected,
      accepted,
      rejected,
      unchanged: agentReqs.filter(r => r.status === 'unchanged').length,
      avg_processing_seconds: durations.length ? Math.round(durations.reduce((a, b) => a + b, 0) / durations.length) : null,
      today_processed: todayReqs.filter(r => ['accepted', 'rejected'].includes(r.status)).length,
    };
  }) as AgentStats[];
}

export interface HourlyProcessingRow {
  hour: string;           // "06:00"
  agents: number;         // distinct agents who processed in that hour
  total: number;
  pct_0_2: number;
  pct_2_5: number;
  pct_5_10: number;
  pct_10_15: number;
  pct_15_30: number;
  pct_over30: number;
}

/**
 * Builds hourly processing-time distribution from verification_requests.
 * Groups processed requests by the hour of `processed_at`, counts distinct
 * agents, total requests, and percentages across 6 duration buckets.
 */
export async function getHourlyProcessingStats(date?: string): Promise<HourlyProcessingRow[]> {
  const targetDate = date ?? new Date().toISOString().split('T')[0];

  const { data } = await supabase
    .from('verification_requests')
    .select('agent_id, processed_at, processing_duration_seconds')
    .in('status', ['accepted', 'rejected', 'unchanged'])
    .gte('processed_at', `${targetDate}T00:00:00`)
    .lte('processed_at', `${targetDate}T23:59:59`);

  const rows = Array.isArray(data) ? data : [];
  const hourFormatter = new Intl.DateTimeFormat('fr-CA', { timeZone: 'Africa/Brazzaville', hour: 'numeric', hour12: false });

  // Group by hour
  const byHour: Record<string, typeof rows> = {};
  for (const r of rows) {
    if (!r.processed_at) continue;
    const hStr = hourFormatter.format(new Date(r.processed_at));
    const h = parseInt(hStr, 10);
    if (isNaN(h)) continue;
    const key = `${String(h).padStart(2, '0')}:00`;
    if (!byHour[key]) byHour[key] = [];
    byHour[key].push(r);
  }

  // Build all 24h slots (06:00–23:00 range matching the reference image)
  const result: HourlyProcessingRow[] = [];
  for (let h = 0; h < 24; h++) {
    const key = `${String(h).padStart(2, '0')}:00`;
    const group = byHour[key] ?? [];
    if (group.length === 0) continue; // skip empty hours

    const total = group.length;
    const agents = new Set(group.map(r => r.agent_id).filter(Boolean)).size;

    const pct = (count: number) => total > 0 ? Math.round((count / total) * 1000) / 10 : 0;

    const b0_2   = group.filter(r => (r.processing_duration_seconds ?? 0) < 120).length;
    const b2_5   = group.filter(r => { const s = r.processing_duration_seconds ?? 0; return s >= 120 && s < 300; }).length;
    const b5_10  = group.filter(r => { const s = r.processing_duration_seconds ?? 0; return s >= 300 && s < 600; }).length;
    const b10_15 = group.filter(r => { const s = r.processing_duration_seconds ?? 0; return s >= 600 && s < 900; }).length;
    const b15_30 = group.filter(r => { const s = r.processing_duration_seconds ?? 0; return s >= 900 && s < 1800; }).length;
    const bOver30 = group.filter(r => (r.processing_duration_seconds ?? 0) >= 1800).length;

    result.push({ hour: key, agents, total, pct_0_2: pct(b0_2), pct_2_5: pct(b2_5), pct_5_10: pct(b5_10), pct_10_15: pct(b10_15), pct_15_30: pct(b15_30), pct_over30: pct(bOver30) });
  }

  return result.sort((a, b) => a.hour.localeCompare(b.hour));
}

// ─── HELPERS ─────────────────────────────────────────────

/** PostgREST returns request_documents as an array; normalise to single object or null */
export function resolveDocuments(req: VerificationRequest): RequestDocument | null {
  if (!req.documents) return null;
  if (Array.isArray(req.documents)) return (req.documents as RequestDocument[])[0] ?? null;
  return req.documents as RequestDocument;
}

// ─── STORAGE ─────────────────────────────────────────────
export async function uploadFile(bucket: string, path: string, file: File): Promise<string> {
  const { data, error } = await supabase.storage.from(bucket).upload(path, file, {
    upsert: true,
    contentType: file.type || 'image/jpeg',
  });
  if (error) {
    console.error(`[storage:${bucket}] upload failed`, error);
    if (error.message.toLowerCase().includes('bucket not found')) {
      throw new Error(`Le stockage « ${bucket} » n'est pas configuré sur Supabase. Appliquez la migration 00007_create_request_storage.sql.`);
    }
    if (error.message.includes('row-level security') || error.message.includes('not authorized')) {
      throw new Error(`Permissions de stockage refusées pour « ${bucket} ». Vérifiez les politiques RLS Supabase.`);
    }
    throw new Error(`Téléversement impossible pour « ${bucket} » : ${error.message}`);
  }
  if (!data?.path) throw new Error(`Téléversement impossible pour « ${bucket} » : réponse vide de Supabase.`);
  const { data: urlData } = supabase.storage.from(bucket).getPublicUrl(data.path);
  return urlData.publicUrl;
}

// ─── APK ─────────────────────────────────────────────────
/** Cache mémoire pour app_settings (TTL 5 min) — évite les lectures répétées à grande échelle */
const _settingsCache: Record<string, { value: string; expiresAt: number }> = {};
const SETTINGS_TTL = 5 * 60 * 1000;

async function getAppSetting(key: string): Promise<string | null> {
  const cached = _settingsCache[key];
  if (cached && Date.now() < cached.expiresAt) return cached.value;
  const { data, error } = await supabase
    .from('app_settings').select('value').eq('key', key).maybeSingle();
  if (error || !data) return null;
  const val = typeof data.value === 'string' ? data.value : String(data.value ?? '');
  _settingsCache[key] = { value: val, expiresAt: Date.now() + SETTINGS_TTL };
  return val;
}

const DEFAULT_REJECTION_REASONS = [
  'Document illisible',
  'Document expiré',
  'Photo non conforme',
  'Identité non vérifiable',
  'Informations incohérentes',
];

/** Récupère la liste des motifs de rejet configurés */
export async function getRejectionReasons(): Promise<string[]> {
  const { data } = await supabase
    .from('app_settings')
    .select('value')
    .eq('key', 'rejection_reasons')
    .maybeSingle();
  if (data?.value && Array.isArray(data.value)) return data.value as string[];
  return DEFAULT_REJECTION_REASONS;
}

/** Sauvegarde la liste des motifs de rejet */
export async function saveRejectionReasons(reasons: string[], updatedBy?: string): Promise<boolean> {
  const { error } = await supabase
    .from('app_settings')
    .update({ value: reasons, updated_at: new Date().toISOString(), ...(updatedBy ? { updated_by: updatedBy } : {}) })
    .eq('key', 'rejection_reasons');
  return !error;
}

const DEFAULT_OTHER_REASONS = [
  'Numéro non reconnu',
  'Demande en doublon',
  'Dossier incomplet',
  'Demande annulée par le client',
  'Autre raison',
];

/** Récupère la liste des motifs "Autre" configurés */
export async function getOtherReasons(): Promise<string[]> {
  const { data } = await supabase
    .from('app_settings')
    .select('value')
    .eq('key', 'other_reasons')
    .maybeSingle();
  if (data?.value && Array.isArray(data.value)) return data.value as string[];
  return DEFAULT_OTHER_REASONS;
}

/** Sauvegarde la liste des motifs "Autre" */
export async function saveOtherReasons(reasons: string[], updatedBy?: string): Promise<boolean> {
  const { error } = await supabase
    .from('app_settings')
    .update({ value: reasons, updated_at: new Date().toISOString(), ...(updatedBy ? { updated_by: updatedBy } : {}) })
    .eq('key', 'other_reasons');
  return !error;
}

/** Récupère les demandes "Autre" du jour avec leur motif (notes) */
export async function getTodayOtherRequests(): Promise<{ id: string; phone_to_certify: string; notes: string | null; processed_at: string | null }[]> {
  const today = new Date().toLocaleDateString('fr-CA');
  const { data } = await supabase
    .from('verification_requests')
    .select('id, phone_to_certify, notes, processed_at')
    .eq('status', 'other')
    .gte('created_at', today + 'T00:00:00')
    .lte('created_at', today + 'T23:59:59')
    .order('processed_at', { ascending: false });
  return Array.isArray(data) ? data : [];
}

/** Récupère l'URL publique de l'APK hébergé (null si aucun fichier configuré) */
export async function getApkUrl(): Promise<string | null> {
  const val = await getAppSetting('apk_url');
  if (!val || val === '""' || val === '') return null;
  return val.replace(/^"|"$/g, '');
}

/** Upload un fichier APK dans le bucket et enregistre son URL en base */
export async function uploadApk(file: File): Promise<string | null> {
  const path = `konolive-app.apk`;
  const { data, error } = await supabase.storage
    .from('apk-files')
    .upload(path, file, { upsert: true, contentType: 'application/vnd.android.package-archive' });
  if (error || !data) return null;
  const { data: urlData } = supabase.storage.from('apk-files').getPublicUrl(data.path);
  const publicUrl = urlData.publicUrl;
  await supabase
    .from('app_settings')
    .upsert({ key: 'apk_url', value: JSON.stringify(publicUrl), updated_at: new Date().toISOString() });
  return publicUrl;
}

/** Supprime le fichier APK du bucket et efface l'URL en base */
export async function deleteApk(): Promise<boolean> {
  const { error: storageError } = await supabase.storage
    .from('apk-files')
    .remove(['konolive-app.apk']);
  if (storageError) return false;
  await supabase
    .from('app_settings')
    .upsert({ key: 'apk_url', value: '', updated_at: new Date().toISOString() });
  return true;
}

export async function deleteInternalMessage(messageId: string) {
  return supabase
    .from('internal_messages')
    .delete()
    .eq('id', messageId);
}

export interface DailyPerformance {
  day_name: string;
  day_index: number;
  value: number;
}

export async function getDailyPerformances(agentId?: string): Promise<DailyPerformance[]> {
  const { data, error } = await supabase.rpc('get_daily_performances', agentId ? { p_agent_id: agentId } : {});
  if (error || !Array.isArray(data)) return [];
  return data as DailyPerformance[];
}

// Processing Options and Details

export async function getProcessingOptions() {
  const { data, error } = await supabase.from('processing_options').select('id,column_name,option_value,created_at');
  if (error) throw error;
  return data as ProcessingOption[];
}

export async function addProcessingOption(column_name: string, option_value: string) {
  const { data, error } = await supabase.rpc('add_processing_option', {
    p_column_name: column_name,
    p_option_value: option_value,
  });
  if (error) throw error;
  return data as ProcessingOption;
}

export async function removeProcessingOption(id: string) {
  const { data, error } = await supabase.rpc('remove_processing_option', {
    p_option_id: id,
  });
  if (error) throw error;
  if (data !== true) throw new Error('Option introuvable ou déjà supprimée');
}

export async function saveProcessingDetails(details: ProcessingDetails) {
  // Strip any joined/nested fields (e.g. `request`) before upserting
  const { constat_webcare, type_de_piece, verbatim, action_prise_gsm, statut_final_gsm,
          traitement, type_d_identification, raison_du_retard, screenshot_urls, row_color, request_id } = details;
  const payload = {
    request_id,
    ...(constat_webcare    !== undefined && { constat_webcare }),
    ...(type_de_piece      !== undefined && { type_de_piece }),
    ...(verbatim           !== undefined && { verbatim }),
    ...(action_prise_gsm   !== undefined && { action_prise_gsm }),
    ...(statut_final_gsm   !== undefined && { statut_final_gsm }),
    ...(traitement         !== undefined && { traitement }),
    ...(type_d_identification !== undefined && { type_d_identification }),
    ...(raison_du_retard   !== undefined && { raison_du_retard }),
    ...(screenshot_urls    !== undefined && { screenshot_urls }),
    ...(row_color          !== undefined && { row_color }),
  };
  const { data, error } = await supabase
    .from('processing_details')
    .upsert(payload, { onConflict: 'request_id' })
    .select()
    .single();
  if (error) throw error;
  return data as ProcessingDetails;
}

export async function getProcessingDetails(request_id: string) {
  const { data, error } = await supabase.from('processing_details')
    .select('id,request_id,constat_webcare,type_de_piece,verbatim,action_prise_gsm,statut_final_gsm,traitement,type_d_identification,raison_du_retard,screenshot_urls,row_color,created_at,updated_at')
    .eq('request_id', request_id).maybeSingle();
  if (error) throw error;
  return data as ProcessingDetails | null;
}

export async function getAgentRecentProcessingDetails(agent_id: string, limit: number = 50) {
  // Filtre uniquement les enregistrements créés aujourd'hui (fuseau Africa/Brazzaville = UTC+1)
  const now = new Date();
  // Début de journée locale en UTC
  const todayStart = new Date(now.getFullYear(), now.getMonth(), now.getDate(), 0, 0, 0, 0);
  // Convertit en ISO UTC (Africa/Brazzaville = UTC+1, donc on retire 1h)
  const todayStartUTC = new Date(todayStart.getTime() - 60 * 60 * 1000).toISOString();
  const todayEndUTC   = new Date(todayStart.getTime() - 60 * 60 * 1000 + 24 * 60 * 60 * 1000).toISOString();

  const { data, error } = await supabase
    .from('processing_details')
    .select(`
      *,
      request:verification_requests!inner(
        phone_to_certify,
        created_at,
        agent_id,
        applicant:profiles!applicant_id(
          username
        )
      )
    `)
    .eq('request.agent_id', agent_id)
    .gte('created_at', todayStartUTC)
    .lt('created_at', todayEndUTC)
    .order('created_at', { ascending: false })
    .limit(limit);

  if (error) throw error;
  return data as any[];
}

// Charge les détails de traitement pour n'importe quel jour (Africa/Brazzaville = UTC+1)
export async function getAgentProcessingDetailsByDate(agent_id: string, date: Date, limit = 800000) {
  // Brazzaville = UTC+1. Minuit local = 23h00 UTC la veille ; 23h59 local = 22h59 UTC du même jour.
  // On utilise Intl.DateTimeFormat pour obtenir la date réelle en fuseau Brazzaville,
  // puis on construit la plage UTC directement.
  const bzvDateStr = new Intl.DateTimeFormat('fr-CA', {
    timeZone: 'Africa/Brazzaville',
    year: 'numeric', month: '2-digit', day: '2-digit',
  }).format(date); // "YYYY-MM-DD" en heure Brazzaville

  // Minuit Brazzaville = UTC-1h (UTC+1 → minuit BZV = 23h00 UTC j-1)
  const startUTC = new Date(`${bzvDateStr}T00:00:00+01:00`).toISOString();
  const endUTC   = new Date(`${bzvDateStr}T23:59:59.999+01:00`).toISOString();

  const { data, error } = await supabase
    .from('processing_details')
    .select(`
      *,
      request:verification_requests!inner(
        phone_to_certify,
        created_at,
        agent_id,
        applicant:profiles!applicant_id(username)
      )
    `)
    .eq('request.agent_id', agent_id)
    .gte('created_at', startUTC)
    .lte('created_at', endUTC)
    .order('created_at', { ascending: false })
    .limit(limit);

  if (error) throw error;
  return (data ?? []) as any[];
}

// Retourne le nombre de traitements par jour pour un agent sur les N derniers jours
export async function getAgentDailyTreatmentCounts(agent_id: string, daysBack = 60): Promise<Record<string, number>> {
  const since = new Date();
  since.setDate(since.getDate() - daysBack);
  const sinceUTC = new Date(since.getTime() - 60 * 60 * 1000).toISOString();

  const { data, error } = await supabase
    .from('verification_requests')
    .select('processed_at')
    .eq('agent_id', agent_id)
    .in('status', ['accepted', 'rejected'])
    .gte('processed_at', sinceUTC)
    .order('processed_at', { ascending: false })
    .limit(daysBack * 1000);

  if (error) throw error;
  // Regroupe par date locale Brazzaville (UTC+1)
  const counts: Record<string, number> = {};
  const bzvFormatter = new Intl.DateTimeFormat('fr-CA', {
    timeZone: 'Africa/Brazzaville',
    year: 'numeric', month: '2-digit', day: '2-digit',
  });
  (data ?? []).forEach((d: any) => {
    if (!d.processed_at) return;
    const key = bzvFormatter.format(new Date(d.processed_at));
    counts[key] = (counts[key] ?? 0) + 1;
  });
  return counts;
}

export interface Draft {
  id: string;
  agent_id: string;
  request_id: string;
  data: Record<string, any>;
  created_at: string;
  updated_at: string;
  request?: {
    applicant?: { phone?: string; username?: string };
    phone_to_certify?: string;
  };
}

export async function saveDraft(agent_id: string, request_id: string, data: Record<string, any>): Promise<void> {
  await supabase.from('drafts').upsert({
    agent_id,
    request_id,
    data,
    updated_at: new Date().toISOString()
  }, { onConflict: 'agent_id,request_id' });
}

export async function getDraft(agent_id: string, request_id: string): Promise<Record<string, any> | null> {
  const { data } = await supabase
    .from('drafts')
    .select('data')
    .eq('agent_id', agent_id)
    .eq('request_id', request_id)
    .maybeSingle();
  return data?.data || null;
}

// Charge les détails de traitement de TOUS les agents pour un jour donné (superviseur)
export async function getAllAgentsProcessingDetailsByDate(date: Date, limit = 800000): Promise<any[]> {
  // Brazzaville = UTC+1. Plage exacte : 00h00 → 23h59:59.999 heure locale Brazzaville.
  const bzvDateStr = new Intl.DateTimeFormat('fr-CA', {
    timeZone: 'Africa/Brazzaville',
    year: 'numeric', month: '2-digit', day: '2-digit',
  }).format(date);

  const startUTC = new Date(`${bzvDateStr}T00:00:00+01:00`).toISOString();
  const endUTC   = new Date(`${bzvDateStr}T23:59:59.999+01:00`).toISOString();

  const { data, error } = await supabase
    .from('processing_details')
    .select(`
      *,
      request:verification_requests!inner(
        phone_to_certify,
        created_at,
        agent_id,
        agent:profiles!agent_id(username),
        applicant:profiles!applicant_id(username)
      )
    `)
    .gte('created_at', startUTC)
    .lte('created_at', endUTC)
    .order('created_at', { ascending: true })
    .limit(limit);

  if (error) throw error;
  return (data ?? []) as any[];
}

export async function getAgentDrafts(agent_id: string): Promise<Draft[]> {
  const { data } = await supabase
    .from('drafts')
    .select('id, agent_id, request_id, data, created_at, updated_at, request:verification_requests(phone_to_certify, applicant:profiles(phone, username))')
    .eq('agent_id', agent_id)
    .order('updated_at', { ascending: false });
  return (data as any) || [];
}

export async function deleteDraft(agent_id: string, request_id: string): Promise<void> {
  await supabase
    .from('drafts')
    .delete()
    .eq('agent_id', agent_id)
    .eq('request_id', request_id);
}

// ══════════════════════════════════════════════════════════
// PÉRIODE DE TRAVAIL / PAIE
// ══════════════════════════════════════════════════════════

export interface WorkPeriodConfig {
  id?:         string;
  start_day:   number; // jour du mois (1-28)
  end_day:     number; // jour du mois de fin (calculé = start_day - 1)
  updated_at?: string;
}

export interface WorkPeriodCurrent {
  configured:   boolean;
  start_day?:   number;
  end_day?:     number;
  period_start?: string; // ISO date "YYYY-MM-DD"
  period_end?:   string; // ISO date "YYYY-MM-DD"
  updated_at?:  string;
}

export interface WorkPeriodHistoryRow {
  id:           string;
  period_label: string;
  period_start: string;
  period_end:   string;
  created_at:   string;
}

/** Récupère la configuration de la période de travail */
export async function getWorkPeriodConfig(): Promise<WorkPeriodConfig | null> {
  const { data, error } = await supabase
    .from('work_period_config')
    .select('id, start_day, end_day, updated_at')
    .maybeSingle();
  if (error) { console.error('getWorkPeriodConfig:', error); return null; }
  return data;
}

/** Sauvegarde (upsert) la configuration de la période de travail */
export async function saveWorkPeriodConfig(
  config: { start_day: number },
  updatedBy: string
): Promise<boolean> {
  const end_day = config.start_day === 1 ? 28 : config.start_day - 1;
  const payload = { start_day: config.start_day, end_day, updated_by: updatedBy, updated_at: new Date().toISOString() };

  // Upsert via l'index singleton (ON CONFLICT DO UPDATE)
  const { error } = await supabase
    .from('work_period_config')
    .upsert([payload], { onConflict: 'id' });

  if (error) {
    // Aucun enregistrement → INSERT
    if (error.code === '42P01' || error.message.includes('conflict')) {
      const { error: insErr } = await supabase.from('work_period_config').insert([payload]);
      if (insErr) { console.error('saveWorkPeriodConfig insert:', insErr); return false; }
      return true;
    }
    // Essai INSERT direct si upsert échoue (singleton vide)
    const { error: insErr2 } = await supabase.from('work_period_config').insert([payload]);
    if (insErr2) { console.error('saveWorkPeriodConfig:', error, insErr2); return false; }
  }
  return true;
}

/** Retourne la période active actuelle via la RPC Postgres */
export async function getCurrentWorkPeriod(): Promise<WorkPeriodCurrent> {
  const { data, error } = await supabase.rpc('get_current_work_period');
  if (error) { console.error('getCurrentWorkPeriod:', error); return { configured: false }; }
  return data as WorkPeriodCurrent;
}

/** Retourne l'historique des périodes archivées */
export async function getWorkPeriodHistory(): Promise<WorkPeriodHistoryRow[]> {
  const { data, error } = await supabase
    .from('work_period_history')
    .select('id, period_label, period_start, period_end, created_at')
    .order('period_start', { ascending: false })
    .limit(24);
  if (error) { console.error('getWorkPeriodHistory:', error); return []; }
  return data ?? [];
}

// ─── API INTEGRATIONS ────────────────────────────────────────────────────

export interface ApiIntegration {
  id: string;
  name: string;
  description: string | null;
  api_key: string;
  api_key_prefix: string;
  permissions: string[];
  is_active: boolean;
  rate_limit: number;
  created_by: string | null;
  revoked_at: string | null;
  last_used_at: string | null;
  created_at: string;
  updated_at: string;
}

export interface ApiIntegrationLog {
  id: string;
  integration_id: string;
  endpoint: string;
  method: string;
  status_code: number | null;
  response_time_ms: number | null;
  ip_address: string | null;
  error_message: string | null;
  created_at: string;
}

/** Génère une clé API sécurisée (format: kl_live_XXXXX) */
export function generateApiKey(): string {
  const arr = new Uint8Array(32);
  crypto.getRandomValues(arr);
  const hex = Array.from(arr).map(b => b.toString(16).padStart(2, '0')).join('');
  return `kl_live_${hex}`;
}

export async function getIntegrations(): Promise<ApiIntegration[]> {
  const { data, error } = await supabase
    .from('api_integrations')
    .select('id,name,description,api_key,api_key_prefix,permissions,is_active,rate_limit,created_by,revoked_at,last_used_at,created_at,updated_at')
    .order('created_at', { ascending: false });
  if (error) { console.error('getIntegrations:', error); return []; }
  return (data ?? []) as ApiIntegration[];
}

export async function createIntegration(params: {
  name: string;
  description?: string;
  permissions: string[];
  rate_limit?: number;
  created_by: string;
}): Promise<ApiIntegration | null> {
  const apiKey = generateApiKey();
  const { data, error } = await supabase
    .from('api_integrations')
    .insert({
      name:         params.name,
      description:  params.description ?? null,
      api_key:      apiKey,
      api_key_prefix: apiKey.slice(0, 16),
      permissions:  params.permissions,
      rate_limit:   params.rate_limit ?? 100,
      created_by:   params.created_by,
    })
    .select('id,name,description,api_key,api_key_prefix,permissions,is_active,rate_limit,created_by,revoked_at,last_used_at,created_at,updated_at')
    .single();
  if (error) { console.error('createIntegration:', error); return null; }
  return data as ApiIntegration;
}

export async function updateIntegration(id: string, updates: Partial<Pick<ApiIntegration, 'name' | 'description' | 'permissions' | 'rate_limit' | 'is_active'>>) {
  const { error } = await supabase.from('api_integrations').update(updates).eq('id', id);
  if (error) throw error;
}

export async function revokeIntegration(id: string) {
  const { error } = await supabase
    .from('api_integrations')
    .update({ is_active: false, revoked_at: new Date().toISOString() })
    .eq('id', id);
  if (error) throw error;
}

export async function renewIntegrationKey(id: string, updatedBy: string): Promise<string | null> {
  const newKey = generateApiKey();
  const { error } = await supabase
    .from('api_integrations')
    .update({
      api_key:        newKey,
      api_key_prefix: newKey.slice(0, 16),
      revoked_at:     null,
      is_active:      true,
      updated_at:     new Date().toISOString(),
    })
    .eq('id', id);
  if (error) { console.error('renewIntegrationKey:', error); return null; }
  void updatedBy; // tracked via RLS + updated_by could be added later
  return newKey;
}

export async function deleteIntegration(id: string) {
  const { error } = await supabase.from('api_integrations').delete().eq('id', id);
  if (error) throw error;
}

export async function getIntegrationLogs(integrationId: string, limit = 100): Promise<ApiIntegrationLog[]> {
  const { data, error } = await supabase
    .from('api_integration_logs')
    .select('id,integration_id,endpoint,method,status_code,response_time_ms,ip_address,error_message,created_at')
    .eq('integration_id', integrationId)
    .order('created_at', { ascending: false })
    .limit(limit);
  if (error) { console.error('getIntegrationLogs:', error); return []; }
  return (data ?? []) as ApiIntegrationLog[];
}
