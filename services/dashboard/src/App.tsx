import { Routes, Route, Navigate } from 'react-router-dom';
import Layout from './components/Layout';
import PatientSearch from './pages/PatientSearch';
import PatientOverview from './pages/PatientOverview';
import CdsAlerts from './pages/CdsAlerts';
import SystemStatus from './pages/SystemStatus';
import AuditLog from './pages/AuditLog';
import Topology from './pages/Topology';
import Mappings from './pages/Mappings';
import ParityTrend from './pages/ParityTrend';
import ComposeDemo from './pages/ComposeDemo';
import MedReview from './pages/MedReview';

export default function App() {
  return (
    <Routes>
      {/* Compose-sandlådan kör utanför standard-Layout — egen full-höjd-vy (AC6 Q3). */}
      <Route path="/compose-demo" element={<ComposeDemo />} />
      {/* Fas 3 — AI-medicineringsgenomgång, egen full-höjd-vy. */}
      <Route path="/med-review" element={<MedReview />} />
      <Route
        path="*"
        element={
          <Layout>
            <Routes>
              <Route path="/" element={<Navigate to="/search" replace />} />
              <Route path="/search" element={<PatientSearch />} />
              <Route path="/patient/:pnr" element={<PatientOverview />} />
              <Route path="/patient/:pnr/cds" element={<CdsAlerts />} />
              <Route path="/system" element={<SystemStatus />} />
              <Route path="/topology" element={<Topology />} />
              <Route path="/mappings" element={<Mappings />} />
              <Route path="/parity" element={<ParityTrend />} />
              <Route path="/audit" element={<AuditLog />} />
              <Route path="*" element={<Navigate to="/search" replace />} />
            </Routes>
          </Layout>
        }
      />
    </Routes>
  );
}
