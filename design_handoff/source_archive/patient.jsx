// Patient page — banner, allergies, CDS, tabs
const { useState: useStateP } = React;

function PatientBanner({ patient, offline }) {
  const initials = patient.firstName[0] + patient.lastName[0];
  return (
    <div className="patient-banner">
      <div className="avatar-big">{initials}</div>
      <h2 className="name-big">{patient.name}</h2>
      <div className="pnr-big mono">{patient.pnr}</div>
      <div className="bio">{patient.age} år · {patient.sex}</div>
      <div className="patient-detail-row">
        <span className="k">Adress</span>
        <span className="v">{patient.address}</span>
      </div>
      <div className="patient-detail-row">
        <span className="k">Telefon</span>
        <span className="v mono">{patient.phone}</span>
      </div>
      <div className="patient-detail-row">
        <span className="k">Datakällor</span>
        <span className="v" style={{display:'flex',flexWrap:'wrap',gap:4}}>
          {patient.sources.map(s => <SourceBadge key={s} source={s}/>)}
        </span>
      </div>
      <div className="edge-indicator">
        <span className="dot"/>
        {offline ? (
          <span>Cachedata · Edge {patient.servingEdge}</span>
        ) : (
          <span>Serverad från Edge {patient.servingEdge} · lag 2.1s</span>
        )}
      </div>
    </div>
  );
}

function AllergyCard({ allergies }) {
  if (!allergies || allergies.length === 0) {
    return (
      <div className="card" style={{borderLeft:'3px solid var(--green)'}}>
        <div className="card-body" style={{padding:'10px 14px',display:'flex',alignItems:'center',gap:8}}>
          <Icon name="check" size={14}/>
          <div>
            <div style={{fontWeight:500, fontSize:13}}>Inga kända allergier</div>
            <div style={{fontSize:11,color:'var(--ink-3)'}}>Kontrollerat i Melior, AsynjaVisph</div>
          </div>
        </div>
      </div>
    );
  }
  return (
    <div className="allergy-card">
      <h3 className="h3" style={{color:'var(--red)'}}>
        <Icon name="alert" size={13}/> Allergier
      </h3>
      {allergies.map((a, i) => (
        <div key={i} className="allergy-item">
          <div className="drug">{a.drug}</div>
          <div className="reaction">{a.reaction} · {a.severity}</div>
          <div style={{display:'flex',gap:6,alignItems:'center'}}>
            <SourceBadge source={a.source}/>
            {a.verified > 1 && <span className="badge badge-teal">Verifierad i {a.verified} system</span>}
          </div>
        </div>
      ))}
    </div>
  );
}

