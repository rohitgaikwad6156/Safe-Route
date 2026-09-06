import { clsx, type ClassValue } from 'clsx';
import { twMerge } from 'tailwind-merge';

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

export function formatDistance(meters: number): string {
  if (meters >= 1000) {
    return `${(meters / 1000).toFixed(1)} km`;
  }
  return `${Math.round(meters)} m`;
}

export function formatDuration(seconds: number): string {
  const mins = Math.round(seconds / 60);
  if (mins >= 60) {
    const hours = Math.floor(mins / 60);
    const remMins = mins % 60;
    return `${hours}h ${remMins}m`;
  }
  return `${mins} min`;
}

export function getScoreColor(score: number): {
  bg: string;
  text: string;
  border: string;
  badge: string;
  glow: string;
} {
  if (score >= 80) {
    return {
      bg: 'bg-emerald-500/10',
      text: 'text-emerald-400',
      border: 'border-emerald-500/30',
      badge: 'bg-emerald-500/20 text-emerald-300 border-emerald-500/30',
      glow: 'shadow-[0_0_15px_rgba(16,185,129,0.35)]',
    };
  } else if (score >= 65) {
    return {
      bg: 'bg-amber-500/10',
      text: 'text-amber-400',
      border: 'border-amber-500/30',
      badge: 'bg-amber-500/20 text-amber-300 border-amber-500/30',
      glow: 'shadow-[0_0_15px_rgba(245,158,11,0.35)]',
    };
  } else {
    return {
      bg: 'bg-rose-500/10',
      text: 'text-rose-400',
      border: 'border-rose-500/30',
      badge: 'bg-rose-500/20 text-rose-300 border-rose-500/30',
      glow: 'shadow-[0_0_15px_rgba(244,63,94,0.35)]',
    };
  }
}
