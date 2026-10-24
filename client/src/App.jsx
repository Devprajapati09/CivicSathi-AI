import { useState } from 'react';
import './App.css';

function App() {
  const [view, setView] = useState('home');
  const [ticket, setTicket] = useState(null);

  return (
    <div className="app-container">
      <header className="app-header">
        <div className="header-left" onClick={() => setView('home')} style={{ cursor: 'pointer' }}>
          <span className="logo-icon">🏛️</span>
          <span className="logo-text">CivicSathi AI</span>
        </div>
        <nav className="header-nav">
          <button className={`nav-btn ${view === 'home' ? 'active' : ''}`} onClick={() => setView('home')}>Home</button>
          <button className={`nav-btn ${view === 'report' ? 'active' : ''}`} onClick={() => setView('report')}>Report</button>
          <button className={`nav-btn ${view === 'track' ? 'active' : ''}`} onClick={() => setView('track')}>Track</button>
          <button className={`nav-btn ${view === 'admin' ? 'active' : ''}`} onClick={() => setView('admin')}>Admin</button>
        </nav>
        <span className="demo-badge">⚠️ DEMO</span>
      </header>

      <main className="app-main">
        {view === 'home' && <Home onNavigate={setView} />}
        {view === 'report' && <ReportIssue onComplete={(data) => { setTicket(data); setView('receipt'); }} onCancel={() => setView('home')} />}
        {view === 'receipt' && <Receipt ticket={ticket} onDone={() => setView('home')} onTrack={() => setView('track')} />}
        {view === 'track' && <TrackStatus onDone={() => setView('home')} />}
        {view === 'admin' && <AdminPanel onDone={() => setView('home')} />}
      </main>

      <footer className="app-footer">
        <p>CivicSathi AI — Mock Municipal System for Demo Purposes Only</p>
        <p className="footer-sub">Not affiliated with any real AMC or government body.</p>
      </footer>
    </div>
  );
}

/* ─── Home ─── */
function Home({ onNavigate }) {
  const categories = [
    { key: 'pothole', icon: '🕳️', label: 'Pothole' },
    { key: 'garbage', icon: '🗑️', label: 'Garbage' },
    { key: 'broken_streetlight', icon: '💡', label: 'Streetlight' },
    { key: 'waterlogging', icon: '🌊', label: 'Waterlogging' },
  ];

  return (
    <section className="home-section">
      <div className="hero-card">
        <h1>Report Civic Issues<br /><span className="accent">In Seconds</span></h1>
        <p className="hero-subtitle">Upload a photo, specify your area, and get a real tracking ticket — powered by AI analysis.</p>
        <div className="hero-actions">
          <button className="btn-primary" onClick={() => onNavigate('report')}>🚀 Report Issue</button>
          <button className="btn-secondary" onClick={() => onNavigate('track')}>🔍 Track Complaint</button>
        </div>
      </div>

      <div className="category-chips">
        <p className="chips-label">Common Issue Categories</p>
        <div className="chips-row">
          {categories.map(c => (
            <span key={c.key} className="chip">{c.icon} {c.label}</span>
          ))}
        </div>
      </div>

      <div className="demo-notice">
        <span>🔬</span> This is a hackathon prototype using demo data. No real municipal submissions are made.
      </div>
    </section>
  );
}

