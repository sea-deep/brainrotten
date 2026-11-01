import React from 'react';
import type { ManifestCitation } from '@brainrot/contracts';

interface Props {
  id: string;
  citations: ManifestCitation[];
  staleSourceIds: string[];
}

export function EvidenceDrawer({ id, citations, staleSourceIds }: Props): React.ReactElement {
  const staleSet = new Set(staleSourceIds);

  if (citations.length === 0) {
    return (
      <div id={id} className="evidence-drawer evidence-drawer--empty">
        <p>No source evidence attached to this lesson.</p>
      </div>
    );
  }

  return (
    <div id={id} className="evidence-drawer" role="region" aria-label="Source evidence">
      <h3 className="evidence-heading">Source evidence ({citations.length})</h3>
      <ul className="evidence-list" role="list">
        {citations.map((citation) => {
          const isStale = staleSet.has(citation.citationId);
          return (
            <li key={citation.citationId} className="evidence-item">
              <div className="evidence-meta">
                <span className="evidence-path" title={citation.path}>
                  📄 {citation.path}
                </span>
                {citation.symbol && (
                  <span className="evidence-symbol">⚙ {citation.symbol}</span>
                )}
                <span className="evidence-lines">
                  Lines {citation.startLine}–{citation.endLine}
                </span>
                <span
                  className={`evidence-hash ${isStale ? 'evidence-hash--stale' : ''}`}
                  title={`SHA-256: ${citation.contentHash}`}
                >
                  {isStale ? '⚠️ stale' : '✅ verified'} ({citation.contentHash.slice(0, 8)}…)
                </span>
                <span className={`evidence-status evidence-status--${citation.verificationStatus}`}>
                  {citation.verificationStatus}
                </span>
              </div>
              {citation.excerpt && (
                <pre className="evidence-excerpt">
                  <code>{/* Escaped — never execute or render as HTML */}{citation.excerpt}</code>
                </pre>
              )}
            </li>
          );
        })}
      </ul>
    </div>
  );
}
