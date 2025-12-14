function cx(...classes) {
  return classes.filter(Boolean).join(" ");
}

const cardVariants = {
  base: "sc-card-base",
  muted: "sc-card-muted",
  frosted: "sc-card-base sc-frosted",
  light: "sc-surface-light",
  bordered: "rounded-2xl border border-border bg-surface",
};

const panelVariants = {
  default: "rounded-2xl border border-border bg-surface",
  muted: "rounded-2xl border border-border bg-surface-muted",
  dashed: "rounded-2xl border border-dashed border-border bg-surface",
  blank: "rounded-2xl border border-border",
  tinted: "rounded-2xl sc-panel",
  tintedAlt: "rounded-2xl sc-panel-alt",
  featured: "rounded-2xl sc-feature-panel",
  light: "rounded-2xl sc-surface-light border border-[#0b1f19]/20 text-[var(--sc-surface-light-ink)]",
};

const chipVariants = {
  default: "sc-chip",
  tag: "sc-tag",
  ghost: "sc-pill-ghost",
};

export function SectionShell({ as: Component = "section", className = "", children, ...props }) {
  return (
    <Component className={cx("sc-shell", className)} {...props}>
      {children}
    </Component>
  );
}

export function Card({ as: Component = "div", variant = "base", className = "", children, ...props }) {
  const variantClass = cardVariants[variant] || cardVariants.base;
  return (
    <Component className={cx(variantClass, className)} {...props}>
      {children}
    </Component>
  );
}

export function Panel({ as: Component = "div", variant = "default", className = "", children, ...props }) {
  const variantClass = panelVariants[variant] || panelVariants.default;
  return (
    <Component className={cx(variantClass, className)} {...props}>
      {children}
    </Component>
  );
}

export function Chip({ as: Component = "span", variant = "default", className = "", children, ...props }) {
  const variantClass = chipVariants[variant] || chipVariants.default;
  return (
    <Component className={cx(variantClass, className)} {...props}>
      {children}
    </Component>
  );
}

export function Metric({ as: Component = "div", className = "", value, label, children, ...props }) {
  return (
    <Component className={cx("sc-metric", className)} {...props}>
      {children ? (
        children
      ) : (
        <>
          <strong>{value}</strong>
          {label && <span className="text-sm text-ink-muted">{label}</span>}
        </>
      )}
    </Component>
  );
}

export function Field({
  as: Component = "label",
  label,
  hint,
  action,
  children,
  className = "",
  htmlFor,
  ...props
}) {
  const componentProps = { className: cx("sc-fieldset", className), ...props };
  if (Component === "label" && htmlFor) {
    componentProps.htmlFor = htmlFor;
  }
  return (
    <Component {...componentProps}>
      {(label || action) && (
        <div className="flex items-center justify-between gap-3">
          {label ? <span className="sc-field-label">{label}</span> : null}
          {action ? <div className="text-xs text-ink-muted">{action}</div> : null}
        </div>
      )}
      {hint ? <p className="sc-field-hint">{hint}</p> : null}
      {children}
    </Component>
  );
}

export function Input({ className = "", ...props }) {
  return <input className={cx("sc-input", className)} {...props} />;
}

export function Select({ className = "", children, ...props }) {
  return (
    <select className={cx("sc-input", className)} {...props}>
      {children}
    </select>
  );
}

export function Textarea({ className = "", ...props }) {
  return <textarea className={cx("sc-input", className)} {...props} />;
}

export function SectionHeader({
  eyebrow,
  eyebrowVariant = "default",
  title,
  description,
  action,
  children,
  className = "",
  divider = false,
}) {
  return (
    <div className={cx("flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between", divider && "border-b border-border pb-4", className)}>
      <div className="space-y-1">
        {eyebrow ? <Chip variant={eyebrowVariant}>{eyebrow}</Chip> : null}
        {title ? <h2 className="text-2xl font-semibold text-ink">{title}</h2> : null}
        {description ? <p className="text-sm text-ink-muted">{description}</p> : null}
        {children}
      </div>
      {action ? <div className="flex flex-wrap items-center gap-2">{action}</div> : null}
    </div>
  );
}