/* ─── ReportIssue ─── */
function ReportIssue({ onComplete, onCancel }) {
  const [photo, setPhoto] = useState(null);
  const [previewUrl, setPreviewUrl] = useState('');
  const [area, setArea] = useState('');
  const [scenario, setScenario] = useState('');
  const [loading, setLoading] = useState(false);
  const [analysis, setAnalysis] = useState(null);
  const [error, setError] = useState('');
  const [agentSteps, setAgentSteps] = useState([]);
  const [duplicates, setDuplicates] = useState(null);
  const [impact, setImpact] = useState(null);
  const [step, setStep] = useState('upload'); // upload | review

  const addAgentStep = (name, detail, status = 'success') => {
    setAgentSteps(prev => [...prev, { name, detail, status, time: new Date().toLocaleTimeString() }]);
  };

  const handlePhotoChange = (e) => {
    const file = e.target.files[0];
    if (!file) return;
    const allowed = ['image/jpeg', 'image/png', 'image/webp'];
    if (!allowed.includes(file.type)) {
      setError('Invalid file type. Please upload JPG, PNG, or WebP only.');
      return;
    }
    if (file.size > 8 * 1024 * 1024) {
      setError('File too large. Maximum 8 MB.');
      return;
    }
    setPhoto(file);
    setPreviewUrl(URL.createObjectURL(file));
    setError('');
  };

  const startAnalysis = async () => {
    if (!photo || !area.trim()) {
      setError('Please provide a photo and area name.');
      return;
    }
    setLoading(true);
    setError('');
    setAgentSteps([]);
    setDuplicates(null);
    setImpact(null);

    try {
      // Step 1: Analyze image
      addAgentStep('🔍 Analyze Image', 'Sending photo to vision model…', 'running');
      const form = new FormData();
      form.append('photo', photo);
      form.append('area', area);
      if (scenario) form.append('hintScenario', scenario);
      const res = await fetch('/api/analyze', { method: 'POST', body: form });
      const data = await res.json();

      if (!data.success) {
        addAgentStep('🔍 Analyze Image', data.error || 'Analysis failed', 'error');
        setError(data.error || 'Analysis failed');
        return;
      }
      setAnalysis(data.analysis);
      addAgentStep('🔍 Analyze Image', `Detected: ${data.analysis.issueType} (${data.analysis.analysisMode})`, 'success');

      // Step 2: Ward lookup
      addAgentStep('📍 Ward Lookup', `Looking up area "${area}"…`, 'running');
      const wardRes = await fetch(`/api/wards/lookup?area=${encodeURIComponent(area)}&issueType=${encodeURIComponent(data.analysis.issueType)}`);
      const wardData = await wardRes.json();
      if (wardData.ward) {
        addAgentStep('📍 Ward Lookup', `Matched: ${wardData.ward.wardName}`, 'success');
      } else {
        addAgentStep('📍 Ward Lookup', 'Area not recognized — please correct below.', 'warning');
      }

      // Step 3: Duplicate check
      addAgentStep('🔁 Duplicate Check', 'Checking for similar unresolved reports…', 'running');
      const dupRes = await fetch('/api/complaints/duplicates', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ issueType: data.analysis.issueType, areaName: area })
      });
      const dupData = await dupRes.json();
      setDuplicates(dupData);
      if (dupData.hasPossibleDuplicates) {
        addAgentStep('🔁 Duplicate Check', `Found ${dupData.count} similar report(s)`, 'warning');
      } else {
        addAgentStep('🔁 Duplicate Check', 'No duplicates found.', 'success');
      }

      // Step 4: Impact score
      addAgentStep('📊 Impact Score', 'Calculating civic impact…', 'running');
      const impRes = await fetch('/api/complaints/impact-score', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          severity: data.analysis.severity,
          issueType: data.analysis.issueType,
          duplicateCount: dupData.count || 0
        })
      });
      const impData = await impRes.json();
      setImpact(impData.impact);
      addAgentStep('📊 Impact Score', `Score: ${impData.impact?.totalScore}/100`, 'success');

      setStep('review');
    } catch (e) {
      setError(e.message);
      addAgentStep('❌ Error', e.message, 'error');
    } finally {
      setLoading(false);
    }
  };

  const submitTicket = async () => {
    if (!analysis) return;
    setLoading(true);
    setError('');
    addAgentStep('📝 Create Ticket', 'Submitting confirmed complaint…', 'running');
    try {
      const payload = {
        issueType: analysis.issueType,
        areaName: area,
        wardId: analysis.wardId,
        wardName: analysis.wardName,
        departmentId: analysis.suggestedDepartmentId,
        departmentName: analysis.departmentName,
        imagePath: previewUrl,
        severity: analysis.severity,
        description: analysis.description,
        analysisMode: analysis.analysisMode
      };
      const res = await fetch('/api/complaints', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload)
      });
      const result = await res.json();
      if (result.success) {
        addAgentStep('📝 Create Ticket', `Ticket ${result.ticket.ticketId} created!`, 'success');
        onComplete(result.ticket);
      } else {
        setError(result.error || 'Ticket creation failed');
        addAgentStep('📝 Create Ticket', result.error || 'Failed', 'error');
      }
    } catch (e) {
      setError(e.message);
      addAgentStep('📝 Create Ticket', e.message, 'error');
    } finally {
      setLoading(false);
    }
  };

  return (
    <section className="report-section">
      <h2>{step === 'upload' ? '📸 Report a Civic Issue' : '✅ Review & Confirm'}</h2>
      {error && <div className="error-box">{error}</div>}

      {step === 'upload' && (
        <div className="report-grid">
          <div className="upload-panel">
            <div className="form-group">
              <label>Upload Photo <span className="req">*</span></label>
              <div className="dropzone" onClick={() => document.getElementById('photo-input').click()}>
                {previewUrl ? (
                  <img src={previewUrl} alt="preview" className="preview-img" />
                ) : (
                  <div className="dropzone-placeholder">
                    <span className="dropzone-icon">📷</span>
                    <p>Click to upload (JPG, PNG, WebP — max 8 MB)</p>
                  </div>
                )}
                <input id="photo-input" type="file" accept="image/jpeg,image/png,image/webp" onChange={handlePhotoChange} style={{ display: 'none' }} />
              </div>
            </div>

            <div className="form-group">
              <label>Area / Location <span className="req">*</span></label>
              <input type="text" placeholder="e.g. Navrangpura, Satellite, Maninagar…" value={area} onChange={(e) => setArea(e.target.value)} />
            </div>

            <div className="form-group">
              <label>Demo Scenario (optional)</label>
              <select value={scenario} onChange={e => setScenario(e.target.value)}>
                <option value="">Auto-detect</option>
                <option value="pothole">Pothole</option>
                <option value="garbage">Garbage</option>
                <option value="broken_streetlight">Broken Streetlight</option>
                <option value="waterlogging">Waterlogging</option>
              </select>
            </div>

            <div className="btn-row">
              <button className="btn-secondary" onClick={onCancel}>Cancel</button>
              <button className="btn-primary" onClick={startAnalysis} disabled={loading}>
                {loading ? '⏳ Analyzing…' : '🔍 Analyze'}
              </button>
            </div>
          </div>

          {agentSteps.length > 0 && (
            <div className="agent-panel">
              <h3>🤖 Agent Activity</h3>
              <div className="agent-steps">
                {agentSteps.map((s, i) => (
                  <div key={i} className={`agent-step step-${s.status}`}>
                    <span className="step-name">{s.name}</span>
                    <span className="step-detail">{s.detail}</span>
                    <span className="step-time">{s.time}</span>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      )}

      {step === 'review' && analysis && (
        <div className="review-grid">
          <div className="review-left">
            {previewUrl && <img src={previewUrl} alt="Issue" className="review-photo" />}
          </div>
          <div className="review-right">
            {analysis.analysisMode === 'demo' && (
              <div className="demo-label">⚠️ DEMO ANALYSIS — Not a live AI result</div>
            )}

            <div className="detail-card">
              <h3>Analysis</h3>
              <p><strong>Issue:</strong> {analysis.categoryLabel || analysis.issueType}</p>
              <p><strong>Severity:</strong> <span className={`severity severity-${analysis.severity}`}>{analysis.severity?.toUpperCase()}</span></p>
              <p><strong>Description:</strong> {analysis.description}</p>
              {analysis.observations && (
                <ul className="observations">
                  {analysis.observations.map((o, i) => <li key={i}>{o}</li>)}
                </ul>
              )}
            </div>

            {impact && (
              <div className="detail-card impact-card">
                <h3>📊 Civic Impact Score: <span className="impact-score">{impact.totalScore}/100</span></h3>
                <div className="impact-bar-container">
                  <div className="impact-bar" style={{ width: `${impact.totalScore}%` }}></div>
                </div>
                {impact.breakdown && Object.values(impact.breakdown).map((b, i) => (
                  <p key={i} className="impact-line">{b.label}: <strong>{b.score}/{b.max}</strong></p>
                ))}
                <p className="disclaimer">⚠️ Prototype estimate, not an official priority.</p>
              </div>
            )}

            {duplicates?.hasPossibleDuplicates && (
              <div className="detail-card duplicate-card">
                <h3>🔁 Possible Duplicates ({duplicates.count})</h3>
                {duplicates.duplicates.map((d, i) => (
                  <div key={i} className="dup-item">
                    <span className="dup-id">{d.ticketId}</span> — {d.issueType} in {d.areaName} ({d.status})
                  </div>
                ))}
                <p className="dup-note">You can still submit a separate report or add evidence to an existing one.</p>
              </div>
            )}

            <div className="form-group">
              <label>Area (correct if needed)</label>
              <input type="text" value={area} onChange={e => setArea(e.target.value)} />
            </div>

            <div className="btn-row">
              <button className="btn-secondary" onClick={() => setStep('upload')}>← Back</button>
              <button className="btn-primary btn-confirm" onClick={submitTicket} disabled={loading}>
                {loading ? '⏳ Submitting…' : '✅ Confirm & Submit'}
              </button>
            </div>
          </div>

          {agentSteps.length > 0 && (
            <div className="agent-panel">
              <h3>🤖 Agent Activity</h3>
              <div className="agent-steps">
                {agentSteps.map((s, i) => (
                  <div key={i} className={`agent-step step-${s.status}`}>
                    <span className="step-name">{s.name}</span>
                    <span className="step-detail">{s.detail}</span>
                    <span className="step-time">{s.time}</span>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      )}
    </section>
  );
}

/* ─── Receipt ─── */
function Receipt({ ticket, onDone, onTrack }) {
  if (!ticket) return null;
  return (
    <section className="receipt-section">
      <div className="receipt-card">
        <div className="receipt-icon">✅</div>
        <h2>Complaint Registered!</h2>
        <div className="ticket-id-box">{ticket.ticketId}</div>
        <div className="receipt-details">
          <p><strong>Issue:</strong> {ticket.categoryLabel || ticket.issueType}</p>
          <p><strong>Area:</strong> {ticket.areaName}</p>
          <p><strong>Ward:</strong> {ticket.wardName}</p>
          <p><strong>Department:</strong> {ticket.departmentName}</p>
          <p><strong>Status:</strong> <span className="status-badge">{ticket.status}</span></p>
          <p><strong>Impact Score:</strong> {ticket.impactScore}/100</p>
        </div>
        <p className="receipt-note">Save your ticket ID to track the status later.</p>
        <div className="btn-row">
          <button className="btn-secondary" onClick={onDone}>Home</button>
          <button className="btn-primary" onClick={onTrack}>Track Status</button>
        </div>
      </div>
    </section>
  );
}

/* ─── TrackStatus ─── */
function TrackStatus({ onDone }) {
  const [searchId, setSearchId] = useState('');
  const [result, setResult] = useState(null);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  const lookup = async () => {
    if (!searchId.trim()) { setError('Enter a ticket ID'); return; }
    setLoading(true);
    setError('');
    setResult(null);
    try {
      const res = await fetch(`/api/complaints/${encodeURIComponent(searchId.trim())}`);
      const data = await res.json();
      if (data.success) setResult(data.ticket);
      else setError(data.error || 'Ticket not found.');
    } catch (e) {
      setError(e.message);
    } finally {
      setLoading(false);
    }
  };

  return (
    <section className="track-section">
      <h2>🔍 Track Your Complaint</h2>
      <div className="track-search">
        <input type="text" placeholder="Enter Ticket ID (e.g. CIV-2026-0001)" value={searchId} onChange={(e) => setSearchId(e.target.value)} onKeyDown={e => e.key === 'Enter' && lookup()} />
        <button className="btn-primary" onClick={lookup} disabled={loading}>
          {loading ? '⏳' : 'Lookup'}
        </button>
      </div>

      {error && <div className="error-box">{error}</div>}

      {result && (
        <div className="status-card">
          <h3>{result.ticketId}</h3>
          <p><strong>Issue:</strong> {result.categoryLabel || result.issueType}</p>
          <p><strong>Area:</strong> {result.areaName}</p>
          <p><strong>Ward:</strong> {result.wardName}</p>
          <p><strong>Status:</strong> <span className={`status-badge status-${result.status?.toLowerCase().replace(/\s/g, '-')}`}>{result.status}</span></p>
          <p><strong>Last Updated:</strong> {new Date(result.updatedAt).toLocaleString()}</p>

          {result.statusHistory && result.statusHistory.length > 0 && (
            <div className="timeline">
              <h4>📋 Status Timeline</h4>
              {result.statusHistory.map((entry, i) => (
                <div key={i} className="timeline-entry">
                  <div className="timeline-dot"></div>
                  <div className="timeline-content">
                    <strong>{entry.status}</strong>
                    <span className="timeline-time">{new Date(entry.timestamp).toLocaleString()}</span>
                    {entry.note && <p className="timeline-note">{entry.note}</p>}
                    <span className="timeline-actor">{entry.actor}</span>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      <button className="btn-secondary" onClick={onDone} style={{ marginTop: '1rem' }}>← Back</button>
    </section>
  );
}

/* ─── AdminPanel ─── */
function AdminPanel({ onDone }) {
  const [complaints, setComplaints] = useState([]);
  const [stats, setStats] = useState(null);
  const [filterCat, setFilterCat] = useState('all');
  const [filterStatus, setFilterStatus] = useState('all');
  const [selected, setSelected] = useState(null);
  const [newStatus, setNewStatus] = useState('');
  const [note, setNote] = useState('');
  const [msg, setMsg] = useState('');
  const [loading, setLoading] = useState(false);

  const validTransitions = {
    'Submitted': ['Under Review', 'Rejected'],
    'Under Review': ['In Progress', 'Rejected'],
    'In Progress': ['Resolved'],
  };

  const fetchComplaints = async () => {
    setLoading(true);
    try {
      let url = '/api/complaints?';
      if (filterCat !== 'all') url += `category=${encodeURIComponent(filterCat)}&`;
      if (filterStatus !== 'all') url += `status=${encodeURIComponent(filterStatus)}`;
      const res = await fetch(url);
      const data = await res.json();
      setComplaints(data.complaints || []);
    } catch (e) {
      setMsg(e.message);
    } finally {
      setLoading(false);
    }
  };

  const fetchStats = async () => {
    try {
      const res = await fetch('/api/complaints');
      const data = await res.json();
      const all = data.complaints || [];
      setStats({
        total: all.length,
        submitted: all.filter(c => c.status === 'Submitted').length,
        underReview: all.filter(c => c.status === 'Under Review').length,
        inProgress: all.filter(c => c.status === 'In Progress').length,
        resolved: all.filter(c => c.status === 'Resolved').length,
        rejected: all.filter(c => c.status === 'Rejected').length,
      });
    } catch (e) { /* ignore */ }
  };

  useState(() => { fetchComplaints(); fetchStats(); });

  const updateStatus = async () => {
    if (!selected || !newStatus) { setMsg('Select a ticket and a new status.'); return; }
    setLoading(true);
    setMsg('');
    try {
      const res = await fetch(`/api/complaints/${selected.ticketId}/status`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ status: newStatus, note: note || undefined, actor: 'Admin (Demo)' })
      });
      const data = await res.json();
      if (data.success) {
        setMsg(`✅ ${selected.ticketId} updated to "${newStatus}"`);
        setSelected(data.ticket);
        setNewStatus('');
        setNote('');
        fetchComplaints();
        fetchStats();
      } else {
        setMsg(`❌ ${data.error || 'Update failed'}`);
      }
    } catch (e) { setMsg(e.message); }
    finally { setLoading(false); }
  };

  return (
    <section className="admin-section">
      <h2>🏢 Admin Dashboard <span className="demo-label-inline">(Demo)</span></h2>

      {stats && (
        <div className="stats-row">
          <div className="stat-card"><span className="stat-num">{stats.total}</span><span className="stat-label">Total</span></div>
          <div className="stat-card"><span className="stat-num">{stats.submitted}</span><span className="stat-label">Submitted</span></div>
          <div className="stat-card"><span className="stat-num">{stats.underReview}</span><span className="stat-label">Under Review</span></div>
          <div className="stat-card"><span className="stat-num">{stats.inProgress}</span><span className="stat-label">In Progress</span></div>
          <div className="stat-card stat-resolved"><span className="stat-num">{stats.resolved}</span><span className="stat-label">Resolved</span></div>
          <div className="stat-card stat-rejected"><span className="stat-num">{stats.rejected}</span><span className="stat-label">Rejected</span></div>
        </div>
      )}

      <div className="admin-filters">
        <select value={filterStatus} onChange={e => setFilterStatus(e.target.value)}>
          <option value="all">All Status</option>
          <option value="Submitted">Submitted</option>
          <option value="Under Review">Under Review</option>
          <option value="In Progress">In Progress</option>
          <option value="Resolved">Resolved</option>
          <option value="Rejected">Rejected</option>
        </select>
        <button className="btn-primary" onClick={fetchComplaints} disabled={loading}>Refresh</button>
      </div>

      {msg && <div className="msg-box">{msg}</div>}

      <div className="admin-grid">
        <div className="complaints-list">
          {complaints.length === 0 && <p className="empty-msg">No complaints found.</p>}
          {complaints.map(c => (
            <div key={c.ticketId} className={`complaint-row ${selected?.ticketId === c.ticketId ? 'selected' : ''}`} onClick={() => { setSelected(c); setNewStatus(''); setMsg(''); }}>
              <span className="complaint-id">{c.ticketId}</span>
              <span className="complaint-type">{c.issueType}</span>
              <span className="complaint-area">{c.areaName}</span>
              <span className={`status-badge status-${c.status?.toLowerCase().replace(/\s/g, '-')}`}>{c.status}</span>
            </div>
          ))}
        </div>

        {selected && (
          <div className="complaint-detail">
            <h3>{selected.ticketId}</h3>
            <p><strong>Issue:</strong> {selected.categoryLabel || selected.issueType}</p>
            <p><strong>Area:</strong> {selected.areaName}</p>
            <p><strong>Ward:</strong> {selected.wardName}</p>
            <p><strong>Department:</strong> {selected.departmentName}</p>
            <p><strong>Status:</strong> <span className={`status-badge status-${selected.status?.toLowerCase().replace(/\s/g, '-')}`}>{selected.status}</span></p>
            <p><strong>Impact:</strong> {selected.impactScore}/100</p>
            <p><strong>Description:</strong> {selected.description}</p>

            {selected.statusHistory && (
              <div className="timeline compact">
                {selected.statusHistory.map((entry, i) => (
                  <div key={i} className="timeline-entry">
                    <div className="timeline-dot"></div>
                    <div className="timeline-content">
                      <strong>{entry.status}</strong> <span className="timeline-time">{new Date(entry.timestamp).toLocaleString()}</span>
                      {entry.note && <p className="timeline-note">{entry.note}</p>}
                    </div>
                  </div>
                ))}
              </div>
            )}

            {validTransitions[selected.status] && (
              <div className="status-update-form">
                <h4>Update Status</h4>
                <select value={newStatus} onChange={e => setNewStatus(e.target.value)}>
                  <option value="">-- Select --</option>
                  {validTransitions[selected.status].map(s => (
                    <option key={s} value={s}>{s}</option>
                  ))}
                </select>
                <input type="text" placeholder="Optional note…" value={note} onChange={e => setNote(e.target.value)} />
                <button className="btn-primary" onClick={updateStatus} disabled={loading || !newStatus}>
                  {loading ? '⏳' : 'Update'}
                </button>
              </div>
            )}
          </div>
        )}
      </div>

      <button className="btn-secondary" onClick={onDone} style={{ marginTop: '1rem' }}>← Back</button>
    </section>
  );
}

export default App;
