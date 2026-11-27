import type { ReactNode } from "react";
import { ArrowLeft } from "lucide-react";
import { useNavigate } from "react-router-dom";
import { IconButton } from "../ui";

export function PageHeader({ title, subtitle, actions, back, className = "" }: { title: ReactNode; subtitle?: ReactNode; actions?: ReactNode; back?: string | boolean; className?: string }) {
  const nav = useNavigate();
  return (
    <header className={`page-header ${className}`}>
      {back && (
        <IconButton label="Back" onClick={() => (typeof back === "string" ? nav(back) : nav(-1))}>
          <ArrowLeft size={20} />
        </IconButton>
      )}
      <div className="grow">
        <h1 className="page-title">{title}</h1>
        {subtitle && <div className="page-sub">{subtitle}</div>}
      </div>
      {actions && <div className="row">{actions}</div>}
    </header>
  );
}
