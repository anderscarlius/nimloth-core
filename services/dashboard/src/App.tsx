import { Routes, Route, Navigate } from 'react-router-dom';
import Layout from './components/Layout';
import PatientSearch from './pages/PatientSearch';
import PatientOverview from './pages/PatientOverview';
import CdsAlerts from './pages/CdsAlerts';
import SystemStatus from './pages/SystemStatus';
import AuditLog from './pages/AuditLog';
import Topology from './pages/Topology';
import Mappings from './pages/Mappings';

export default function App() {
  return (
    <Layout>
      <Routes>
        <Route path="/" element={<Navigate to="/search" replace />} />
        <Route path="/search" element={<PatientSearch />} />
        <Route path="/patient/:pnr" element={<PatientOverview />} />
        <Route path="/patient/:pnr/cds" element={<CdsAlerts />} />
        <Route path="/system" element={<SystemStatus />} />
        <Route path="/topology" element={<Topology />} />
        <Route path="/mappings" element={<Mappings />} />
        <Route path="/audit" element={<AuditLog />} />
        <Route path="*" element={<Navigate to="/search" replace />} />
      </Routes>
    </Layout>
  );
}
