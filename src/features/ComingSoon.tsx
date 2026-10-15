import { Icon } from '../components/ui';

export function ComingSoon({ title, phase, lede, items }: { title: string; phase: string; lede: string; items: string[] }) {
  return (
    <div className="view">
      <div className="page">
        <div className="soon">
          <span className="phasechip">
            <Icon name="star" sm />
            Coming in {phase}
          </span>
          <h1 className="h1">{title}</h1>
          <p className="lede">{lede}</p>
          <div className="card" style={{ width: '100%', textAlign: 'left' }}>
            <div className="fl" style={{ marginBottom: 6 }}>
              What’s planned
            </div>
            <ul>
              {items.map((i) => (
                <li key={i}>{i}</li>
              ))}
            </ul>
          </div>
          <p className="muted small">Your tree, sources, photos and research all work now, without the internet.</p>
        </div>
      </div>
    </div>
  );
}
