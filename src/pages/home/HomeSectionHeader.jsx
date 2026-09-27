import { Link } from "react-router-dom";

/**
 * The one heading style every home section uses: a sentence-case h2, an
 * optional one-line explanation, and an optional "See all" route onward.
 */
export function HomeSectionHeader({ id, title, description, live = false, count, action }) {
  return (
    <div className="home-section-header">
      <div className="min-w-0">
        <h2 id={id} className="home-section-title">
          {live ? <span className="home-live-dot" aria-hidden="true" /> : null}
          {title}
          {typeof count === "number" && count > 0 ? <span className="home-section-count">{count}</span> : null}
        </h2>
        {description ? <p className="home-section-desc">{description}</p> : null}
      </div>
      {action ? (
        <Link to={action.to} className="home-see-all">
          {action.label}
          <span aria-hidden="true">→</span>
        </Link>
      ) : null}
    </div>
  );
}

export function HomeSkeleton({ rows = 3 }) {
  return (
    <div className="home-card home-skeleton" aria-busy="true" aria-label="Loading">
      {Array.from({ length: rows }, (_, index) => (
        <div key={index} className="home-skeleton__row">
          <span className="home-skeleton__bar is-short" />
          <span className="home-skeleton__bar" />
        </div>
      ))}
    </div>
  );
}

export function HomeNotice({ tone = "muted", children }) {
  return (
    <p className={`home-notice ${tone === "error" ? "is-error" : ""}`} role={tone === "error" ? "alert" : undefined}>
      {children}
    </p>
  );
}
