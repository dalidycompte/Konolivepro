import React, { useEffect, useState, useRef, useCallback } from 'react';
import { useParams, Link } from 'react-router-dom';
import MainLayout from '@/components/layouts/MainLayout';
import { useAuth } from '@/contexts/AuthContext';
import { getMessages, sendMessage, getMyRequests, getAllRequests } from '@/lib/api';
import { supabase } from '@/lib/supabase';
import type { VerificationRequest, Message } from '@/types/types';
import { MessageSquare, Send } from 'lucide-react';
import { format } from 'date-fns';

export default function AgentMessagesPage() {
  const { profile } = useAuth();
  const { requestId: paramId } = useParams<{ requestId?: string }>();
  const [requests, setRequests] = useState<VerificationRequest[]>([]);
  const [selected, setSelected] = useState<string | null>(paramId ?? null);
  const [messages, setMessages] = useState<Message[]>([]);
  const [newMsg, setNewMsg] = useState('');
  const messagesEndRef = useRef<HTMLDivElement>(null);

  const loadRequests = useCallback(async () => {
    if (!profile) return;
    const data = await getAllRequests(200);
    const mine = data.filter(r => r.agent_id === profile.id);
    setRequests(mine);
    if (!selected && mine.length > 0) setSelected(mine[0].id);
  }, [profile, selected]);

  const loadMessages = useCallback(async () => {
    if (!selected || !profile) return;
    const msgs = await getMessages(selected, 100);
    setMessages(msgs);
    setTimeout(() => messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' }), 100);
  }, [selected, profile]);

  useEffect(() => { loadRequests(); }, [loadRequests]);
  useEffect(() => { loadMessages(); }, [loadMessages]);

  useEffect(() => {
    if (!selected) return;
    const ch = supabase.channel(`agent-msgs-${selected}`)
      .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'messages', filter: `request_id=eq.${selected}` }, () => loadMessages())
      .subscribe();
    return () => { supabase.removeChannel(ch); };
  }, [selected, loadMessages]);

  async function handleSend(e: React.FormEvent) {
    e.preventDefault();
    if (!newMsg.trim() || !profile || !selected) return;
    const req = requests.find(r => r.id === selected);
    if (!req) return;
    await sendMessage({ request_id: selected, sender_id: profile.id, receiver_id: req.applicant_id, content: newMsg.trim() });
    setNewMsg('');
    loadMessages();
  }

  const selectedReq = requests.find(r => r.id === selected);

  return (
    <MainLayout>
      <div className="flex gap-6" style={{ height: 'calc(100vh - 10rem)' }}>
        <div className="w-64 shrink-0 neu-card flex flex-col overflow-hidden hidden md:flex">
          <h2 className="font-semibold text-foreground mb-3 shrink-0 flex items-center gap-2">
            <MessageSquare size={16} className="text-primary" />Conversations
          </h2>
          <div className="flex-1 overflow-y-auto space-y-2">
            {requests.length === 0 ? (
              <p className="text-xs text-muted-foreground text-center pt-8">Aucune conversation.</p>
            ) : requests.map(r => (
              <button key={r.id} onClick={() => setSelected(r.id)}
                className={`w-full text-left p-3 rounded-xl transition-all text-sm ${selected === r.id ? 'neu-pressed text-primary font-semibold' : 'hover:neu-pressed text-foreground'}`}>
                <p className="font-medium truncate">{r.phone_to_certify}</p>
                <p className="text-xs text-muted-foreground truncate">{r.applicant?.username ?? '—'}</p>
              </button>
            ))}
          </div>
        </div>

        <div className="flex-1 min-w-0 neu-card flex flex-col overflow-hidden">
          {!selected ? (
            <div className="flex-1 flex items-center justify-center text-muted-foreground text-sm">Sélectionnez une conversation</div>
          ) : (
            <>
              <div className="flex items-center gap-3 pb-4 border-b border-border shrink-0">
                <div className="w-10 h-10 rounded-xl neu-pressed flex items-center justify-center">
                  <MessageSquare size={18} className="text-primary" />
                </div>
                <div>
                  <p className="font-semibold text-foreground">{selectedReq?.phone_to_certify}</p>
                  <p className="text-xs text-muted-foreground">Coach mobile : {selectedReq?.applicant?.username ?? '—'}</p>
                </div>
                <Link to={`/agent/process/${selected}`} className="ml-auto text-xs text-primary hover:underline shrink-0">Traiter</Link>
              </div>
              <div className="flex-1 overflow-y-auto space-y-3 py-4 min-h-0">
                {messages.map(m => {
                  const isMine = m.sender_id === profile?.id;
                  return (
                    <div key={m.id} className={`flex ${isMine ? 'justify-end' : 'justify-start'}`}>
                      <div className={`max-w-[75%] px-4 py-2.5 rounded-2xl text-sm ${isMine ? 'bg-primary text-primary-foreground rounded-br-sm' : 'neu-flat rounded-bl-sm text-foreground'}`}>
                        {!isMine && <p className="text-xs font-semibold mb-1 opacity-70">{m.sender?.username}</p>}
                        <p className="text-pretty">{m.content}</p>
                        <p className={`text-xs mt-1 ${isMine ? 'text-primary-foreground/70' : 'text-muted-foreground'}`}>{format(new Date(m.created_at), 'HH:mm')}</p>
                      </div>
                    </div>
                  );
                })}
                <div ref={messagesEndRef} />
              </div>
              <form onSubmit={handleSend} className="flex gap-2 pt-4 border-t border-border shrink-0">
                <input className="neu-input flex-1" placeholder="Écrire un message…" value={newMsg} onChange={e => setNewMsg(e.target.value)} />
                <button type="submit" disabled={!newMsg.trim()} className="neu-btn-primary w-11 h-11 flex items-center justify-center rounded-xl shrink-0 disabled:opacity-50">
                  <Send size={18} />
                </button>
              </form>
            </>
          )}
        </div>
      </div>
    </MainLayout>
  );
}
