import Link from "next/link";
import { APP_NAME_SUFFIX, APP_SHORT_NAME } from "@/lib/domain/constants";

type BrandMarkSize = "sm" | "md" | "lg";

export function BrandMark({ size = "md" }: { size?: BrandMarkSize }) {
  return (
    <span className={`brand-mark brand-mark--${size}`} aria-hidden="true">
      <span className="brand-mark-core">
        <span className="brand-mark-letters">TD</span>
        <span className="brand-mark-slash">/&gt;</span>
      </span>
    </span>
  );
}

export function BrandLockup({
  href = "/",
  light = false,
  compact = false,
  label,
}: {
  href?: string;
  light?: boolean;
  compact?: boolean;
  label?: string;
}) {
  const className = `brand${light ? " light" : ""}${compact ? " brand--compact" : ""}`;
  const content = (
    <>
      <BrandMark size={compact ? "sm" : "md"} />
      {!compact && (
        <span>
          <strong>{APP_SHORT_NAME}</strong>
          <small>{APP_NAME_SUFFIX}</small>
        </span>
      )}
    </>
  );

  if (href) {
    return (
      <Link href={href} className={className} aria-label={label ?? `${APP_SHORT_NAME} — início`}>
        {content}
      </Link>
    );
  }

  return <div className={className}>{content}</div>;
}