function CdsCard({ card }) {
  const label = card.indicator === 'critical' ? 'Kritisk' : card.indicator === 'warning' ? 'Varning' : 'Info';
  return (
    <div className={`cds-card ${card.indicator}`}>
      <div className="indicator-row">
        <span className="indicator">{label}</span>
        {card.indicator === 'critical' && <span className="pulse"/>}
      </div>
      <div className="summary">{card.summary}</div>
      {card.detail && <div className="detail">{card.detail}</div>}
      <div className="source">{card.source}</div>
      {card.suggestions && (
        <div className="suggestions">
          {card.suggestions.map((s, i) => (
            <button key={i} className={`btn btn-sm ${i === 0 && card.indicator === 'critical' ? 'btn-red' : ''}`}>
              {s}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

function CdsStack({ cards }) {
  const sorted = [...cards].sort((a, b) => {
    const order = { critical: 0, warning: 1, info: 2 };
    return order[a.indicator] - order[b.indicator];
  });
  return (
    <div>
      <div className="section-head">
        <h3 className="h3">CDS-varningar</h3>
        <span className="meta">{cards.length} aktiva</span>
      </div>
      <div className="cds-stack">
        {sorted.map((c, i) => <CdsCard key={i} card={c}/>)}
      </div>
    </div>
  );
}

// ---- Tabs ----

function TimelineTab({ patient }) {
  const [filter, setFilter] = useStateP('all');
  const filtered = filter === 'all' ? patient.timeline : patient.timeline.filter(e => e.type === filter);
  const typeLabels = {
    all: 'Alla',
    encounter: 'Vårdkontakter',
    procedure: 'Ingrepp',
    critical: 'Kritiska',
    diagnosis: 'Diagnoser',
    medication: 'Läkemedel',
    lab: 'Lab'
  };
  return (
    <div>
      <div className="filter-bar">
        {Object.entries(typeLabels).map(([k, v]) => (
          <button key={k} className={`filter-chip ${filter === k ? 'active' : ''}`} onClick={() => setFilter(k)}>
            {v}
          </button>
        ))}
      </div>
      <div className="timeline">
        {filtered.map((e, i) => (
          <div key={i} className={`tl-item type-${e.type}`}>
            <div className="date mono">{e.date}</div>
            <div className="node"/>
            <div className="body">
              <div className="title">{e.title}</div>
              <div className="sub">{e.sub}</div>
              {e.note && <div style={{fontSize:12,color:'var(--ink-2)',marginTop:4,lineHeight:1.5}}>{e.note}</div>}
              <div className="extras">
                <SourceBadge source={e.source}/>
              </div>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

function MedicationsTab({ patient }) {
  const active = patient.medications;
  return (
    <div>
      <div className="filter-bar">
        <button className="filter-chip active">Aktiva ({active.length})</button>
        <button className="filter-chip">Avslutade</button>
        <button className="filter-chip">Alla</button>
        <div style={{flex:1}}/>
        <span className="meta">Sorterat på startdatum (nyast)</span>
      </div>
      <div className="card" style={{overflow:'hidden'}}>
        <table className="table">
          <thead>
            <tr>
              <th>Läkemedel</th>
              <th>Styrka</th>
              <th>Dosering</th>
              <th>Adm.</th>
              <th>Startdatum</th>
              <th>Förskrivare</th>
              <th>Källa</th>
            </tr>
          </thead>
          <tbody>
            {active.map((m, i) => (
              <React.Fragment key={i}>
                <tr className={m.anticoag ? 'anticoag' : ''}>
                  <td>
                    <div style={{display:'flex',alignItems:'center',gap:6}}>
                      {m.anticoag && <Icon name="alert" size={13} className="qflag" />}
                      <span style={{fontWeight:500}}>{m.name}</span>
                      {m.dup && <span className="badge badge-plain" style={{marginLeft:4}}>2 källor</span>}
                    </div>
                    <div className="mono" style={{fontSize:11,color:'var(--ink-3)'}}>{m.atc}</div>
                  </td>
                  <td>{m.strength}</td>
                  <td>{m.dose}</td>
                  <td>{m.route}</td>
                  <td className="mono">{m.start}</td>
                  <td>{m.prescriber}</td>
                  <td><SourceBadge source={m.source}/></td>
                </tr>
                {m.anticoag && (
                  <tr className="subrow">
                    <td colSpan={7}>
                      <div style={{display:'flex',alignItems:'center',gap:16}}>
                        <span style={{color:'var(--red)',fontWeight:500}}>Antikoagulantia</span>
                        <span>Senaste INR: <strong>{m.inr}</strong> ({m.inrDate})</span>
                        <span className="meta">Målområde 2.0 – 3.0</span>
                        <span style={{flex:1}}/>
                        <button className="btn btn-sm">Visa INR-trend</button>
                      </div>
                    </td>
                  </tr>
                )}
              </React.Fragment>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

function LabsTab({ patient }) {
  const srcColorMap = { flexlab: '#0D7377', 'melior-su': '#2E5090', asynja: '#2F7D4E' };
  return (
    <div>
      <div className="filter-bar">
        <button className="filter-chip active">Alla</button>
        <button className="filter-chip">Endast flaggade</button>
        <button className="filter-chip">Senaste månaden</button>
        <div style={{flex:1}}/>
        <span className="meta">{patient.labs.length} analyser</span>
      </div>
      <div className="card" style={{overflow:'hidden'}}>
        <table className="table">
          <thead>
            <tr>
              <th>Analys</th>
              <th style={{textAlign:'right'}}>Värde</th>
              <th>Enhet</th>
              <th>Referens</th>
              <th>Flagga</th>
              <th>Trend</th>
              <th>Datum</th>
              <th>Beställare</th>
              <th>Källa</th>
            </tr>
          </thead>
          <tbody>
            {patient.labs.map((l, i) => (
              <tr key={i}>
                <td>
                  <div style={{fontWeight:500,display:'flex',alignItems:'center',gap:6}}>
                    {l.name}
                    {l.anticoagTarget && <span className="badge badge-red" style={{fontSize:10}}>Waran-mål</span>}
                  </div>
                  <div className="mono" style={{fontSize:11,color:'var(--ink-3)'}}>LOINC {l.loinc}</div>
                </td>
                <td className="num" style={{textAlign:'right',fontWeight: l.flag ? 600 : 400}}>{l.value}</td>
                <td className="meta">{l.unit}</td>
                <td className="mono" style={{fontSize:12}}>{l.refLow}–{l.refHigh}</td>
                <td>{l.flag && <span className={`flag flag-${l.flag}`}>{l.flag}</span>}</td>
                <td><Sparkline data={l.trend} color={srcColorMap[l.source] || '#0D7377'}/></td>
                <td className="mono" style={{fontSize:12}}>{l.date}</td>
                <td className="meta">{l.orderer}</td>
                <td><SourceBadge source={l.source}/></td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

function ProceduresTab({ patient }) {
  if (patient.procedures.length === 0) {
    return <div className="meta" style={{padding:20}}>Inga registrerade ingrepp.</div>;
  }
  return (
    <div>
      <div className="filter-bar">
        <span className="meta">{patient.procedures.length} ingrepp · sorterat kronologiskt (nyast)</span>
      </div>
      {patient.procedures.map((p, i) => (
        <div key={i} className="proc-card">
          <div className="header-row">
            <div style={{flex:1}}>
              <div className="title">{p.name}</div>
              <div className="sub">
                <span>KVÅ <strong className="mono">{p.kva}</strong></span>
                <span>SNOMED <strong className="mono">{p.snomed}</strong></span>
                <span className="mono">{p.date}</span>
                {p.duration && <span>{p.duration} min</span>}
              </div>
            </div>
            <SourceBadge source={p.source}/>
          </div>
          <div className="body">
            <div className="proc-details">
              <dl className="dl">
                <dt>Kirurg</dt>
                <dd>{p.surgeon}{p.surgeonId && <span className="mono" style={{color:'var(--ink-3)',marginLeft:6,fontSize:11}}>({p.surgeonId})</span>}</dd>
                <dt>Anestesi</dt>
                <dd>{p.anesthesia}</dd>
                {p.side && <><dt>Sida</dt><dd>{p.side}</dd></>}
                {p.complications && <><dt style={{color:'var(--red)'}}>Komplikationer</dt><dd style={{color:'var(--red)'}}>{p.complications}</dd></>}
                {p.note && <><dt>Anteckning</dt><dd>{p.note}</dd></>}
              </dl>
            </div>
            {p.implant ? (
              <div className="proc-implant">
                <h4><Icon name="bone" size={11}/> Implantat</h4>
                <dl className="dl">
                  <dt>Typ</dt><dd>{p.implant.type}</dd>
                  <dt>Tillverkare</dt><dd>{p.implant.manufacturer}</dd>
                  <dt>Modell</dt><dd>{p.implant.model}</dd>
                  <dt>Storlek</dt><dd className="mono" style={{fontSize:12}}>{p.implant.size}</dd>
                </dl>
              </div>
            ) : (
              <div className="proc-implant" style={{background:'var(--surface-alt)',borderLeftColor:'var(--line-2)'}}>
                <h4 style={{color:'var(--ink-3)'}}>Inget implantat registrerat</h4>
              </div>
            )}
          </div>
        </div>
      ))}
    </div>
  );
}

function PatientPage({ patient, offline, onBack }) {
  const [tab, setTab] = useStateP('timeline');
  const tabs = [
    { id: 'timeline', label: 'Tidslinje', count: patient.timeline.length },
    { id: 'medications', label: 'Läkemedel', count: patient.medications.length },
    { id: 'labs', label: 'Labb', count: patient.labs.length },
    { id: 'procedures', label: 'Ingrepp', count: patient.procedures.length },
    { id: 'diagnoses', label: 'Diagnoser', count: (patient.diagnoses||[]).filter(d => d.status==='Aktiv').length },
    { id: 'vitals', label: 'Vitala' },
    { id: 'encounters', label: 'Kontakter', count: (patient.encounters||[]).length }
  ];
  return (
    <div className="patient-page">
      <div className="left-col">
        <button className="back-link" onClick={onBack}>
          <Icon name="arrowLeft" size={14}/> Tillbaka till sökning
        </button>
        <PatientBanner patient={patient} offline={offline}/>
        <AllergyCard allergies={patient.allergies}/>
        <CdsStack cards={patient.cdsAlerts}/>
      </div>
      <div className="right-col">
        <div className="tabs">
          {tabs.map(t => (
            <div key={t.id} className={`tab ${tab === t.id ? 'active' : ''}`} onClick={() => setTab(t.id)}>
              {t.label}
              {t.count !== undefined && <span className="count">{t.count}</span>}
            </div>
          ))}
        </div>
        {tab === 'timeline' && <TimelineTab patient={patient}/>}
        {tab === 'medications' && <MedicationsTab patient={patient}/>}
        {tab === 'labs' && <LabsTab patient={patient}/>}
        {tab === 'procedures' && <ProceduresTab patient={patient}/>}
        {tab === 'diagnoses' && <DiagnosesTab patient={patient}/>}
        {tab === 'vitals' && <VitalsTab patient={patient}/>}
        {tab === 'encounters' && <EncountersTab patient={patient}/>}
      </div>
    </div>
  );
}

function EmptyTab({ name }) {
  return (
    <div style={{padding:'60px 20px',textAlign:'center',color:'var(--ink-3)'}}>
      <div style={{fontSize:13,marginBottom:6}}>{name}</div>
      <div style={{fontSize:12}}>Vy ej implementerad i denna demo.</div>
    </div>
  );
}

// ---- Diagnoser ----
function DiagnosesTab({ patient }) {
  const active = (patient.diagnoses || []).filter(d => d.status === 'Aktiv');
  const done = (patient.diagnoses || []).filter(d => d.status !== 'Aktiv');
  const typeColors = { PRIMARY: 'badge-teal', SECONDARY: 'badge-plain', COMPLICATION: 'badge-red' };
  const typeLabels = { PRIMARY: 'Primär', SECONDARY: 'Bidiagnos', COMPLICATION: 'Komplikation' };
  return (
    <div>
      <div className="filter-bar">
        <span className="meta">{active.length} aktiva · {done.length} avslutade</span>
        <div style={{flex:1}}/>
        <span className="meta">Kodverk: ICD-10-SE</span>
      </div>
      <div className="card" style={{overflow:'hidden',marginBottom:16}}>
        <div className="card-header"><h3 className="h3">Aktiva diagnoser</h3></div>
        <table className="table">
          <thead>
            <tr>
              <th style={{width:90}}>ICD-10</th>
              <th>Diagnos</th>
              <th>Typ</th>
              <th>Diagnostiserad</th>
              <th>Av</th>
              <th>Källa</th>
            </tr>
          </thead>
          <tbody>
            {active.map((d, i) => (
              <React.Fragment key={i}>
                <tr>
                  <td className="mono" style={{fontWeight:500}}>{d.code}</td>
                  <td>
                    {d.text}
                    {d.verifiedIn > 1 && <span className="badge badge-teal" style={{marginLeft:6}}>Registrerad i {d.verifiedIn} system</span>}
                  </td>
                  <td><span className={`badge ${typeColors[d.type]}`}>{typeLabels[d.type]}</span></td>
                  <td className="mono" style={{fontSize:12}}>{d.date}</td>
                  <td>{d.by}</td>
                  <td><SourceBadge source={d.source}/></td>
                </tr>
                {d.relatedTo && (
                  <tr className="subrow"><td colSpan={6}>
                    <span style={{color:'var(--red)'}}>↳ Komplikation till</span> <span className="mono">{d.relatedTo}</span>
                  </td></tr>
                )}
              </React.Fragment>
            ))}
          </tbody>
        </table>
      </div>
      {done.length > 0 && (
        <div className="card" style={{overflow:'hidden',opacity:0.75}}>
          <div className="card-header"><h3 className="h3" style={{color:'var(--ink-3)'}}>Avslutade diagnoser</h3></div>
          <table className="table">
            <tbody>
              {done.map((d, i) => (
                <tr key={i}>
                  <td className="mono" style={{width:90}}>{d.code}</td>
                  <td>{d.text}</td>
                  <td className="mono" style={{fontSize:12}}>{d.date}</td>
                  <td><SourceBadge source={d.source}/></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

// ---- Vitala ----
function TrendChart({ series, dates }) {
  const W = 720, H = 220, pad = { l: 40, r: 20, t: 20, b: 30 };
  const allVals = [...series.bp_sys, ...series.bp_dia, ...series.pulse];
  const min = Math.min(...allVals) - 10;
  const max = Math.max(...allVals) + 10;
  const xStep = (W - pad.l - pad.r) / (dates.length - 1);
  const y = v => pad.t + (1 - (v - min) / (max - min)) * (H - pad.t - pad.b);
  const path = arr => arr.map((v, i) => `${i===0?'M':'L'} ${pad.l + i * xStep} ${y(v)}`).join(' ');
  const yTicks = [min, Math.round((min+max)/2), max];
  return (
    <svg width="100%" viewBox={`0 0 ${W} ${H}`} style={{background:'var(--surface)'}}>
      {/* Reference band 120/80 */}
      <rect x={pad.l} y={y(140)} width={W-pad.l-pad.r} height={y(90)-y(140)} fill="rgba(47,125,78,0.06)"/>
      <line x1={pad.l} x2={W-pad.r} y1={y(140)} y2={y(140)} stroke="var(--line-2)" strokeDasharray="3,3"/>
      <line x1={pad.l} x2={W-pad.r} y1={y(90)} y2={y(90)} stroke="var(--line-2)" strokeDasharray="3,3"/>
      {yTicks.map(t => (
        <g key={t}>
          <line x1={pad.l} x2={W-pad.r} y1={y(t)} y2={y(t)} stroke="var(--line)"/>
          <text x={pad.l-6} y={y(t)+3} textAnchor="end" fontSize="10" fill="var(--ink-3)">{t}</text>
        </g>
      ))}
      {dates.map((d, i) => (
        <text key={i} x={pad.l + i*xStep} y={H-10} textAnchor="middle" fontSize="9" fill="var(--ink-3)">
          {d.split(' ')[0].slice(5)}
        </text>
      ))}
      <path d={path(series.bp_sys)} fill="none" stroke="#B8322C" strokeWidth="1.75"/>
      <path d={path(series.bp_dia)} fill="none" stroke="#2E5090" strokeWidth="1.75"/>
      <path d={path(series.pulse)} fill="none" stroke="#0D7377" strokeWidth="1.75"/>
      {series.bp_sys.map((v, i) => <circle key={'s'+i} cx={pad.l+i*xStep} cy={y(v)} r="2.5" fill="#B8322C"/>)}
      {series.bp_dia.map((v, i) => <circle key={'d'+i} cx={pad.l+i*xStep} cy={y(v)} r="2.5" fill="#2E5090"/>)}
      {series.pulse.map((v, i) => <circle key={'p'+i} cx={pad.l+i*xStep} cy={y(v)} r="2.5" fill="#0D7377"/>)}
    </svg>
  );
}

function VitalsTab({ patient }) {
  if (!patient.vitals) return <EmptyTab name="Vitala parametrar"/>;
  const statusCol = { normal: 'var(--green)', warning: 'var(--amber)', critical: 'var(--red)' };
  return (
    <div>
      <h3 className="h3" style={{marginBottom:10}}>Senaste värden</h3>
      <div style={{display:'grid',gridTemplateColumns:'repeat(auto-fill,minmax(150px,1fr))',gap:10,marginBottom:24}}>
        {patient.vitals.latest.map((v, i) => (
          <div key={i} className="vital-card" style={{borderLeft:`3px solid ${statusCol[v.status]}`}}>
            <div className="name">{v.name}</div>
            <div>
              <span className="val tnum">{v.value}</span>
              <span className="unit">{v.unit}</span>
            </div>
            <div style={{display:'flex',justifyContent:'space-between',alignItems:'center',marginTop:4}}>
              <span className="meta mono" style={{fontSize:10}}>{v.date}</span>
              <SourceBadge source={v.source}/>
            </div>
          </div>
        ))}
      </div>
      <div className="section-head">
        <h3 className="h3">Trend</h3>
        <div style={{display:'flex',gap:14,fontSize:11,color:'var(--ink-3)'}}>
          <span><span style={{display:'inline-block',width:10,height:2,background:'#B8322C',verticalAlign:'middle',marginRight:4}}/>Systoliskt</span>
          <span><span style={{display:'inline-block',width:10,height:2,background:'#2E5090',verticalAlign:'middle',marginRight:4}}/>Diastoliskt</span>
          <span><span style={{display:'inline-block',width:10,height:2,background:'#0D7377',verticalAlign:'middle',marginRight:4}}/>Puls</span>
        </div>
      </div>
      <div className="card">
        <div className="card-body">
          <TrendChart series={patient.vitals.series} dates={patient.vitals.series.dates}/>
        </div>
      </div>
    </div>
  );
}

// ---- Encounters ----
function EncountersTab({ patient }) {
  if (!patient.encounters) return <EmptyTab name="Vårdkontakter"/>;
  const typeStyles = {
    INPATIENT:  { cls: 'badge-red', label: 'Slutenvård' },
    OUTPATIENT: { cls: 'badge-teal', label: 'Öppenvård' },
    EMERGENCY:  { cls: 'badge-red', label: 'Akut' },
    DAYCARE:    { cls: 'badge-amber', label: 'Dagsjukvård' }
  };
  return (
    <div>
      <div className="filter-bar">
        <button className="filter-chip active">Alla</button>
        <button className="filter-chip">Slutenvård</button>
        <button className="filter-chip">Öppenvård</button>
        <button className="filter-chip">Akut</button>
        <div style={{flex:1}}/>
        <span className="meta">{patient.encounters.length} vårdkontakter</span>
      </div>
      <div className="card" style={{overflow:'hidden'}}>
        <table className="table">
          <thead>
            <tr>
              <th>Typ</th>
              <th>Avdelning</th>
              <th>Inskrivning</th>
              <th>Utskrivning</th>
              <th>Ansvarig läkare</th>
              <th>Utskrivningsdiagnos</th>
              <th>Källa</th>
            </tr>
          </thead>
          <tbody>
            {patient.encounters.map((e, i) => {
              const ts = typeStyles[e.type];
              return (
                <tr key={i}>
                  <td><span className={`badge ${ts.cls}`}>{ts.label}</span></td>
                  <td>{e.unit}</td>
                  <td className="mono" style={{fontSize:12}}>{e.admit}</td>
                  <td className="mono" style={{fontSize:12}}>{e.discharge === e.admit ? '—' : e.discharge}</td>
                  <td>{e.physician}</td>
                  <td className="mono" style={{fontSize:12}}>{e.dischargeDx}</td>
                  <td><SourceBadge source={e.source}/></td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}

Object.assign(window, { PatientPage });
