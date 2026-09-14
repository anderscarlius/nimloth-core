import { useEffect, useState } from 'react';
import ReactMarkdown from 'react-markdown';
import { fetchTree, fetchFile } from '../api';
import type { TreeResponse } from '../types';

function FileList({
  title,
  entries,
  onSelect,
  selected,
}: {
  title: string;
  entries: TreeResponse['spec'];
  onSelect: (path: string) => void;
  selected: string | null;
}) {
  const files = entries.filter((e) => !e.isDir);
  return (
    <div className="file-column">
      <h3>{title}</h3>
      {files.length === 0 && <p className="hint">Inget här ännu.</p>}
      <ul>
        {files.map((f) => (
          <li key={f.path}>
            <button
              className={f.path === selected ? 'file-link active' : 'file-link'}
              onClick={() => onSelect(f.path)}
            >
              {f.path}
            </button>
            {f.status && <span className="status-badge">{f.status}</span>}
          </li>
        ))}
      </ul>
    </div>
  );
}

export default function StatusView() {
  const [tree, setTree] = useState<TreeResponse | null>(null);
  const [selected, setSelected] = useState<string | null>(null);
  const [content, setContent] = useState<string>('');
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    fetchTree().then(setTree).catch((e) => setError(e.message));
  }, []);

  useEffect(() => {
    if (!selected) return;
    fetchFile(selected)
      .then(setContent)
      .catch((e) => setError(e.message));
  }, [selected]);

  if (error) return <p className="status-error">{error}</p>;
  if (!tree) return <p className="hint">Laddar…</p>;

  return (
    <div className="status-view">
      <div className="status-columns">
        <FileList title="Intag" entries={tree.intake} onSelect={setSelected} selected={selected} />
        <FileList title="Spec" entries={tree.spec} onSelect={setSelected} selected={selected} />
        <FileList title="Stories" entries={tree.stories} onSelect={setSelected} selected={selected} />
      </div>
      <div className="viewer">
        {selected ? (
          <>
            <div className="viewer-path">{selected}</div>
            <div className="markdown-body">
              <ReactMarkdown>{content}</ReactMarkdown>
            </div>
          </>
        ) : (
          <p className="hint">Klicka på en fil till vänster för att läsa den.</p>
        )}
      </div>
    </div>
  );
}
