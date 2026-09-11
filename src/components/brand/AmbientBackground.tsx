import { Pause, Play } from 'lucide-react';
import { useEffect, useState } from 'react';

export function AmbientBackground() {
 return <div className="ambient-background" aria-hidden="true"><div className="ambient-glow ambient-glow-one"/><div className="ambient-glow ambient-glow-two"/><div className="ambient-grid"/></div>;
}

export function AmbientMotionButton() {
 const [paused,setPaused]=useState(()=>{
  try {return localStorage.getItem('supportos-ambient-paused')==='true';} catch {return false;}
 });
 useEffect(()=>{
  document.documentElement.dataset.ambientPaused=String(paused);
  try {localStorage.setItem('supportos-ambient-paused',String(paused));} catch {/* The control still works without storage. */}
 },[paused]);
 return <button type="button" className="ambient-motion-button" aria-label={paused?'Включить анимацию фона':'Приостановить анимацию фона'} title={paused?'Включить анимацию фона':'Приостановить анимацию фона'} aria-pressed={paused} onClick={()=>setPaused(value=>!value)}>{paused?<Play size={14}/>:<Pause size={14}/>}<span className="hidden lg:inline">Фон</span></button>;
}
