import { useState } from 'react';
import IntakeForm from './components/IntakeForm';
import StatusView from './components/StatusView';
import DepsGraph from './components/DepsGraph';

type Tab = 'intake' | 'status' | 'deps';

export default function App() {
  const [tab, setTab] = useState<Tab>('intake');

  return (
    <div className="app">
      <header>
        <h1>Smedjan-konsol</h1>
        <p className="subtitle">nimloth-core — lokalt, ingen inloggning, skriver direkt till din arbetskopia</p>
      </header>
      <nav className="tabs">
        <button className={tab === 'intake' ? 'active' : ''} onClick={() => setTab('intake')}>
          Nytt intag
        </button>
        <button className={tab === 'status' ? 'active' : ''} onClick={() => setTab('status')}>
          Status
        </button>
        <button className={tab === 'deps' ? 'active' : ''} onClick={() => setTab('deps')}>
          Beroenden
        </button>
      </nav>
      <main>
        {tab === 'intake' && <IntakeForm />}
        {tab === 'status' && <StatusView />}
        {tab === 'deps' && <DepsGraph />}
      </main>
    </div>
  );
}
