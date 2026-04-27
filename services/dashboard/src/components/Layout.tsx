import { NavLink } from 'react-router-dom';
import type { ReactNode } from 'react';

const NAV = [
  { to: '/search', label: 'Patientsök', icon: '🔍' },
  { to: '/system', label: 'Systemstatus', icon: '📊' },
  { to: '/topology', label: 'Topologi', icon: '🕸️' },
  { to: '/mappings', label: 'Mappings', icon: '🤖' },
  { to: '/audit', label: 'Åtkomstlogg', icon: '🔒' },
];

export default function Layout({ children }: { children: ReactNode }) {
  return (
    <div className="flex h-full">
      <aside className="w-60 bg-core-navy text-white flex flex-col">
        <div className="px-4 py-6 border-b border-core-navy-2">
          <div className="text-xl font-bold text-core-teal">Nimloth Core</div>
          <div className="text-xs text-gray-400 mt-1">Distribuerad integrationshubb</div>
        </div>
        <nav className="flex-1 py-4">
          {NAV.map((n) => (
            <NavLink
              key={n.to}
              to={n.to}
              className={({ isActive }) =>
                `flex items-center gap-3 px-4 py-2.5 text-sm transition-colors ${
                  isActive
                    ? 'bg-core-teal text-white font-medium'
                    : 'text-gray-300 hover:bg-core-navy-2'
                }`
              }
            >
              <span>{n.icon}</span>
              <span>{n.label}</span>
            </NavLink>
          ))}
        </nav>
        <div className="px-4 py-3 text-xs text-gray-500 border-t border-core-navy-2">
          <div>Prompt 10 · Demo</div>
          <div className="mt-1">FHIR R4 · CDS Hooks 2.0</div>
        </div>
      </aside>
      <main className="flex-1 overflow-auto">{children}</main>
    </div>
  );
}
