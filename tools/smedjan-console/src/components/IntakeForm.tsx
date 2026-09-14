import { useState } from 'react';
import { submitIntake } from '../api';

export default function IntakeForm() {
  const [title, setTitle] = useState('');
  const [text, setText] = useState('');
  const [files, setFiles] = useState<File[]>([]);
  const [status, setStatus] = useState<{ kind: 'idle' | 'busy' | 'ok' | 'error'; message?: string }>({
    kind: 'idle',
  });

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!title.trim()) {
      setStatus({ kind: 'error', message: 'Titel krävs.' });
      return;
    }
    setStatus({ kind: 'busy' });
    try {
      const result = await submitIntake({ title, text, files });
      setStatus({ kind: 'ok', message: `Skapad: ${result.path}` });
      setTitle('');
      setText('');
      setFiles([]);
    } catch (err) {
      setStatus({ kind: 'error', message: (err as Error).message });
    }
  }

  return (
    <form className="intake-form" onSubmit={handleSubmit}>
      <p className="hint">
        Beskriv ett problem eller en lösning — fritext, eller bifoga PPT/bilder/PDF. Detta skapar en
        mapp under <code>intake/</code>. Det startar INGEN kodning automatiskt — nästa steg är
        spec-granskning (se <code>spec/README.md</code>).
      </p>

      <label>
        Titel (blir del av mappnamnet)
        <input
          type="text"
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          placeholder="t.ex. Kvalitetsregister-export för HbA1c"
        />
      </label>

      <label>
        Beskrivning (fritext)
        <textarea
          rows={8}
          value={text}
          onChange={(e) => setText(e.target.value)}
          placeholder="Klistra in eller skriv fritt — ingen struktur krävs här."
        />
      </label>

      <label>
        Bifogade filer (PPT, bilder, PDF, m.m.)
        <input
          type="file"
          multiple
          onChange={(e) => setFiles(Array.from(e.target.files ?? []))}
        />
      </label>
      {files.length > 0 && (
        <ul className="file-list">
          {files.map((f) => (
            <li key={f.name}>{f.name}</li>
          ))}
        </ul>
      )}

      <button type="submit" disabled={status.kind === 'busy'}>
        {status.kind === 'busy' ? 'Skapar…' : 'Skapa intag'}
      </button>

      {status.kind === 'ok' && <p className="status-ok">{status.message}</p>}
      {status.kind === 'error' && <p className="status-error">{status.message}</p>}
    </form>
  );
}
