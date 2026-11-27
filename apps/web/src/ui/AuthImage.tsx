import { useEffect, useState, type ImgHTMLAttributes } from "react";
import { ImageOff } from "lucide-react";
import { resolveApiUrl } from "../config";
import { authedObjectUrl } from "../lib/media";

/** <img> for API-hosted files: tries the plain URL, then retries with the bearer token. */
export function AuthImage({ path, alt = "", ...rest }: { path: string } & Omit<ImgHTMLAttributes<HTMLImageElement>, "src">) {
  const [src, setSrc] = useState<string | undefined>(resolveApiUrl(path));
  const [stage, setStage] = useState<"direct" | "authed" | "failed">(/^(blob:|data:)/.test(path) ? "authed" : "direct");
  useEffect(() => {
    setSrc(resolveApiUrl(path));
    setStage(/^(blob:|data:)/.test(path) ? "authed" : "direct");
  }, [path]);
  if (stage === "failed")
    return (
      <span className="img-failed" style={rest.style}>
        <ImageOff size={20} />
      </span>
    );
  return (
    <img
      {...rest}
      src={src}
      alt={alt}
      loading="lazy"
      decoding="async"
      draggable={false}
      onError={() => {
        if (stage === "direct") {
          setStage("authed");
          authedObjectUrl(path).then(setSrc, () => setStage("failed"));
        } else setStage("failed");
      }}
    />
  );
}
