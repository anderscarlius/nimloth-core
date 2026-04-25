// Admin pages: Systemstatus, Topologi, Datakvalitet, Åtkomstlogg, Inställningar
const { useState: useStateA } = React;

// ================== SYSTEMSTATUS ==================
function SystemPage() {
  const d = window.SYSTEM_STATUS;
  return (
    <div className="admin-page">
      <h1>Systemstatus</h1>
      <p className="page-sub">Kafka, CDC-connectors och datapipelines · uppdateras var 5:e sekund</p>

      <div className="kpi-grid">
        <div className="kpi-card ok">
          <div className="kpi-label">Events/min</div>
          <div className="kpi-val tnum">{d.summary.eventsPerMin}</div>
          <div className="kpi-foot"><span className="delta-up">▲ {d.summary.eventsDelta}%</span> jmf förra timmen</div>
        </div>
        <div className="kpi-card ok">
          <div className="kpi-label">CDC lag</div>
          <div className="kpi-val tnum">{d.summary.cdcLagSec}<span className="suffix">s</span></div>
          <div className="kpi-foot"><span className="dot dot-green" style={{width:6,height:6,borderRadius:'50%',background:'var(--green)',display:'inline-block'}}/> Mål &lt;5s</div>
        </div>
        <div className="kpi-card ok">
          <div className="kpi-label">FHIR p95</div>
          <div className="kpi-val tnum">{d.summary.fhirP95ms}<span className="suffix">ms</span></div>
          <div className="kpi-foot"><span style={{width:6,height:6,borderRadius:'50%',background:'var(--green)',display:'inline-block'}}/> Mål &lt;250ms</div>
        </div>
        <div className="kpi-card ok">
          <div className="kpi-label">Felfrekvens</div>
          <div className="kpi-val tnum">{d.summary.errorRatePct}<span className="suffix">%</span></div>
          <div className="kpi-foot"><span className="delta-down">▼ {Math.abs(d.summary.errorDelta)}%</span> v/v</div>
        </div>
      </div>

      <div className="admin-section">
        <h2>Kafka Topics</h2>
        <div className="card" style={{overflow:'hidden'}}>
          <table className="table">
            <thead><tr><th>Topic</th><th style={{textAlign:'right'}}>Meddelanden</th><th style={{textAlign:'right'}}>Consumer lag</th><th style={{textAlign:'right'}}>Throughput</th><th>Status</th></tr></thead>
            <tbody>
              {d.topics.map(t => (
                <tr key={t.name}>
                  <td className="mono" style={{fontSize:12}}>{t.name}</td>
                  <td className="tnum" style={{textAlign:'right'}}>{t.msgs.toLocaleString('sv-SE')}</td>
                  <td className="tnum" style={{textAlign:'right', color: t.lag>50?'var(--amber)':'var(--ink)'}}>{t.lag}</td>
                  <td className="tnum" style={{textAlign:'right'}}>{t.tps}/s</td>
                  <td><span style={{width:8,height:8,borderRadius:'50%',display:'inline-block',background: t.status==='ok'?'var(--green)':t.status==='warn'?'var(--amber)':'var(--red)'}}/></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      <div className="admin-section">
        <h2>CDC-connectors</h2>
        <div className="card" style={{overflow:'hidden'}}>
          <table className="table">
            <thead><tr><th>Connector</th><th>Status</th><th>Källa</th><th>Tasks</th><th>Latens</th><th>Senaste event</th></tr></thead>
            <tbody>
              {d.connectors.map(c => {
                const ok = c.status === 'RUNNING';
                return (
                  <tr key={c.name}>
                    <td className="mono" style={{fontSize:12}}>{c.name}</td>
                    <td><span className={`badge ${ok?'badge-green':'badge-red'}`}>{c.status}</span></td>
                    <td>{c.source}</td>
                    <td className="mono" style={{fontSize:12}}>{c.tasks}</td>
                    <td className="mono" style={{fontSize:12}}>{c.latency}</td>
                    <td className="meta">{c.lastEvent}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>

      <div className="admin-section">
        <h2>Senaste fel</h2>
        <div className="card" style={{overflow:'hidden'}}>
          <table className="table">
            <thead><tr><th style={{width:150}}>Tidpunkt</th><th>Källa</th><th>Nivå</th><th>Meddelande</th></tr></thead>
            <tbody>
              {d.errors.map((e,i) => (
                <tr key={i}>
                  <td className="mono" style={{fontSize:12}}>{e.ts}</td>
                  <td className="mono" style={{fontSize:12}}>{e.source}</td>
                  <td><span className={`badge ${e.level==='ERROR'?'badge-red':e.level==='WARN'?'badge-amber':'badge-plain'}`}>{e.level}</span></td>
                  <td style={{fontSize:12,color:'var(--ink-2)'}}>{e.msg}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}

// ================== TOPOLOGI ==================
function TopologyPage() {
  const d = window.TOPOLOGY;
  const [selected, setSelected] = useStateA('su');
  const sel = d.nodes.find(n => n.id === selected);
  const statusCol = { online: 'var(--green)', replaying: 'var(--amber)', offline: 'var(--red)' };
  const statusLabel = { online: 'Online', replaying: 'Replaying', offline: 'Offline' };

  return (
    <div className="admin-page">
      <h1>Nätverkstopologi</h1>
      <p className="page-sub">Central hub + {d.nodes.length} edge-noder · Västra Götalandsregionen</p>

      <div className="topo-wrap">
        <div className="topo-map">
          <svg viewBox="0 0 860 560" style={{width:'100%',height:'auto'}}>
            {/* VGR map outline — stylized */}
            <defs>
              <pattern id="sea" patternUnits="userSpaceOnUse" width="6" height="6">
                <path d="M0,3 Q1.5,2 3,3 T6,3" stroke="#C8D5E2" fill="none" strokeWidth="0.4"/>
              </pattern>
            </defs>
            <rect x="0" y="0" width="860" height="560" fill="url(#sea)" opacity="0.3"/>
            {/* Simplified VGR shape */}
            <path d="M 120 80 Q 200 60 280 80 L 380 70 Q 480 80 540 120 L 620 140 Q 700 180 740 240 L 780 320 Q 760 400 720 460 L 640 500 Q 540 530 440 510 L 340 500 Q 240 490 180 450 L 120 380 Q 80 280 100 180 Z"
                  fill="#F0EBDD" stroke="#D8D0BE" strokeWidth="1.5"/>

            {/* Edge labels — cities */}
            <text x="310" y="138" className="node-sub" textAnchor="middle">Göteborg</text>
            <text x="640" y="128" className="node-sub" textAnchor="middle">Skövde</text>
            <text x="180" y="300" className="node-sub" textAnchor="middle">Trollhättan</text>
            <text x="560" y="400" className="node-sub" textAnchor="middle">Borås</text>
            <text x="200" y="420" className="node-sub" textAnchor="middle">Kungälv</text>
            <text x="700" y="290" className="node-sub" textAnchor="middle">Västra Frölunda</text>

            {/* Lines hub ↔ nodes */}
            {d.nodes.map(n => {
              const ok = n.status === 'online';
              const warn = n.status === 'replaying';
              const off = n.status === 'offline';
              return (
                <g key={'l'+n.id}>
                  <line x1={d.hub.x} y1={d.hub.y} x2={n.x} y2={n.y}
                        stroke={off?'rgba(184,50,44,0.35)':warn?'rgba(184,134,11,0.45)':'rgba(13,115,119,0.4)'}
                        strokeWidth={off?1.2:1.8} strokeDasharray={off?'3,4':undefined}/>
                  {!off && (
                    <line x1={d.hub.x} y1={d.hub.y} x2={n.x} y2={n.y}
                          stroke={warn?'var(--amber)':'var(--teal)'} strokeWidth="2"
                          strokeDasharray="4,8" style={{animation:'flow 1.6s linear infinite'}} opacity="0.7"/>
                  )}
                </g>
              );
            })}

            {/* Central hub */}
            <g transform={`translate(${d.hub.x},${d.hub.y})`} style={{cursor:'pointer'}}>
              <circle r="28" fill="var(--navy)"/>
              <circle r="22" fill="none" stroke="var(--teal)" strokeWidth="2"/>
              <text y="3" textAnchor="middle" fill="#fff" fontSize="10" fontWeight="600">HUB</text>
              <text y="50" textAnchor="middle" className="node-label">Central Hub</text>
              <text y="63" textAnchor="middle" className="node-sub">Göteborg DC</text>
            </g>

            {/* Nodes */}
            {d.nodes.map(n => {
              const ok = n.status === 'online';
              const off = n.status === 'offline';
              const warn = n.status === 'replaying';
              return (
                <g key={n.id} transform={`translate(${n.x},${n.y})`} style={{cursor:'pointer'}}
                   onClick={() => setSelected(n.id)}>
                  {off && <circle r="22" fill="var(--red)" opacity="0.2" style={{animation:'pulseRing 1.8s infinite',transformOrigin:'0 0'}}/>}
                  <circle r="18" fill="var(--surface)" stroke={statusCol[n.status]}
                          strokeWidth={selected===n.id?3:2}/>
                  <text y="3" textAnchor="middle" fontSize="10" fontWeight="600" fill="var(--ink)">{n.name}</text>
                  <text y="36" textAnchor="middle" className="node-label">{n.name}</text>
                  <text y="48" textAnchor="middle" className="node-sub">
                    {ok && `lag ${n.lag}s`}
                    {warn && `replaying ${n.buffered}`}
                    {off && 'offline'}
                  </text>
                </g>
              );
            })}
          </svg>
        </div>

        <div className="topo-side">
          <div style={{marginBottom:14}}>
            <div className="label" style={{marginBottom:6}}>Vald nod</div>
            <div style={{fontSize:16,fontWeight:600}}>{sel.hospital}</div>
            <div className="meta" style={{marginTop:2}}>Edge {sel.name}</div>
          </div>

          <div style={{display:'flex',alignItems:'center',gap:8,marginBottom:16}}>
            <span style={{width:10,height:10,borderRadius:'50%',background:statusCol[sel.status]}}/>
            <strong style={{color:statusCol[sel.status],fontSize:13}}>{statusLabel[sel.status]}</strong>
          </div>

          <div style={{display:'grid',gridTemplateColumns:'1fr 1fr',gap:8,marginBottom:16}}>
            <div>
              <div className="label" style={{fontSize:10,marginBottom:3}}>Lag</div>
              <div className="mono" style={{fontSize:14,fontWeight:500}}>{sel.lag!==null ? sel.lag+'s' : '—'}</div>
            </div>
            <div>
              <div className="label" style={{fontSize:10,marginBottom:3}}>Uptime</div>
              <div className="mono" style={{fontSize:12,fontWeight:500}}>{sel.uptime}</div>
            </div>
            <div>
              <div className="label" style={{fontSize:10,marginBottom:3}}>CDC events</div>
              <div className="mono" style={{fontSize:13}}>{sel.events.toLocaleString('sv-SE')}</div>
            </div>
            <div>
              <div className="label" style={{fontSize:10,marginBottom:3}}>Buffrade</div>
              <div className="mono" style={{fontSize:13,color:sel.buffered?'var(--amber)':'var(--ink)'}}>
                {sel.buffered || '—'}
              </div>
            </div>
          </div>

          {sel.cache && (
            <div style={{padding:12,background:'var(--surface)',border:'1px solid var(--line)',borderRadius:3,marginBottom:14}}>
              <div className="label" style={{marginBottom:6}}>FHIR-cache</div>
              <div style={{fontSize:12,display:'flex',justifyContent:'space-between'}}>
                <span>Patienter</span><span className="mono">{sel.cache.patients.toLocaleString('sv-SE')}</span>
              </div>
              <div style={{fontSize:12,display:'flex',justifyContent:'space-between',marginTop:3}}>
                <span>Storlek</span><span className="mono">{sel.cache.sizeMb} MB</span>
              </div>
            </div>
          )}

          <div style={{fontSize:12,color:'var(--ink-3)',lineHeight:1.6}}>
            <div style={{display:'flex',justifyContent:'space-between',padding:'4px 0',borderTop:'1px solid var(--line)'}}>
              <span>Källsystem ansluten</span>
              <span>{sel.status!=='offline' ? '✓' : '✕'}</span>
            </div>
            <div style={{display:'flex',justifyContent:'space-between',padding:'4px 0',borderTop:'1px solid var(--line)'}}>
              <span>Central hub ansluten</span>
              <span>{sel.status!=='offline' ? '✓' : '✕'}</span>
            </div>
            <div style={{display:'flex',justifyContent:'space-between',padding:'4px 0',borderTop:'1px solid var(--line)'}}>
              <span>Senaste heartbeat</span>
              <span className="mono">{sel.status==='offline' ? '8 min sedan' : '4s sedan'}</span>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

// ================== DATAKVALITET ==================
function QualityPage() {
  const d = window.QUALITY;
  const maxBar = Math.max(...d.byType.map(x => x.count));
  const maxTrend = Math.max(...d.bySource.flatMap(s => s.trend));
  return (
    <div className="admin-page">
      <h1>Datakvalitet</h1>
      <p className="page-sub">Data Quality Dashboard · felfrekvenser, terminologi, dubbletter</p>

      <div className="kpi-grid">
        {d.kpis.map(k => (
          <div key={k.name} className={`kpi-card ${k.ok?'ok':'warn'}`}>
            <div className="kpi-label">{k.name}</div>
            <div className="kpi-val tnum">{k.value}<span className="suffix">{k.unit}</span></div>
            <div className="kpi-foot">
              Mål {k.target} ·{' '}
              {k.delta > 0 && <span className="delta-up">▲ {k.delta}%</span>}
              {k.delta < 0 && <span className="delta-down">▼ {Math.abs(k.delta)}%</span>}
              {k.delta === 0 && <span>● stabil</span>}
            </div>
          </div>
        ))}
      </div>

      <div className="admin-section">
        <h2>Felfrekvens per typ</h2>
        <div className="card"><div className="card-body">
          {d.byType.map(b => (
            <div key={b.type} className="bar-row">
              <span className="mono" style={{fontSize:11}}>{b.type}</span>
              <div className="bar-track">
                <div className="bar-fill" style={{width:`${(b.count/maxBar)*100}%`, background: b.ok?'var(--teal)':'var(--red)'}}/>
              </div>
              <span className="tnum" style={{textAlign:'right'}}>{b.count.toLocaleString('sv-SE')}</span>
            </div>
          ))}
        </div></div>
      </div>

      <div className="admin-section">
        <h2>Felfrekvens per källsystem · senaste 7 dagar</h2>
        <div className="card"><div className="card-body">
          {d.bySource.map(s => {
            const W = 300, H = 28;
            const step = W / (s.trend.length - 1);
            const y = v => H - (v / maxTrend) * (H - 4) - 2;
            const path = s.trend.map((v,i) => `${i===0?'M':'L'} ${i*step} ${y(v)}`).join(' ');
            return (
              <div key={s.source} className="qtrend">
                <div><SourceBadge source={s.source}/></div>
                <svg width={W} height={H}>
                  <path d={path} fill="none" stroke="var(--teal)" strokeWidth="1.5"/>
                  {s.trend.map((v,i) => <circle key={i} cx={i*step} cy={y(v)} r="2" fill="var(--teal)"/>)}
                </svg>
                <span className="tnum mono" style={{textAlign:'right',fontWeight:500}}>{s.pct}%</span>
              </div>
            );
          })}
        </div></div>
      </div>
    </div>
  );
}

// ================== ÅTKOMSTLOGG ==================
function AuditPage() {
  const [filter, setFilter] = useStateA('all');
  const rows = window.AUDIT.filter(r => filter === 'all' || r.outcome === filter);
  const outcomeStyle = {
    success:   { cls:'badge-green', label:'✓ Success' },
    denied:    { cls:'badge-red',   label:'✕ Nekad' },
    emergency: { cls:'badge-amber', label:'⚠ Nödöppning' }
  };
  return (
    <div className="admin-page">
      <h1>Åtkomstlogg</h1>
      <p className="page-sub">PDL-compliance · sökbar, filtrerbar, exporterbar</p>

      <div style={{display:'grid',gridTemplateColumns:'1fr 1fr 140px 140px auto',gap:8,marginBottom:16}}>
        <input className="input" placeholder="Personnummer"/>
        <input className="input" placeholder="Användare (HSA-ID)"/>
        <input className="input" placeholder="Från datum"/>
        <input className="input" placeholder="Till datum"/>
        <button className="btn btn-primary">Sök</button>
      </div>

      <div className="filter-bar">
        {[
          { id:'all', label:'Alla ('+window.AUDIT.length+')' },
          { id:'success', label:'✓ Success' },
          { id:'denied', label:'✕ Nekade' },
          { id:'emergency', label:'⚠ Nödöppningar' }
        ].map(o => (
          <button key={o.id} className={`filter-chip ${filter===o.id?'active':''}`} onClick={()=>setFilter(o.id)}>{o.label}</button>
        ))}
        <div style={{flex:1}}/>
        <button className="btn btn-sm">Exportera CSV</button>
      </div>

      <div className="card" style={{overflow:'hidden'}}>
        <table className="table">
          <thead>
            <tr>
              <th style={{width:150}}>Tidpunkt</th>
              <th>Användare</th>
              <th>Roll</th>
              <th>Åtgärd</th>
              <th>Resurs</th>
              <th>Patient</th>
              <th>Vårdenhet</th>
              <th>Ändamål</th>
              <th>Utfall</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((r,i) => {
              const o = outcomeStyle[r.outcome];
              const rowBg = r.outcome==='emergency' ? 'rgba(184,134,11,0.06)' : r.outcome==='denied' ? 'rgba(184,50,44,0.05)' : undefined;
              return (
                <React.Fragment key={i}>
                  <tr style={{background: rowBg}}>
                    <td className="mono" style={{fontSize:12}}>{r.ts}</td>
                    <td>
                      <div style={{fontSize:13}}>{r.user}</div>
                      <div className="mono" style={{fontSize:10,color:'var(--ink-3)'}}>{r.hsa}</div>
                    </td>
                    <td className="meta">{r.role}</td>
                    <td><span className="badge badge-plain">{r.action}</span></td>
                    <td className="mono" style={{fontSize:12}}>{r.resource}</td>
                    <td className="mono" style={{fontSize:12}}>{r.patient}</td>
                    <td className="meta">{r.unit}</td>
                    <td className="meta">{r.purpose}</td>
                    <td><span className={`badge ${o.cls}`}>{o.label}</span></td>
                  </tr>
                  {r.reason && (
                    <tr className="subrow" style={{background: rowBg}}>
                      <td colSpan={9} style={{fontSize:12,color:r.outcome==='denied'?'var(--red)':'var(--amber)'}}>
                        {r.outcome==='emergency' ? '⚠ Motivering: ' : '↳ Anledning: '}
                        <em>"{r.reason}"</em>
                      </td>
                    </tr>
                  )}
                </React.Fragment>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}

// ================== INSTÄLLNINGAR ==================
function SettingsPage({ tweaks, setTweak, PDL_CONTEXTS }) {
  return (
    <div className="admin-page" style={{maxWidth: 820}}>
      <h1>Inställningar</h1>
      <p className="page-sub">PDL-kontext, visning, edge-konfiguration</p>

      <div className="admin-section">
        <h2>PDL-kontext</h2>
        <div className="card"><div className="card-body">
          <div style={{display:'grid',gridTemplateColumns:'160px 1fr',gap:'12px 16px',alignItems:'center',fontSize:13}}>
            <label className="label" style={{margin:0}}>Vårdenhet</label>
            <select className="input" value={tweaks.pdlContext} onChange={e=>setTweak('pdlContext', e.target.value)}>
              {Object.entries(PDL_CONTEXTS).map(([k,v]) => <option key={k} value={k}>{v.unit}</option>)}
            </select>
            <label className="label" style={{margin:0}}>Vårdgivare</label>
            <div>{PDL_CONTEXTS[tweaks.pdlContext].provider}</div>
            <label className="label" style={{margin:0}}>Ändamål</label>
            <div><span className="badge badge-teal">{PDL_CONTEXTS[tweaks.pdlContext].purpose}</span></div>
            <label className="label" style={{margin:0}}>Laglig grund</label>
            <div className="mono" style={{fontSize:12}}>{PDL_CONTEXTS[tweaks.pdlContext].legalBasis}</div>
          </div>
        </div></div>
      </div>

      <div className="admin-section">
        <h2>Visning</h2>
        <div className="card"><div className="card-body" style={{display:'flex',flexDirection:'column',gap:10}}>
          <div style={{display:'grid',gridTemplateColumns:'160px 1fr',alignItems:'center',gap:12}}>
            <label className="label" style={{margin:0}}>Tema</label>
            <div style={{display:'flex',gap:6}}>
              <button className="filter-chip active">Ljust</button>
              <button className="filter-chip">Mörkt</button>
              <button className="filter-chip">Auto</button>
            </div>
          </div>
          <div style={{display:'grid',gridTemplateColumns:'160px 1fr',alignItems:'center',gap:12}}>
            <label className="label" style={{margin:0}}>Tabellrader/sida</label>
            <div style={{display:'flex',gap:6}}>
              <button className="filter-chip">25</button>
              <button className="filter-chip active">50</button>
              <button className="filter-chip">100</button>
            </div>
          </div>
          <div style={{display:'grid',gridTemplateColumns:'160px 1fr',alignItems:'center',gap:12}}>
            <label className="label" style={{margin:0}}>Standardflik</label>
            <div style={{display:'flex',gap:6}}>
              <button className="filter-chip active">Tidslinje</button>
              <button className="filter-chip">Läkemedel</button>
              <button className="filter-chip">Labb</button>
            </div>
          </div>
        </div></div>
      </div>

      <div className="admin-section">
        <h2>Edge-konfiguration</h2>
        <div className="card"><div className="card-body" style={{fontSize:13}}>
          <div style={{display:'flex',justifyContent:'space-between',padding:'6px 0'}}>
            <span>Aktiv edge-nod</span><span className="mono"><strong>Edge SU</strong> (auto-detekterad)</span>
          </div>
          <div style={{display:'flex',justifyContent:'space-between',padding:'6px 0',borderTop:'1px solid var(--line)'}}>
            <span>Tvinga datakälla</span>
            <div style={{display:'flex',gap:6}}>
              <button className="filter-chip active">Auto</button>
              <button className="filter-chip">Central</button>
              <button className="filter-chip">Lokal</button>
            </div>
          </div>
        </div></div>
      </div>
    </div>
  );
}

Object.assign(window, { SystemPage, TopologyPage, QualityPage, AuditPage, SettingsPage });
