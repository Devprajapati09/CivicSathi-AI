import { useState } from 'react';
import './index.css';

function App() {
  const [view, setView] = useState('home'); // home, report, receipt, track
  const [ticket, setTicket] = useState(null);

  const renderHome = () => (
    <section className="home">
      <h1 className="title">CivicSathi AI</h1>
      <p className="subtitle">Report civic issues in seconds – upload a photo, specify area, get a ticket.</p>
      <div className="actions">
        <button className="primary" onClick={() => setView('report')}>Report Issue</button>
        <button className="secondary" onClick={() => setView('track')}>Track Complaint</button>
      </div>
    </section>
  );

  const renderReport = () => (
    <ReportIssue onComplete={(data) => { setTicket(data); setView('receipt'); }} onCancel={() => setView('home')} />
  );

  const renderReceipt = () => (
    <Receipt ticket={ticket} onDone={() => setView('home')} />
  );

  const renderTrack = () => (
    <TrackStatus onDone={() => setView('home')} />
  );

  return (
    <div className="app-container">
      {view === 'home' && renderHome()}
      {view === 'report' && renderReport()}
      {view === 'receipt' && renderReceipt()}
      {view === 'track' && renderTrack()}
    </div>
  );
}

/*** ReportIssue Component ***/
function ReportIssue({ onComplete, onCancel }) {
  const [photo, setPhoto] = useState(null);
  const [previewUrl, setPreviewUrl] = useState('');
  const [area, setArea] = useState('');
  const [loading, setLoading] = useState(false);
  const [analysis, setAnalysis] = useState(null);
  const [error, setError] = useState('');

  const handlePhotoChange = (e) => {
    const file = e.target.files[0];
    if (file) {
      setPhoto(file);
      setPreviewUrl(URL.createObjectURL(file));
    }
  };

  const startAnalysis = async () => {
    if (!photo || !area) { setError('Please provide a photo and area name.'); return; }
    setLoading(true);
    setError('');
    try {
      const form = new FormData();
      form.append('photo', photo);
      form.append('area', area);
      const res = await fetch('/api/analyze', { method: 'POST', body: form });
      const data = await res.json();
      if (data.success) {
        setAnalysis(data.analysis);
      } else {
        setError(data.error || 'Analysis failed');
      }
    } catch (e) {
      setError(e.message);
    } finally { setLoading(false); }
  };

  const submitTicket = async () => {
    if (!analysis) { setError('Run analysis first.'); return; }
    setLoading(true);
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
      if (result.success) onComplete(result.ticket);
      else setError(result.error || 'Ticket creation failed');
    } catch (e) { setError(e.message); }
    finally { setLoading(false); }
  };

  return (
    <section className="report">
      <h2>Report Issue</h2>
      {error && <div className="error">{error}</div>}
      <div className="form-group">
        <label>Upload Photo</label>
        <input type="file" accept="image/*" onChange={handlePhotoChange} />
        {previewUrl && <img src={previewUrl} alt="preview" className="preview" />}
      </div>
      <div className="form-group">
        <label>Area / Location</label>
        <input type="text" placeholder="Enter area name" value={area} onChange={(e) => setArea(e.target.value)} />
      </div>
      <div className="actions">
        <button onClick={onCancel} className="secondary">Cancel</button>
        <button onClick={startAnalysis} className="primary" disabled={loading}>Analyze</button>
      </div>
      {analysis && (
        <div className="analysis">
          <h3>Analysis Result ({analysis.analysisMode === 'live' ? 'Live' : 'Demo'})</h3>
          <p><strong>Issue:</strong> {analysis.issueType} ({analysis.categoryLabel})</p>
          <p><strong>Severity:</strong> {analysis.severity}</p>
          <p><strong>Description:</strong> {analysis.description}</p>
          <button onClick={submitTicket} className="primary" disabled={loading}>Confirm & Submit</button>
        </div>
      )}
    </section>
  );
}

/*** Receipt Component ***/
function Receipt({ ticket, onDone }) {
  return (
    <section className="receipt">
      <h2>Complaint Submitted</h2>
      <p>Your ticket ID:</p>
      <div className="ticket-id">{ticket.ticketId}</div>
      <p>Issue: {ticket.issueType}</p>
      <p>Area: {ticket.areaName}</p>
      <p>Status: {ticket.status}</p>
      <button className="primary" onClick={onDone}>Done</button>
    </section>
  );
}

/*** TrackStatus Component ***/
function TrackStatus({ onDone }) {
  const [searchId, setSearchId] = useState('');
  const [result, setResult] = useState(null);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  const lookup = async () => {
    if (!searchId) { setError('Enter ticket ID'); return; }
    setLoading(true); setError('');
    try {
      const res = await fetch(`/api/complaints/${searchId}`);
      const data = await res.json();
      if (data.success) setResult(data.ticket);
      else setError(data.error || 'Not found');
    } catch (e) { setError(e.message); }
    finally { setLoading(false); }
  };

  return (
    <section className="track">
      <h2>Track Complaint</h2>
      {error && <div className="error">{error}</div>}
      <div className="form-group">
        <input type="text" placeholder="Ticket ID (e.g., CIV-2026-0001)" value={searchId} onChange={(e) => setSearchId(e.target.value)} />
        <button onClick={lookup} className="primary" disabled={loading}>Lookup</button>
      </div>
      {result && (
        <div className="status-box">
          <p><strong>ID:</strong> {result.ticketId}</p>
          <p><strong>Issue:</strong> {result.issueType}</p>
          <p><strong>Area:</strong> {result.areaName}</p>
          <p><strong>Status:</strong> {result.status}</p>
          <p><strong>Last Updated:</strong> {new Date(result.updatedAt).toLocaleString()}</p>
        </div>
      )}
      <button className="secondary" onClick={onDone}>Back</button>
    </section>
  );
}

export default App;
