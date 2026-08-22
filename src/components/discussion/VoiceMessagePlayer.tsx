import React, { useState, useRef, useEffect } from 'react';
import { Play, Pause } from 'lucide-react';

interface VoiceMessagePlayerProps {
  src: string;
  isMine?: boolean;
}

function formatTime(seconds: number) {
  if (isNaN(seconds) || !isFinite(seconds)) return '0:00';
  const m = Math.floor(seconds / 60);
  const s = Math.floor(seconds % 60);
  return `${m}:${s.toString().padStart(2, '0')}`;
}

export default function VoiceMessagePlayer({ src, isMine = false }: VoiceMessagePlayerProps) {
  const [isPlaying, setIsPlaying] = useState(false);
  const [duration, setDuration] = useState(0);
  const [currentTime, setCurrentTime] = useState(0);
  const audioRef = useRef<HTMLAudioElement>(null);
  const progressRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const audio = audioRef.current;
    if (!audio) return;

    const setAudioData = () => {
      if (audio.duration && audio.duration !== Infinity) {
        setDuration(audio.duration);
      }
    };
    const setAudioTime = () => setCurrentTime(audio.currentTime);
    const onEnded = () => setIsPlaying(false);

    audio.addEventListener('loadedmetadata', setAudioData);
    audio.addEventListener('timeupdate', setAudioTime);
    audio.addEventListener('ended', onEnded);
    audio.addEventListener('pause', () => setIsPlaying(false));
    audio.addEventListener('play', () => setIsPlaying(true));

    return () => {
      audio.removeEventListener('loadedmetadata', setAudioData);
      audio.removeEventListener('timeupdate', setAudioTime);
      audio.removeEventListener('ended', onEnded);
      audio.removeEventListener('pause', () => setIsPlaying(false));
      audio.removeEventListener('play', () => setIsPlaying(true));
    };
  }, []);

  const togglePlay = () => {
    if (!audioRef.current) return;
    if (isPlaying) {
      audioRef.current.pause();
    } else {
      audioRef.current.play().catch(console.error);
    }
  };

  const handleSeek = (e: React.MouseEvent<HTMLDivElement>) => {
    if (!audioRef.current || !progressRef.current) return;
    const rect = progressRef.current.getBoundingClientRect();
    const percent = (e.clientX - rect.left) / rect.width;
    const newTime = percent * (duration || audioRef.current.duration || 0);
    if (!isNaN(newTime) && isFinite(newTime)) {
      audioRef.current.currentTime = newTime;
      setCurrentTime(newTime);
    }
  };

  const progressPercent = duration > 0 ? (currentTime / duration) * 100 : 0;
  
  // WhatsApp design: white/grey bubble inside the main chat bubble
  return (
    <div className={`flex items-center gap-2 w-full max-w-[210px] h-[44px] px-2 rounded-full select-none ${isMine ? 'bg-white/90 shadow-sm' : 'bg-background shadow-sm'}`}>
      <audio ref={audioRef} src={src} preload="metadata" />
      
      <button 
        type="button"
        onClick={togglePlay}
        className="shrink-0 w-8 h-8 flex items-center justify-center rounded-full transition-colors text-[#00A884] hover:bg-black/5"
      >
        {isPlaying ? <Pause size={18} className="fill-current" /> : <Play size={18} className="fill-current translate-x-0.5" />}
      </button>
      
      <div className="flex-1 flex flex-col justify-center min-w-0 pr-1">
        <div 
          ref={progressRef}
          onClick={handleSeek}
          className="h-5 flex items-center cursor-pointer relative"
        >
          {/* Track background */}
          <div className="w-full h-1 rounded-full bg-[#00A884]/30">
            {/* Progress fill */}
            <div 
              className="h-full rounded-full relative bg-[#00A884]"
              style={{ width: `${progressPercent}%` }}
            >
              {/* Thumb / Handle */}
              <div className="absolute right-0 top-1/2 -translate-y-1/2 w-2.5 h-2.5 rounded-full translate-x-1/2 shadow-sm bg-[#00A884]" />
            </div>
          </div>
        </div>
        
        <div className="flex justify-between items-center px-0.5 -mt-0.5">
          <span className="text-[10px] font-medium text-gray-500">
            {formatTime(currentTime)}
          </span>
          <span className="text-[10px] font-medium text-gray-400">
            {formatTime(duration)}
          </span>
        </div>
      </div>
    </div>
  );
}
