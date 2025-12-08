export function MatchMediaButton({ media, className }) {
  if (!media?.url) {
    return null;
  }

  const label = media.providerLabel || "Stream";

  const handleClick = (event) => {
    event.stopPropagation();
    if (typeof window !== "undefined") {
      window.open(media.url, "_blank", "noopener,noreferrer");
    }
  };

  const handleKeyDown = (event) => {
    if (event.key === "Enter" || event.key === " ") {
      event.preventDefault();
      handleClick(event);
    }
  };

  const baseClassName =
    "inline-flex h-7 w-7 cursor-pointer items-center justify-center rounded-full border border-slate-200 bg-white/70 text-slate-700 transition hover:-translate-y-0.5 hover:bg-white focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#ea4335]";
  const mergedClassName = className ? `${baseClassName} ${className}` : baseClassName;

  return (
    <span
      role="button"
      tabIndex={0}
      onClick={handleClick}
      onKeyDown={handleKeyDown}
      className={mergedClassName}
      title={`Watch on ${label}`}
      aria-label={`Watch on ${label}`}
    >
      <img src="/youtube.png" alt="" className="h-4 w-4" aria-hidden="true" />
    </span>
  );
}
