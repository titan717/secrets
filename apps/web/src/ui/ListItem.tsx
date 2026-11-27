import type { ReactNode, MouseEventHandler } from "react";
import { ChevronRight } from "lucide-react";

export interface ListItemProps {
  icon?: ReactNode;
  leading?: ReactNode;
  title: ReactNode;
  subtitle?: ReactNode;
  value?: ReactNode;
  trailing?: ReactNode;
  chevron?: boolean;
  onClick?: MouseEventHandler;
  danger?: boolean;
  active?: boolean;
  className?: string;
  as?: "button" | "div";
}

export function ListItem({ icon, leading, title, subtitle, value, trailing, chevron, onClick, danger, active, className = "", as }: ListItemProps) {
  const Tag = (as ?? (onClick ? "button" : "div")) as "button";
  return (
    <Tag className={`list-item ${onClick ? "is-clickable" : ""} ${danger ? "is-danger" : ""} ${active ? "is-active" : ""} ${className}`} onClick={onClick} type={Tag === "button" ? "button" : undefined}>
      {icon && <span className="li-icon">{icon}</span>}
      {leading}
      <span className="li-body">
        <span className="li-title">{title}</span>
        {subtitle && <span className="li-sub">{subtitle}</span>}
      </span>
      {value && <span className="li-value">{value}</span>}
      {trailing}
      {chevron && <ChevronRight size={16} className="li-chevron" aria-hidden />}
    </Tag>
  );
}

export function ListGroup({ title, children, footer }: { title?: ReactNode; children: ReactNode; footer?: ReactNode }) {
  return (
    <section className="list-group">
      {title && <h3 className="list-group-title">{title}</h3>}
      <div className="list-group-body">{children}</div>
      {footer && <p className="list-group-footer">{footer}</p>}
    </section>
  );
}
