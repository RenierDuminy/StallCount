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
    "inline-flex h-7 w-7 cursor-pointer items-center justify-center transition hover:-translate-y-0.5 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-media";
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
      <img src="/youtube.png" alt="" className="h-[1.1rem] w-[1.1rem]" aria-hidden="true" />
    </span>
  );
}
