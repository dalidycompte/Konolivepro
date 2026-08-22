import React, { useState, useEffect, useCallback, useRef } from 'react';
import MainLayout from '@/components/layouts/MainLayout';
import { useAuth } from '@/contexts/AuthContext';
import { supabase } from '@/lib/supabase';
import {
  getInternalContacts,
  createInternalCall,
  getInternalMessages,
  sendInternalMessage,
  markInternalMessagesRead,
  deleteInternalMessage
} from '@/lib/api';
import type { Profile, InternalMessage } from '@/types/types';
import InternalCallModal from '@/components/discussion/InternalCallModal';
import VoiceMessagePlayer from '@/components/discussion/VoiceMessagePlayer';
import {
  Phone, Users, Search, Image as ImageIcon, Send, X, Check, CheckCheck, Loader2, FileImage, Eye, EyeOff, MessageSquare, Trash2, Smile, Mic, Square, Trash, ChevronDown, Paperclip, Camera
} from 'lucide-react';
import { toast } from 'sonner';
import { format } from 'date-fns';
import { fr } from 'date-fns/locale';
import EmojiPicker from 'emoji-picker-react';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';

// ── Helpers ──────────────────────────────────────────────
function Avatar({ name, size = 36 }: { name: string; size?: number }) {
  const initials = name.slice(0, 2).toUpperCase();
  const colors = ['bg-blue-500','bg-purple-500','bg-green-500','bg-orange-500','bg-pink-500'];
  const color  = colors[name.charCodeAt(0) % colors.length];
  return (
    <div className={`${color} rounded-full flex items-center justify-center text-white font-bold shrink-0`}
      style={{ width: size, height: size, fontSize: size * 0.36 }}>
      {initials}
    </div>
  );
}

function RoleBadge({ role }: { role: string }) {
  if (role === 'supervisor') return (
    <span className="text-[10px] px-1.5 py-0.5 rounded-full bg-purple-100 text-purple-700 font-medium">Superviseur</span>
  );
  return (
    <span className="text-[10px] px-1.5 py-0.5 rounded-full bg-green-100 text-green-700 font-medium">Agent</span>
  );
}

