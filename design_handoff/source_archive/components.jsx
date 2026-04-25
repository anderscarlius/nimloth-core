// Shared small components — icons, badges, sparklines
const { useState, useEffect, useMemo, useRef } = React;

// --- Icons (inline SVG, 1.75 stroke) ---
function Icon({ name, size = 16, className }) {
  const paths = {
    search: <><circle cx="11" cy="11" r="7"/><path d="m20 20-3.5-3.5"/></>,
    user: <><circle cx="12" cy="8" r="4"/><path d="M4 21c0-4.4 3.6-8 8-8s8 3.6 8 8"/></>,
    activity: <path d="M3 12h4l2-7 4 14 2-7h6"/>,
    globe: <><circle cx="12" cy="12" r="9"/><path d="M3 12h18M12 3a14 14 0 0 1 0 18M12 3a14 14 0 0 0 0 18"/></>,
    chart: <path d="M3 20V10M9 20V4M15 20v-8M21 20V14"/>,
    shield: <path d="M12 3l8 3v6c0 5-3.5 8-8 9-4.5-1-8-4-8-9V6z"/>,
    settings: <><circle cx="12" cy="12" r="3"/><path d="M19 12a7 7 0 0 0-.1-1.3l2-1.5-2-3.4-2.3 1a7 7 0 0 0-2.2-1.3l-.4-2.5h-4l-.4 2.5a7 7 0 0 0-2.2 1.3l-2.3-1-2 3.4 2 1.5A7 7 0 0 0 5 12a7 7 0 0 0 .1 1.3l-2 1.5 2 3.4 2.3-1a7 7 0 0 0 2.2 1.3l.4 2.5h4l.4-2.5a7 7 0 0 0 2.2-1.3l2.3 1 2-3.4-2-1.5c.1-.4.1-.9.1-1.3z"/></>,
    arrowLeft: <path d="M19 12H5M12 19l-7-7 7-7"/>,
    alert: <><path d="M12 9v4M12 17h.01"/><path d="M10.3 3.3 2 18.5c-.6 1 .1 2.3 1.3 2.3h17.4c1.2 0 2-1.3 1.3-2.3L13.7 3.3a1.5 1.5 0 0 0-2.6 0z"/></>,
    pill: <><rect x="3" y="9" width="18" height="6" rx="3"/><path d="M12 9v6"/></>,
    droplet: <path d="M12 3s6 6 6 11a6 6 0 0 1-12 0c0-5 6-11 6-11z"/>,
    bone: <path d="M6 5a3 3 0 0 1 5 1l7 7a3 3 0 1 1-3 3l-7-7a3 3 0 0 1-2-4zM18 18a3 3 0 0 1 1-1M6 6a3 3 0 0 1-1 1"/>,
    heart: <path d="M20 8.5a5.5 5.5 0 0 0-9.5-3.8 5.5 5.5 0 0 0-9.5 3.8c0 5.5 9.5 11 9.5 11s9.5-5.5 9.5-11z" transform="scale(0.83) translate(2 2)"/>,
    clock: <><circle cx="12" cy="12" r="9"/><path d="M12 7v5l3 2"/></>,
    stethoscope: <path d="M6 3v7a4 4 0 0 0 8 0V3M10 21a4 4 0 0 0 4-4v-3"/>,
    chevronRight: <path d="m9 6 6 6-6 6"/>,
    chevronDown: <path d="m6 9 6 6 6-6"/>,
    plus: <path d="M12 5v14M5 12h14"/>,
    check: <path d="M5 12l5 5L20 7"/>,
    x: <path d="M6 6l12 12M18 6 6 18"/>,
    dot: <circle cx="12" cy="12" r="3"/>,
    emergency: <path d="M12 2v4M12 18v4M4.9 4.9l2.8 2.8M16.3 16.3l2.8 2.8M2 12h4M18 12h4M4.9 19.1l2.8-2.8M16.3 7.7l2.8-2.8"/>,
    inbox: <path d="M22 12h-6l-2 3h-4l-2-3H2M5.5 5h13l3.5 7v6a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2v-6z"/>,
    file: <path d="M14 3H6a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V9zM14 3v6h6"/>,
    wifi: <path d="M2 8.5a15 15 0 0 1 20 0M5 12a10 10 0 0 1 14 0M8.5 15.5a5 5 0 0 1 7 0M12 19h.01"/>,
    wifiOff: <path d="M2 8.5a15 15 0 0 1 5-3.2M19 13a10 10 0 0 0-8-4M15.5 18.5M2 2l20 20M12 19h.01"/>
  };
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor"
         strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round" className={className}>
      {paths[name]}
    </svg>
  );
}

// --- Source Badge ---
function SourceBadge({ source, size }) {
  const s = window.SOURCE_LABELS[source];
  if (!s) return null;
  return (
    <span className={`badge ${s.cls}`}>
      <span className="swatch"></span>
      {s.label}
    </span>
  );
}

// --- Sparkline ---
function Sparkline({ data, width = 54, height = 18, color = '#0D7377' }) {
  if (!data || data.length < 2) return null;
  const min = Math.min(...data);
  const max = Math.max(...data);
  const span = max - min || 1;
  const step = width / (data.length - 1);
  const points = data.map((v, i) => `${(i * step).toFixed(1)},${(height - ((v - min) / span) * (height - 2) - 1).toFixed(1)}`).join(' ');
  return (
    <svg width={width} height={height} className="spark" style={{ overflow: 'visible' }}>
      <polyline fill="none" stroke={color} strokeWidth="1.25" points={points} strokeLinecap="round" strokeLinejoin="round"/>
      <circle cx={(data.length - 1) * step} cy={height - ((data[data.length-1] - min) / span) * (height - 2) - 1}
              r="1.8" fill={color}/>
    </svg>
  );
}

// --- Quality flag ---
function QualityFlag({ flags }) {
  if (!flags || !flags.length) return null;
  return (
    <span className="qflag" title={flags.join(', ')}>
      <Icon name="alert" size={14}/>
    </span>
  );
}

// --- Switch ---
function Switch({ on, onChange, label }) {
  return (
    <div className={`switch ${on ? 'on' : ''}`} onClick={() => onChange(!on)}>
      <span>{label}</span>
      <span className="sw-track"><span className="sw-thumb"/></span>
    </div>
  );
}

// Expose globally
Object.assign(window, { Icon, SourceBadge, Sparkline, QualityFlag, Switch });
