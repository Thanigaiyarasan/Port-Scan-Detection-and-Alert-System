import { ArrowRight } from 'lucide-react';

const states = [
  { id: 'Q0', name: 'Initial', sub: 'Awaiting traffic', x: '5%' },
  { id: 'Q1', name: 'First attempt', sub: '1 unique port', x: '25%' },
  { id: 'Q2', name: 'Multiple ports', sub: '2–4 unique ports', x: '45%' },
  { id: 'Q3', name: 'Possible scan', sub: '5–9 ports / 10s', x: '65%' },
  { id: 'Q4', name: 'Confirmed', sub: '10+ ports / 10s', x: '85%' }
];

export default function StateDiagram({ currentState = 'Q0', compact = false }) {
  return (
    <div className={`state-diagram ${compact ? 'compact-diagram' : ''}`}>
      <div className="diagram-flow">
        {states.map((state, index) => (
          <div className="diagram-step-wrap" key={state.id}>
            <div className={`diagram-state ${currentState === state.id ? 'is-current' : ''} ${state.id === 'Q3' || state.id === 'Q4' ? 'is-risk' : ''}`}>
              <span className="state-id">{state.id}</span>
              <strong>{state.name}</strong>
              {!compact && <small>{state.sub}</small>}
            </div>
            {index < states.length - 1 && <div className="diagram-arrow"><span>{index === 0 ? 'new port' : index === 3 ? '10 unique' : 'new port'}</span><ArrowRight size={16} /></div>}
          </div>
        ))}
      </div>
      {!compact && <div className="diagram-footnote"><span><i className="legend-dot green" />Active state</span><span>Repeated port → remain in current state</span><span>10 s inactivity → reset Q0</span></div>}
    </div>
  );
}
