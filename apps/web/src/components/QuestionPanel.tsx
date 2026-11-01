import React, { useState } from 'react';
import type { PlaybackManifestV1 } from '@brainrot/contracts';

type Question = PlaybackManifestV1['question'];

interface Props {
  question: Question;
  onAnswered: () => void;
}

export function QuestionPanel({ question, onAnswered }: Props): React.ReactElement {
  const [selected, setSelected] = useState<string | null>(null);
  const [submitted, setSubmitted] = useState(false);

  const handleSubmit = (): void => {
    if (!selected) return;
    setSubmitted(true);
    onAnswered();
  };

  const isCorrect = submitted && selected === question.correctChoiceId;

  return (
    <section className="question-panel" aria-labelledby="question-heading">
      <h3 id="question-heading" className="question-heading">
        Check your understanding
      </h3>
      <p className="question-text">{question.text}</p>

      <fieldset className="choices-group" disabled={submitted}>
        <legend className="sr-only">Choose an answer</legend>
        {question.choices.map((choice: { id: string; text: string }) => {
          const isSelectedCorrect = submitted && choice.id === question.correctChoiceId;
          const isSelectedWrong = submitted && choice.id === selected && choice.id !== question.correctChoiceId;

          return (
            <label
              key={choice.id}
              className={`choice-label ${selected === choice.id ? 'choice-label--selected' : ''} ${isSelectedCorrect ? 'choice-label--correct' : ''} ${isSelectedWrong ? 'choice-label--incorrect' : ''}`}
            >
              <input
                type="radio"
                name={`question-${question.id}`}
                value={choice.id}
                checked={selected === choice.id}
                onChange={() => setSelected(choice.id)}
                aria-describedby={submitted ? `feedback-${choice.id}` : undefined}
              />
              {' '}{choice.text}
              {isSelectedCorrect && (
                <span id={`feedback-${choice.id}`} className="choice-feedback choice-feedback--correct" aria-live="polite">
                  {' '}✓ Correct
                </span>
              )}
              {isSelectedWrong && (
                <span id={`feedback-${choice.id}`} className="choice-feedback choice-feedback--incorrect" aria-live="polite">
                  {' '}✗
                </span>
              )}
            </label>
          );
        })}
      </fieldset>

      {!submitted && (
        <button
          className="btn btn--primary"
          onClick={handleSubmit}
          disabled={!selected}
          aria-disabled={!selected}
        >
          Submit answer
        </button>
      )}

      {submitted && (
        <div
          className={`question-explanation ${isCorrect ? 'question-explanation--correct' : 'question-explanation--incorrect'}`}
          role="status"
          aria-live="assertive"
        >
          <strong>{isCorrect ? 'That\'s right!' : 'Not quite.'}</strong>{' '}
          {question.explanation}
        </div>
      )}
    </section>
  );
}
