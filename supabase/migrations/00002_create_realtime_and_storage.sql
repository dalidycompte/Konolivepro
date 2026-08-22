
-- Enable Realtime for key tables
alter publication supabase_realtime add table verification_requests;
alter publication supabase_realtime add table messages;
alter publication supabase_realtime add table notifications;
alter publication supabase_realtime add table profiles;
alter publication supabase_realtime add table internal_messages;
alter publication supabase_realtime add table video_call_states;
alter publication supabase_realtime add table internal_calls;
alter publication supabase_realtime add table pause_sessions;
