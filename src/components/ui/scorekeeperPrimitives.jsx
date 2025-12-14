function cx(...classes) {
  return classes.filter(Boolean).join(" ");
}

const cardVariants = {
  compact: "compact-card",
  compactMuted: "compact-card-muted",
};

const buttonVariants = {
  compact: "compact-button",
  compactGhost: "compact-button is-ghost",
};

export function ScorekeeperShell({ as: Component = "div", className = "", children, ...props }) {
  return (
    <Component className={cx("sc-shell w-full scorekeeper-compact text-black", className)} {...props}>
      {children}
    </Component>
  );
}

export function ScorekeeperCard({ as: Component = "div", variant = "compact", className = "", children, ...props }) {
  const variantClass = cardVariants[variant] || cardVariants.compact;
  return (
    <Component className={cx(variantClass, className)} {...props}>
      {children}
    </Component>
  );
}

export function ScorekeeperButton({
  as: Component = "button",
  variant = "compact",
  className = "",
  children,
  ...props
}) {
  const variantClass = buttonVariants[variant] || buttonVariants.compact;
  return (
    <Component className={cx(variantClass, className)} {...props}>
      {children}
    </Component>
  );
}
