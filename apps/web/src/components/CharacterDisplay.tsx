import React from 'react';

interface Props {
  id: 'rookie' | 'debugger';
  active: boolean;
  mode: 'brainrot' | 'calm';
}

/**
 * Original SVG/CSS character placeholder.
 * No licensed characters, no external media URLs.
 */
export function CharacterDisplay({ id, active, mode }: Props): React.ReactElement {
  const isRookie = id === 'rookie';

  return (
    <div
      className={`character character--${id} ${active ? 'character--speaking' : ''} ${mode === 'calm' ? 'character--calm' : ''}`}
      aria-label={`${id} character${active ? ', speaking' : ''}`}
    >
      <svg
        className="character-avatar"
        viewBox="0 0 80 80"
        width="80"
        height="80"
        aria-hidden="true"
      >
        {/* Body */}
        <circle cx="40" cy="40" r="38" fill={isRookie ? '#6C63FF' : '#FF6B6B'} />
        {/* Face */}
        <circle cx="40" cy="35" r="18" fill="#fff" opacity="0.9" />
        {/* Eyes */}
        <circle cx="33" cy="32" r="3" fill={isRookie ? '#6C63FF' : '#FF6B6B'} />
        <circle cx="47" cy="32" r="3" fill={isRookie ? '#6C63FF' : '#FF6B6B'} />
        {/* Mouth — smile when active in brainrot, neutral otherwise */}
        {active && mode === 'brainrot' ? (
          <path d="M 32 42 Q 40 50 48 42" stroke={isRookie ? '#6C63FF' : '#FF6B6B'} strokeWidth="2.5" fill="none" />
        ) : (
          <line x1="33" y1="43" x2="47" y2="43" stroke={isRookie ? '#6C63FF' : '#FF6B6B'} strokeWidth="2" />
        )}
        {/* Speaking indicator */}
        {active && (
          <>
            <circle cx="65" cy="25" r="4" fill="#FFD700" opacity="0.9" />
            <circle cx="72" cy="18" r="2.5" fill="#FFD700" opacity="0.7" />
            <circle cx="76" cy="12" r="1.5" fill="#FFD700" opacity="0.5" />
          </>
        )}
        {/* Label badge */}
        <rect x="8" y="62" width="64" height="14" rx="7" fill="rgba(0,0,0,0.25)" />
        <text x="40" y="73" textAnchor="middle" fill="white" fontSize="9" fontFamily="system-ui, sans-serif">
          {isRookie ? 'rookie' : 'debugger'}
        </text>
      </svg>
    </div>
  );
}
