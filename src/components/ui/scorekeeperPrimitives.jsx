import { useEffect, useRef } from "react";

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
  const wakeLockRef = useRef(null);

  useEffect(() => {
    let cancelled = false;

    const releaseWakeLock = async () => {
      const lock = wakeLockRef.current;
      wakeLockRef.current = null;
      if (!lock) return;
      try {
        await lock.release();
      } catch {
        // Ignore release failures.
      }
    };

    const requestWakeLock = async () => {
      if (cancelled) return;
      if (typeof navigator === "undefined") return;
      if (!("wakeLock" in navigator)) return;
      if (document.visibilityState !== "visible") return;
      try {
        const lock = await navigator.wakeLock.request("screen");
        if (cancelled) {
          try {
            await lock.release();
          } catch {
            // Ignore release failures during cleanup race.
          }
          return;
        }
        wakeLockRef.current = lock;
        lock.addEventListener("release", () => {
          if (wakeLockRef.current === lock) {
            wakeLockRef.current = null;
          }
        });
      } catch {
        // Ignore wake lock failures (unsupported/blocked/power-saving modes).
      }
    };

    const handleVisibilityChange = () => {
      if (document.visibilityState === "visible") {
        void requestWakeLock();
      } else {
        void releaseWakeLock();
      }
    };

    void requestWakeLock();
    document.addEventListener("visibilitychange", handleVisibilityChange);

    return () => {
      cancelled = true;
      document.removeEventListener("visibilitychange", handleVisibilityChange);
      void releaseWakeLock();
    };
  }, []);

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