// ── Main component ────────────────────────────────────────
export default function DiscussionPage() {
  const { profile } = useAuth();
  const [contacts, setContacts] = useState<Profile[]>([]);
  const [loadingContacts, setLoadingContacts] = useState(true);
  const [searchQuery, setSearchQuery] = useState('');
  const [showNames, setShowNames] = useState(true);
  
  // Chat state
  const [selectedContact, setSelectedContact] = useState<Profile | null>(null);
  const [messages, setMessages] = useState<InternalMessage[]>([]);
  const [loadingMessages, setLoadingMessages] = useState(false);
  const [newMessage, setNewMessage] = useState('');
  const [uploadingImage, setUploadingImage] = useState(false);
  const [showEmojiPicker, setShowEmojiPicker] = useState(false);
  const [unreadCounts, setUnreadCounts] = useState<Record<string, number>>({});
  
  // Audio state
  const [isRecording, setIsRecording] = useState(false);
  const [audioBlob, setAudioBlob] = useState<Blob | null>(null);
  const [audioUrl, setAudioUrl] = useState<string | null>(null);
  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const audioChunksRef = useRef<Blob[]>([]);

  const fileInputRef = useRef<HTMLInputElement>(null);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  // Auto-resize textarea
  useEffect(() => {
    if (textareaRef.current) {
      textareaRef.current.style.height = '40px';
      const scrollHeight = textareaRef.current.scrollHeight;
      textareaRef.current.style.height = Math.min(Math.max(scrollHeight, 40), 150) + 'px';
    }
  }, [newMessage]);

  // Call state
  const [activeCall, setActiveCall] = useState<{ callId: string; participants: Profile[] } | null>(null);
  const [launchingCall, setLaunchingCall] = useState(false);

  // Group call modal state (if we want to keep it)
  const [showGroupCall, setShowGroupCall] = useState(false);
  const [selectedCallees, setSelectedCallees] = useState<Profile[]>([]);

  const loadContacts = useCallback(async () => {
    if (!profile) return;
    setLoadingContacts(true);
    const all = await getInternalContacts();
    const filtered = all.filter(c => c.id !== profile.id);
    setContacts(filtered);
    if (filtered.length > 0) {
      setSelectedContact(prev => prev || filtered[0]); // Auto-select first contact
    }
    setLoadingContacts(false);
  }, [profile]);

  useEffect(() => { loadContacts(); }, [loadContacts]);

  // Load unread counts globally for this page
  useEffect(() => {
    if (!profile) return;
    
    const fetchUnreadCounts = async () => {
      const { data } = await supabase
        .from('internal_messages')
        .select('sender_id')
        .eq('receiver_id', profile.id)
        .eq('is_read', false);
        
      if (data) {
        const counts: Record<string, number> = {};
        data.forEach(msg => {
          counts[msg.sender_id] = (counts[msg.sender_id] || 0) + 1;
        });
        setUnreadCounts(counts);
      }
    };
    fetchUnreadCounts();

    const channel = supabase.channel(`discussion-unread-${profile.id}`)
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'internal_messages', filter: `receiver_id=eq.${profile.id}` },
        () => {
          fetchUnreadCounts();
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [profile]);

  // Load messages when contact is selected
  useEffect(() => {
    if (!profile || !selectedContact) return;
    
    const loadMsgs = async () => {
      setLoadingMessages(true);
      const msgs = await getInternalMessages(profile.id, selectedContact.id);
      setMessages(msgs);
      setLoadingMessages(false);
      markInternalMessagesRead(selectedContact.id, profile.id);
      setTimeout(() => messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' }), 100);
    };
    loadMsgs();

    // Subscribe to new messages
    const channel = supabase.channel(`internal-chat-${profile.id}-${selectedContact.id}`)
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'internal_messages' },
        (payload) => {
          if (payload.eventType === 'INSERT') {
            const msg = payload.new as InternalMessage;
            if (
              (msg.sender_id === profile.id && msg.receiver_id === selectedContact.id) ||
              (msg.sender_id === selectedContact.id && msg.receiver_id === profile.id)
            ) {
              setMessages(prev => {
                if (prev.find(m => m.id === msg.id)) return prev;
                return [...prev, msg];
              });
              setTimeout(() => messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' }), 100);
              if (msg.sender_id === selectedContact.id) {
                markInternalMessagesRead(selectedContact.id, profile.id);
              }
            }
          } else if (payload.eventType === 'DELETE') {
            const msgId = payload.old.id;
            setMessages(prev => prev.filter(m => m.id !== msgId));
          } else if (payload.eventType === 'UPDATE') {
            const msg = payload.new as InternalMessage;
            if (
              (msg.sender_id === profile.id && msg.receiver_id === selectedContact.id) ||
              (msg.sender_id === selectedContact.id && msg.receiver_id === profile.id)
            ) {
              setMessages(prev => prev.map(m => m.id === msg.id ? msg : m));
            }
          }
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [profile, selectedContact]);

  const startRecording = async () => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      const mediaRecorder = new MediaRecorder(stream);
      mediaRecorderRef.current = mediaRecorder;
      audioChunksRef.current = [];

      mediaRecorder.ondataavailable = (e) => {
        if (e.data.size > 0) audioChunksRef.current.push(e.data);
      };

      mediaRecorder.onstop = () => {
        const mimeType = mediaRecorder.mimeType || 'audio/webm';
        const blob = new Blob(audioChunksRef.current, { type: mimeType });
        setAudioBlob(blob);
        setAudioUrl(URL.createObjectURL(blob));
      };

      mediaRecorder.start();
      setIsRecording(true);
    } catch (err) {
      toast.error("Accès au microphone refusé.");
    }
  };

  const stopRecording = () => {
    if (mediaRecorderRef.current && isRecording) {
      mediaRecorderRef.current.stop();
      setIsRecording(false);
      mediaRecorderRef.current.stream.getTracks().forEach(track => track.stop());
    }
  };

  const cancelAudio = () => {
    setAudioBlob(null);
    if (audioUrl) URL.revokeObjectURL(audioUrl);
    setAudioUrl(null);
  };

  const handleSendMessage = async (e?: React.FormEvent) => {
    e?.preventDefault();
    if (!profile || !selectedContact) return;
    if (!newMessage.trim() && !audioBlob && !uploadingImage) return;
    
    const content = newMessage.trim();
    let uploadedAudioUrl: string | undefined = undefined;

    if (audioBlob) {
      const mimeType = audioBlob.type;
      let ext = 'webm';
      if (mimeType.includes('mp4')) ext = 'm4a';
      else if (mimeType.includes('mpeg')) ext = 'mp3';
      else if (mimeType.includes('ogg')) ext = 'ogg';
      else if (mimeType.includes('wav')) ext = 'wav';
      else if (mimeType.includes('aac')) ext = 'aac';

      const filename = `${profile.id}/${Date.now()}.${ext}`;
      const { data, error } = await supabase.storage
        .from('internal-media')
        .upload(filename, audioBlob, { contentType: mimeType });
      
      if (error) {
        console.error("Audio upload error:", error);
        toast.error("Erreur lors de l'envoi de l'audio");
        return;
      }
      const { data: publicUrlData } = supabase.storage
        .from('internal-media')
        .getPublicUrl(filename);
      uploadedAudioUrl = publicUrlData.publicUrl;
      cancelAudio();
    }

    setNewMessage('');
    
    const { error } = await sendInternalMessage({
      sender_id: profile.id,
      receiver_id: selectedContact.id,
      content: content || undefined,
      audio_url: uploadedAudioUrl
    });
    
    if (error) {
      toast.error('Erreur lors de l\'envoi du message');
      setNewMessage(content); // restore
    }
  };

  const handleDeleteMessage = async (msgId: string) => {
    try {
      await deleteInternalMessage(msgId);
      // Let realtime handle the UI update, or do it optimistically
      setMessages(prev => prev.filter(m => m.id !== msgId));
      toast.success('Message supprimé');
    } catch (error) {
      toast.error('Erreur lors de la suppression');
    }
  };

  const handleImageUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file || !profile || !selectedContact) return;
    
    // Check size (5MB max)
    if (file.size > 5 * 1024 * 1024) {
      toast.error('L\'image est trop grande (max 5 Mo)');
      return;
    }

    setUploadingImage(true);
    const fileExt = file.name.split('.').pop();
    const fileName = `${profile.id}/${Date.now()}.${fileExt}`;
    
    try {
      const { data, error: uploadError } = await supabase.storage
        .from('internal-media')
        .upload(fileName, file);

      if (uploadError) throw uploadError;

      const { data: publicUrlData } = supabase.storage
        .from('internal-media')
        .getPublicUrl(data.path);

      await sendInternalMessage({
        sender_id: profile.id,
        receiver_id: selectedContact.id,
        image_url: publicUrlData.publicUrl
      });
      
      setTimeout(() => messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' }), 100);
    } catch (err) {
      console.error(err);
      toast.error('Erreur lors de l\'envoi de l\'image');
    } finally {
      setUploadingImage(false);
      if (fileInputRef.current) fileInputRef.current.value = '';
    }
  };

  // ── Launch 1-to-1 call ─────────────────────────────
  async function handleLaunchCall(participants: Profile[]) {
    if (!profile || participants.length === 0) return;
    
    setLaunchingCall(true);
    const call = await createInternalCall(profile.id, participants.map(c => c.id));
    if (!call) {
      toast.error("Impossible de créer l'appel.");
      setLaunchingCall(false);
      return;
    }
    
    for (const callee of participants) {
      const ch = supabase.channel(`internal-call-invite-${callee.id}`);
      ch.subscribe(status => {
        if (status === 'SUBSCRIBED') {
          ch.send({
            type: 'broadcast', event: 'call_invite',
            payload: {
              to: callee.id, callId: call.id,
              initiatorName: profile.username,
              participants: [profile, ...participants],
            },
          });
          setTimeout(() => supabase.removeChannel(ch), 2000);
        }
      });
    }
    setLaunchingCall(false);
    setActiveCall({ callId: call.id, participants });
    setShowGroupCall(false);
  }

  const filteredContacts = contacts.filter(c =>
    c.username.toLowerCase().includes(searchQuery.toLowerCase())
  );

  return (
    <MainLayout>
      <div className="h-[calc(100vh-6rem)] max-h-[800px] flex gap-4 max-w-4xl mx-auto">
        {/* RIGHT PANE: Chat Area */}
        <div className="flex-1 neu-card p-0 flex flex-col overflow-hidden relative">
          
            <>
              {/* Chat Header */}
              <div className="h-16 shrink-0 border-b border-border/50 px-4 md:px-6 flex items-center justify-between bg-card/50 backdrop-blur-sm z-10">
                <DropdownMenu>
                  <DropdownMenuTrigger asChild>
                    <button className="flex items-center gap-3 p-2 -ml-2 rounded-xl hover:bg-muted/50 transition-colors group">
                      {selectedContact ? (
                        <>
                          <Avatar name={selectedContact.username} size={36} />
                          <div className="text-left flex flex-col items-start min-w-[120px]">
                            <h2 className="font-bold text-foreground leading-tight text-sm">
                              {selectedContact.username}
                            </h2>
                            <div className="mt-0.5"><RoleBadge role={selectedContact.role} /></div>
                          </div>
                        </>
                      ) : (
                        <>
                          <div className="w-9 h-9 rounded-full bg-primary/10 flex items-center justify-center text-primary shrink-0">
                            <Users size={18} />
                          </div>
                          <div className="text-left flex flex-col items-start">
                            <h2 className="font-bold text-foreground text-sm">Choisir un destinataire</h2>
                            <span className="text-[10px] text-muted-foreground font-medium uppercase tracking-wide">Cliquer pour sélectionner</span>
                          </div>
                        </>
                      )}
                      <ChevronDown size={18} className="text-muted-foreground ml-1 group-hover:text-primary transition-colors" />
                    </button>
                  </DropdownMenuTrigger>
                  <DropdownMenuContent align="start" className="w-72 max-h-[60vh] overflow-y-auto">
                    <div className="px-2 py-2 sticky top-0 bg-popover z-10 border-b border-border/50 mb-1">
                      <div className="relative">
                        <Search size={14} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-muted-foreground" />
                        <input 
                          autoFocus
                          className="w-full pl-8 pr-3 py-1.5 bg-muted/50 rounded-md text-sm border-none focus:ring-1 focus:ring-primary outline-none" 
                          placeholder="Rechercher..."
                          value={searchQuery}
                          onChange={e => setSearchQuery(e.target.value)}
                          onKeyDown={e => e.stopPropagation()}
                        />
                      </div>
                    </div>
                    {filteredContacts.length > 0 ? filteredContacts.map(c => (
                      <DropdownMenuItem 
                        key={c.id} 
                        onClick={() => setSelectedContact(c)}
                        className={`gap-3 p-2.5 cursor-pointer ${selectedContact?.id === c.id ? 'bg-primary/5' : ''}`}
                      >
                        <Avatar name={c.username} size={28} />
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center justify-between">
                            <span className="font-medium text-sm truncate">{c.username}</span>
                            {unreadCounts[c.id] > 0 && (
                              <span className="bg-destructive text-white text-[10px] font-bold px-1.5 py-0.5 rounded-full min-w-[20px] text-center">
                                {unreadCounts[c.id]}
                              </span>
                            )}
                          </div>
                          <div className="mt-0.5"><RoleBadge role={c.role} /></div>
                        </div>
                      </DropdownMenuItem>
                    )) : (
                      <div className="p-4 text-center text-sm text-muted-foreground">Aucun contact trouvé</div>
                    )}
                  </DropdownMenuContent>
                </DropdownMenu>
                <div className="flex items-center gap-2">
                  <button
                    onClick={() => setShowGroupCall(true)}
                    className="p-2.5 rounded-full bg-muted/50 text-muted-foreground hover:bg-muted hover:text-foreground transition-all"
                    title="Appel de groupe">
                    <Users size={20} />
                  </button>
                  {selectedContact && (
                    <button
                      onClick={() => handleLaunchCall([selectedContact])}
                      disabled={launchingCall}
                      className="p-2.5 rounded-full bg-primary/10 text-primary hover:bg-primary hover:text-primary-foreground transition-all disabled:opacity-50"
                      title="Appeler">
                      {launchingCall ? <Loader2 size={20} className="animate-spin" /> : <Phone size={20} />}
                    </button>
                  )}
                </div>
              </div>

              {/* Chat Messages */}
              <div className="flex-1 overflow-y-auto p-4 md:p-6 space-y-4 bg-muted/10">
                {(!selectedContact && messages.length === 0) ? (
                  <div className="flex flex-col justify-center items-center h-full text-muted-foreground gap-3">
                    <div className="w-16 h-16 rounded-full bg-muted flex items-center justify-center">
                      <MessageSquare size={24} className="text-muted-foreground/50" />
                    </div>
                    <p className="font-medium">Sélectionnez un destinataire pour démarrer une discussion</p>
                  </div>
                ) : loadingMessages ? (
                  <div className="flex justify-center items-center h-full">
                    <Loader2 size={24} className="animate-spin text-primary/50" />
                  </div>
                ) : messages.length === 0 ? (
                  <div className="flex flex-col justify-center items-center h-full text-muted-foreground gap-3">
                    <div className="w-16 h-16 rounded-full bg-muted flex items-center justify-center">
                      <MessageSquare size={24} className="text-muted-foreground/50" />
                    </div>
                    <p className="font-medium">Démarrez la conversation avec {selectedContact?.username}</p>
                  </div>
                ) : (
                  messages.map(msg => {
                    const isMine = msg.sender_id === profile?.id;
                    return (
                      <div key={msg.id} className={`flex flex-col group ${isMine ? 'items-end' : 'items-start'}`}>
                        <div className="flex items-center gap-2">
                          {isMine && (
                            <button
                              onClick={() => handleDeleteMessage(msg.id)}
                              className="opacity-0 group-hover:opacity-100 p-1.5 text-muted-foreground hover:text-destructive hover:bg-destructive/10 rounded-full transition-all"
                              title="Supprimer"
                            >
                              <Trash2 size={14} />
                            </button>
                          )}
                          <div className={`max-w-[85%] md:max-w-[70%] rounded-2xl px-4 py-2.5 shadow-sm ${
                            isMine 
                              ? 'bg-primary text-primary-foreground rounded-tr-sm' 
                              : 'bg-card border border-border/50 rounded-tl-sm text-foreground'
                          }`}>
                            {msg.image_url && (
                              <a href={msg.image_url} target="_blank" rel="noreferrer" className="block mb-2 overflow-hidden rounded-xl">
                                <img src={msg.image_url} alt="Image jointe" className="max-w-full h-auto max-h-64 object-cover hover:scale-105 transition-transform" />
                              </a>
                            )}
                            {msg.audio_url && (
                              <div className="mb-2">
                                <VoiceMessagePlayer src={msg.audio_url} isMine={isMine} />
                              </div>
                            )}
                            {msg.content && <p className="whitespace-pre-wrap break-words text-sm">{msg.content}</p>}
                          </div>
                          {!isMine && (
                            <button
                              onClick={() => handleDeleteMessage(msg.id)}
                              className="opacity-0 group-hover:opacity-100 p-1.5 text-muted-foreground hover:text-destructive hover:bg-destructive/10 rounded-full transition-all"
                              title="Supprimer"
                            >
                              <Trash2 size={14} />
                            </button>
                          )}
                        </div>
                        <span className={`text-[10px] text-muted-foreground mt-1 px-1 flex items-center gap-1 ${isMine ? 'mr-8' : 'ml-8'}`}>
                          {format(new Date(msg.created_at), 'HH:mm', { locale: fr })}
                          {isMine && (
                            msg.is_read 
                              ? <CheckCheck size={14} className="text-blue-500" />
                              : <Check size={14} />
                          )}
                        </span>
                      </div>
                    );
                  })
                )}
                {uploadingImage && (
                  <div className="flex flex-col items-end">
                    <div className="bg-primary/20 text-primary rounded-2xl rounded-tr-sm px-4 py-2.5 flex items-center gap-2">
                      <Loader2 size={16} className="animate-spin" />
                      <span className="text-sm font-medium">Envoi de l'image...</span>
                    </div>
                  </div>
                )}
                <div ref={messagesEndRef} />
              </div>

              {/* Chat Input */}
              <div className="p-3 md:p-4 bg-card border-t border-border/50 relative">
                {showEmojiPicker && (
                  <div className="absolute bottom-[80px] left-4 z-50 shadow-2xl rounded-lg overflow-hidden border border-border">
                    <EmojiPicker 
                      onEmojiClick={(emojiData) => {
                        setNewMessage(prev => prev + emojiData.emoji);
                        setShowEmojiPicker(false);
                      }} 
                    />
                  </div>
                )}
                <form onSubmit={handleSendMessage} className="flex items-end gap-2 relative px-2 pb-2">
                  <input
                    type="file"
                    accept="image/*"
                    className="hidden"
                    ref={fileInputRef}
                    onChange={handleImageUpload}
                    disabled={uploadingImage || !selectedContact}
                  />

                  {/* Pill Container (Input + attach + emoji) */}
                  <div className={`flex-1 flex items-end bg-secondary/80 border-none rounded-[24px] shadow-sm transition-all focus-within:ring-1 focus-within:ring-primary/50 overflow-hidden ${audioUrl ? 'p-1' : 'px-1'}`}>
                    
                    {!audioUrl && (
                      <button
                        type="button"
                        onClick={() => setShowEmojiPicker(!showEmojiPicker)}
                        disabled={!selectedContact}
                        className={`p-2.5 shrink-0 rounded-full transition-colors disabled:opacity-50 ${showEmojiPicker ? 'text-primary bg-primary/10' : 'text-muted-foreground hover:text-primary'}`}
                        title="Insérer un émoji">
                        <Smile size={22} />
                      </button>
                    )}

                    {audioUrl ? (
                      <div className="flex-1 flex items-center gap-2 bg-muted/50 rounded-[20px] px-3 py-1.5 min-h-[40px] m-1">
                        <VoiceMessagePlayer src={audioUrl} isMine={true} />
                        <button type="button" onClick={cancelAudio} className="p-1.5 shrink-0 text-muted-foreground hover:text-destructive rounded-full">
                          <Trash size={16} />
                        </button>
                      </div>
                    ) : (
                      <textarea
                        ref={textareaRef}
                        value={newMessage}
                        onChange={e => setNewMessage(e.target.value)}
                        onKeyDown={e => {
                          if (e.key === 'Enter' && !e.shiftKey) {
                            e.preventDefault();
                            if (selectedContact) handleSendMessage();
                          }
                        }}
                        disabled={!selectedContact}
                        placeholder={selectedContact ? "Message" : "Sélectionnez un destinataire d'abord..."}
                        className="flex-1 bg-transparent border-none outline-none py-2.5 px-1 resize-none text-[15px] leading-relaxed disabled:opacity-50 min-h-[40px] max-h-[150px] scrollbar-thin self-center"
                        rows={1}
                      />
                    )}

                    {!audioUrl && (
                      <div className="flex shrink-0 items-center pr-1 pb-0.5">
                        <button
                          type="button"
                          onClick={() => fileInputRef.current?.click()}
                          disabled={uploadingImage || !selectedContact}
                          className="p-2 shrink-0 rounded-full text-muted-foreground hover:text-primary transition-colors disabled:opacity-50"
                          title="Joindre">
                          <Paperclip size={20} />
                        </button>
                        <button
                          type="button"
                          onClick={() => fileInputRef.current?.click()}
                          disabled={uploadingImage || !selectedContact}
                          className="p-2 shrink-0 rounded-full text-muted-foreground hover:text-primary transition-colors disabled:opacity-50"
                          title="Appareil photo">
                          <Camera size={22} />
                        </button>
                      </div>
                    )}
                  </div>

                  {/* Circular Action Button */}
                  <div className="shrink-0 flex items-center justify-center mb-0.5">
                    {(newMessage.trim() || audioBlob || uploadingImage) ? (
                      <button
                        type="submit"
                        disabled={(!newMessage.trim() && !uploadingImage && !audioBlob) || uploadingImage || isRecording || !selectedContact}
                        className="w-[44px] h-[44px] rounded-full bg-green-500 text-white hover:bg-green-600 transition-colors disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center shadow-md">
                        {uploadingImage ? <Loader2 size={20} className="animate-spin" /> : <Send size={18} className="translate-x-0.5 -translate-y-0.5" />}
                      </button>
                    ) : (
                      <button
                        type="button"
                        onClick={isRecording ? stopRecording : startRecording}
                        disabled={!selectedContact}
                        className={`w-[44px] h-[44px] rounded-full flex items-center justify-center shadow-md transition-colors disabled:opacity-50 ${isRecording ? 'bg-destructive text-white animate-pulse' : 'bg-green-500 text-white hover:bg-green-600'}`}
                        title={isRecording ? "Arrêter l'enregistrement" : "Enregistrer un message vocal"}>
                        {isRecording ? <Square size={18} className="fill-current" /> : <Mic size={20} />}
                      </button>
                    )}
                  </div>
                </form>
              </div>
            </>
        </div>
      </div>

      {/* ── Active conference call ──────────────────────── */}
      {activeCall && profile && (
        <InternalCallModal
          callId={activeCall.callId}
          participants={activeCall.participants}
          isInitiator={true}
          onClose={() => setActiveCall(null)}
        />
      )}

      {/* ── Group Call Modal ──────────────────────── */}
      {showGroupCall && (
        <div className="fixed inset-0 z-50 bg-background/80 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="neu-card w-full max-w-md flex flex-col max-h-[85vh]">
            <div className="flex items-center justify-between mb-4">
              <h2 className="text-lg font-bold">Appel de groupe</h2>
              <button onClick={() => setShowGroupCall(false)} className="p-2 neu-flat rounded-full">
                <X size={16} />
              </button>
            </div>
            
            <p className="text-sm text-muted-foreground mb-4">Sélectionnez les participants pour l'appel en conférence.</p>
            
            <div className="flex-1 overflow-y-auto space-y-2 mb-4">
              {contacts.map(contact => {
                const selected = !!selectedCallees.find(c => c.id === contact.id);
                return (
                  <button key={contact.id} onClick={() => {
                    setSelectedCallees(prev => prev.find(c => c.id === contact.id) ? prev.filter(c => c.id !== contact.id) : [...prev, contact])
                  }}
                    className={`w-full flex items-center gap-3 p-3 rounded-xl text-left transition-all ${
                      selected ? 'neu-pressed ring-1 ring-primary/40' : 'neu-flat'
                    }`}>
                    <Avatar name={contact.username} />
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2">
                        <span className="font-semibold text-sm">{contact.username}</span>
                        <RoleBadge role={contact.role} />
                      </div>
                    </div>
                    <div className={`w-5 h-5 rounded-full border-2 flex items-center justify-center shrink-0 transition-all ${
                      selected ? 'bg-primary border-primary' : 'border-muted-foreground'
                    }`}>
                      {selected && <Check size={11} className="text-primary-foreground" />}
                    </div>
                  </button>
                );
              })}
            </div>
            
            <button
              onClick={() => handleLaunchCall(selectedCallees)}
              disabled={selectedCallees.length === 0 || launchingCall}
              className="w-full py-3 rounded-xl bg-primary text-primary-foreground font-semibold text-sm flex items-center justify-center gap-2 hover:opacity-90 disabled:opacity-50">
              {launchingCall ? <Loader2 size={16} className="animate-spin" /> : <Phone size={16} />}
              Lancer l'appel ({selectedCallees.length + 1} participants)
            </button>
          </div>
        </div>
      )}
    </MainLayout>
  );
}
