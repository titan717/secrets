export function LogoMark({ size = 28 }: { size?: number }) {
  return <img src="/logo-mark.png" width={size} height={size} alt="" className="logo-mark" draggable={false} />;
}
export function Wordmark({ size = 28 }: { size?: number }) {
  return (
    <span className="wordmark" aria-label="Secrets">
      <LogoMark size={size} />
      <span className="wordmark-text">SECRETS</span>
    </span>
  );
}
export function Ghost({ size = 120, className = "", float }: { size?: number; className?: string; float?: boolean }) {
  return <img src="/ghost.webp" width={size} height={Math.round(size * 1.06)} alt="" className={`ghost ${float ? "ghost-float" : ""} ${className}`} draggable={false} />;
}
